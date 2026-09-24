//! 접수 유스케이스
//!
//! 예전에는 화면이 접수 → 결제 커맨드를 따로 불러, 결제 저장이 실패하면 접수만 남고
//! (다시 누르면 중복 접수) 총액도 화면이 계산해 보낸 값을 그대로 저장했습니다.
//! 접수에 필요한 저장을 한 트랜잭션으로 처리하고, 총액은 품목으로 서버가 계산합니다.

use sea_orm::*;
use serde::Deserialize;

use crate::db::entities::{
    customer, payment, work_item, work_item::WorkItemStatus, work_item_detail,
};
use crate::error::AppError;
use crate::services::audit::{self, Entry};
use crate::services::payments::{self, won};
use crate::services::work_items::{self, DetailInput};
use crate::timestamp;

/// 한 접수의 최대 금액 (자릿수를 잘못 입력한 경우 방지)
pub const MAX_AMOUNT: i64 = 100_000_000;

/// 접수 요청
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiveOrder {
    /// 화면이 만든 요청 ID. 같은 ID로 다시 오면 새로 만들지 않고 처음 결과를 돌려줌
    pub request_id: String,
    pub customer_id: i32,
    /// None이면 품목으로 자동 생성
    pub description: Option<String>,
    pub note: Option<String>,
    /// 접수 일시 (저장 형식). None이면 지금
    pub received_at: Option<String>,
    pub lines: Vec<DetailInput>,
    /// 가격을 직접 정한 경우. None이면 품목 합계
    pub price_override: Option<i64>,
    /// 접수와 함께 받은 결제. None이면 외상
    pub payment: Option<Prepayment>,
    /// 처음 상태 (지난 접수를 나중에 입력할 때 완료/수령으로 등록). None이면 접수
    pub status: Option<WorkItemStatus>,
    /// 수령 일시 (저장 형식). 상태가 수령일 때만 쓰며 None이면 지금
    pub picked_up_at: Option<String>,
}

/// 접수와 함께 받은 결제
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Prepayment {
    /// "card" | "cash" | "transfer"
    pub method: String,
    /// None이면 전액
    pub amount: Option<i64>,
}

/// 저장된 접수와 품목, 결제
pub type Receipt = (
    work_item::Model,
    Vec<work_item_detail::Model>,
    Vec<payment::Model>,
);

/// 접수를 저장합니다. 품목과 결제까지 모두 저장되거나, 아무것도 저장되지 않습니다.
pub async fn receive<C>(db: &C, order: ReceiveOrder) -> Result<Receipt, AppError>
where
    C: ConnectionTrait + TransactionTrait,
{
    let request_id = order.request_id.trim();
    if request_id.is_empty() || request_id.len() > 100 {
        return Err(invalid(
            "접수 요청이 올바르지 않습니다. 화면을 새로 고친 뒤 다시 시도해 주세요.",
        ));
    }

    let txn = db.begin().await?;

    // 이미 처리한 요청 (두 번 누름, 저장됐지만 실패로 보인 뒤 다시 누름)이면 그때 결과를 돌려줌
    if let Some(existing) = work_item::Entity::find()
        .filter(work_item::Column::RequestId.eq(request_id))
        .one(&txn)
        .await?
    {
        let receipt = load_receipt(&txn, existing.id).await?;
        txn.commit().await?;
        return Ok(receipt);
    }

    // 저장 전에 모두 검증
    let total = lines_total(&order.lines)?;
    let price = match order.price_override {
        Some(price) => {
            check_amount(price)?;
            price
        }
        None if order.lines.is_empty() => {
            return Err(invalid(
                "품목을 하나 이상 넣거나 가격을 직접 입력해 주세요.",
            ));
        }
        None => total,
    };
    let status = order.status.unwrap_or(WorkItemStatus::Received);
    if order.picked_up_at.is_some() && status != WorkItemStatus::PickedUp {
        return Err(invalid("수령 일시는 '수령' 상태일 때만 정할 수 있습니다."));
    }
    let payment = match &order.payment {
        Some(p) => prepayment(p, price)?,
        None => None,
    };
    if customer::Entity::find_by_id(order.customer_id)
        .filter(customer::Column::DeletedAt.is_null())
        .one(&txn)
        .await?
        .is_none()
    {
        return Err(AppError::NotFound("고객"));
    }

    let now = timestamp::now();
    let (completed_at, picked_up_at) = match status {
        WorkItemStatus::Received => (None, None),
        WorkItemStatus::Completed => (Some(now.clone()), None),
        WorkItemStatus::PickedUp => (None, Some(order.picked_up_at.unwrap_or(now.clone()))),
    };
    let description = order
        .description
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| work_items::build_description(&order.lines));
    let note = order
        .note
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty());

    let inserted = work_item::Entity::insert(work_item::ActiveModel {
        customer_id: Set(order.customer_id),
        status: Set(status),
        description: Set(Some(description)),
        price: Set(price),
        paid_amount: Set(0),
        note: Set(note),
        received_at: Set(order.received_at.unwrap_or(now.clone())),
        completed_at: Set(completed_at),
        picked_up_at: Set(picked_up_at),
        created_at: Set(now.clone()),
        last_modified_at: Set(now),
        request_id: Set(Some(request_id.to_owned())),
        ..Default::default()
    })
    .exec_with_returning(&txn)
    .await?;

    work_items::insert_details(&txn, inserted.id, order.lines).await?;
    if let Some((method, amount)) = payment {
        payments::insert(&txn, inserted.id, amount, method, None).await?;
    }

    let receipt = load_receipt(&txn, inserted.id).await?;
    txn.commit().await?;
    Ok(receipt)
}

/// 접수 수정 요청 (고객관리의 수정 화면). None인 값은 바꾸지 않습니다.
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AmendOrder {
    pub description: Option<String>,
    /// 빈 문자열이면 메모 지우기
    pub note: Option<String>,
    /// 접수 일시 (저장 형식)
    pub received_at: Option<String>,
    /// 수령 일시 (저장 형식). 상태가 수령일 때만 씀
    pub picked_up_at: Option<String>,
    /// 품목 전체. 보내면 기존 품목을 모두 바꿈
    pub lines: Option<Vec<DetailInput>>,
    /// 가격을 직접 정한 경우. None이면 품목 합계 (품목도 보내지 않으면 그대로)
    pub price_override: Option<i64>,
    pub status: Option<WorkItemStatus>,
}

/// 접수의 상태·내용·품목을 한 번에 고칩니다. (예전에는 세 번 나눠 저장해 중간에 실패하면
/// 가격과 품목이 어긋났음) 이미 받은 금액보다 낮은 가격으로는 고칠 수 없습니다.
pub async fn amend<C>(db: &C, id: i32, amendment: AmendOrder) -> Result<Receipt, AppError>
where
    C: ConnectionTrait + TransactionTrait,
{
    let txn = db.begin().await?;
    let current = find_order(&txn, id).await?;

    let price = match (&amendment.lines, amendment.price_override) {
        (lines, Some(price)) => {
            if let Some(lines) = lines {
                lines_total(lines)?;
            }
            check_amount(price)?;
            price
        }
        (Some(lines), None) if lines.is_empty() => {
            return Err(invalid(
                "품목을 하나 이상 넣거나 가격을 직접 입력해 주세요.",
            ));
        }
        (Some(lines), None) => lines_total(lines)?,
        (None, None) => current.price,
    };
    if price < current.paid_amount {
        return Err(invalid(format!(
            "이미 받은 금액({})보다 낮게 고칠 수 없습니다. 결제 관리에서 결제를 먼저 고쳐 주세요.",
            won(current.paid_amount)
        )));
    }

    let now = timestamp::now();
    let mut active: work_item::ActiveModel = current.clone().into();
    if let Some(description) = amendment.description {
        let description = description.trim();
        if description.is_empty() {
            return Err(invalid("작업 내용을 입력해 주세요."));
        }
        active.description = Set(Some(description.to_owned()));
    }
    if let Some(note) = amendment.note {
        let note = note.trim();
        active.note = Set((!note.is_empty()).then(|| note.to_owned()));
    }
    if let Some(received_at) = amendment.received_at {
        active.received_at = Set(received_at);
    }
    let status = amendment.status.unwrap_or_else(|| current.status.clone());
    apply_status(&mut active, &current, status, amendment.picked_up_at, &now)?;
    if price != current.price {
        audit::record(
            &txn,
            Entry::OrderRepriced {
                order: &current,
                new_price: price,
            },
        )
        .await?;
    }
    active.price = Set(price);
    active.last_modified_at = Set(now);
    active.update(&txn).await?;

    if let Some(lines) = amendment.lines {
        work_item_detail::Entity::delete_many()
            .filter(work_item_detail::Column::WorkItemId.eq(id))
            .exec(&txn)
            .await?;
        work_items::insert_details(&txn, id, lines).await?;
    }

    let receipt = load_receipt(&txn, id).await?;
    txn.commit().await?;
    Ok(receipt)
}

/// 상태만 바꿉니다. (목록에서 바로 완료·수령 처리)
pub async fn change_status<C: ConnectionTrait>(
    db: &C,
    id: i32,
    status: WorkItemStatus,
) -> Result<work_item::Model, AppError> {
    let current = find_order(db, id).await?;
    if current.status == status {
        return Ok(current);
    }
    let now = timestamp::now();
    let mut active: work_item::ActiveModel = current.clone().into();
    apply_status(&mut active, &current, status, None, &now)?;
    active.last_modified_at = Set(now);
    Ok(active.update(db).await?)
}

/// 접수를 취소합니다. 받은 결제도 함께 취소되어 매출에서 빠지고, 기록은 남습니다.
/// (예전에는 행을 지워 결제 기록까지 사라졌음)
pub async fn cancel<C>(db: &C, id: i32) -> Result<(), AppError>
where
    C: ConnectionTrait + TransactionTrait,
{
    let txn = db.begin().await?;
    let order = find_order(&txn, id).await?;
    let voided = payment::Entity::find()
        .filter(payment::Column::WorkItemId.eq(id))
        .filter(payment::Column::VoidedAt.is_null())
        .all(&txn)
        .await?;
    for p in &voided {
        payments::void(&txn, p).await?;
    }
    payments::sync_paid_amount(&txn, id).await?;

    let now = timestamp::now();
    let mut active: work_item::ActiveModel = order.clone().into();
    active.deleted_at = Set(Some(now.clone()));
    active.last_modified_at = Set(now);
    active.update(&txn).await?;
    audit::record(
        &txn,
        Entry::OrderCancelled {
            order: &order,
            voided: &voided,
        },
    )
    .await?;
    txn.commit().await?;
    Ok(())
}

/// 취소하지 않은 접수
async fn find_order<C: ConnectionTrait>(conn: &C, id: i32) -> Result<work_item::Model, AppError> {
    work_item::Entity::find_by_id(id)
        .filter(work_item::Column::DeletedAt.is_null())
        .one(conn)
        .await?
        .ok_or(AppError::NotFound("접수"))
}

/// 상태를 바꾸고 완료·수령 일시를 상태에 맞춥니다.
/// - 접수: 완료·수령 일시 없음
/// - 완료: 완료 일시 (이미 있으면 유지), 수령 일시 없음
/// - 수령: 수령 일시 (지정한 값 → 기존 값 → 지금 순)
fn apply_status(
    active: &mut work_item::ActiveModel,
    current: &work_item::Model,
    status: WorkItemStatus,
    picked_up_at: Option<String>,
    now: &str,
) -> Result<(), AppError> {
    let picked_up_at = picked_up_at.filter(|s| !s.is_empty());
    if picked_up_at.is_some() && status != WorkItemStatus::PickedUp {
        return Err(invalid("수령 일시는 '수령' 상태일 때만 정할 수 있습니다."));
    }
    match status {
        WorkItemStatus::Received => {
            active.completed_at = Set(None);
            active.picked_up_at = Set(None);
        }
        WorkItemStatus::Completed => {
            let completed_at = current
                .completed_at
                .clone()
                .unwrap_or_else(|| now.to_owned());
            active.completed_at = Set(Some(completed_at));
            active.picked_up_at = Set(None);
        }
        WorkItemStatus::PickedUp => {
            let at = picked_up_at
                .or_else(|| current.picked_up_at.clone())
                .unwrap_or_else(|| now.to_owned());
            active.picked_up_at = Set(Some(at));
        }
    }
    active.status = Set(status);
    Ok(())
}

/// 품목을 검증하고 합계를 계산합니다.
pub fn lines_total(lines: &[DetailInput]) -> Result<i64, AppError> {
    let mut total: i64 = 0;
    for (i, line) in lines.iter().enumerate() {
        let name = line.item_name.trim();
        if name.is_empty() {
            return Err(invalid(format!(
                "{}번째 품목의 이름이 비어 있습니다.",
                i + 1
            )));
        }
        if line.unit_price < 0 {
            return Err(invalid(format!("'{name}'의 단가는 0원 이상이어야 합니다.")));
        }
        if line.quantity < 1 {
            return Err(invalid(format!("'{name}'의 수량은 1 이상이어야 합니다.")));
        }
        total = line
            .unit_price
            .checked_mul(i64::from(line.quantity))
            .and_then(|amount| total.checked_add(amount))
            .ok_or_else(too_large)?;
    }
    check_amount(total)?;
    Ok(total)
}

/// 선결제의 수단과 금액. 전액을 받는데 청구 금액이 0원이면 기록할 결제가 없으므로 None
fn prepayment(payment: &Prepayment, price: i64) -> Result<Option<(&'static str, i64)>, AppError> {
    let method = payments::normalize_method(Some(&payment.method))?;
    let amount = match payment.amount {
        None if price == 0 => return Ok(None),
        None => price,
        Some(amount) if amount <= 0 => {
            return Err(invalid("받은 금액은 0원보다 커야 합니다."));
        }
        Some(amount) => amount,
    };
    payments::check_not_overpaid(price, amount)?;
    Ok(Some((method, amount)))
}

async fn load_receipt<C: ConnectionTrait>(conn: &C, id: i32) -> Result<Receipt, AppError> {
    work_items::get_full(conn, id)
        .await?
        .ok_or(AppError::NotFound("접수"))
}

fn check_amount(amount: i64) -> Result<(), AppError> {
    if amount < 0 {
        return Err(invalid("가격은 0원 이상이어야 합니다."));
    }
    if amount > MAX_AMOUNT {
        return Err(too_large());
    }
    Ok(())
}

fn too_large() -> AppError {
    invalid(format!(
        "금액이 너무 큽니다. {} 이하로 입력해 주세요.",
        won(MAX_AMOUNT)
    ))
}

fn invalid(message: impl Into<String>) -> AppError {
    AppError::Validation(message.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorCode;
    use crate::services::customers;
    use crate::test_helpers::setup_test_db;

    fn line(name: &str, unit_price: i64, quantity: i32) -> DetailInput {
        DetailInput {
            price_item_id: None,
            item_name: name.into(),
            unit_price,
            quantity,
            options_memo: None,
        }
    }

    fn order(customer_id: i32, lines: Vec<DetailInput>) -> ReceiveOrder {
        ReceiveOrder {
            request_id: "req-1".into(),
            customer_id,
            description: None,
            note: None,
            received_at: None,
            lines,
            price_override: None,
            payment: None,
            status: None,
            picked_up_at: None,
        }
    }

    fn paid_by(method: &str) -> Option<Prepayment> {
        Some(Prepayment {
            method: method.into(),
            amount: None,
        })
    }

    async fn setup() -> (DatabaseConnection, i32) {
        let db = setup_test_db().await.unwrap();
        let cid = customers::create(&db, "고객".into(), None, None)
            .await
            .unwrap()
            .id;
        (db, cid)
    }

    async fn count(db: &DatabaseConnection, table: &str) -> i64 {
        db.query_one(Statement::from_string(
            DbBackend::Sqlite,
            format!("SELECT COUNT(*) FROM {table}"),
        ))
        .await
        .unwrap()
        .unwrap()
        .try_get_by_index(0)
        .unwrap()
    }

    #[tokio::test]
    async fn receives_order_and_prepayment_together() {
        let (db, cid) = setup().await;
        let mut o = order(cid, vec![line("와이셔츠", 3000, 2), line("바지", 4000, 1)]);
        o.payment = paid_by("card");

        let (wi, details, payments) = receive(&db, o).await.unwrap();

        assert_eq!(wi.price, 10000);
        assert_eq!(wi.paid_amount, 10000);
        assert_eq!(wi.description.as_deref(), Some("와이셔츠, 바지"));
        assert_eq!(details.len(), 2);
        assert_eq!(payments.len(), 1);
        assert_eq!(payments[0].amount, 10000);
        assert_eq!(payments[0].method.as_deref(), Some("card"));
    }

    /// V11: 음수 단가·0 수량은 거부하고, 총액은 품목으로 계산
    #[tokio::test]
    async fn rejects_invalid_lines() {
        let (db, cid) = setup().await;
        for lines in [
            vec![line("와이셔츠", -3000, 1)],
            vec![line("와이셔츠", 3000, 0)],
            vec![line(" ", 3000, 1)],
            vec![line("와이셔츠", MAX_AMOUNT, 2)],
        ] {
            let err = receive(&db, order(cid, lines)).await.unwrap_err();
            assert_eq!(err.code(), ErrorCode::Validation, "{err}");
        }
        assert_eq!(count(&db, "work_items").await, 0);

        let err = receive(&db, order(cid, vec![])).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::Validation);
    }

    /// 두 번 눌러도(같은 요청 ID) 접수와 결제는 한 번만
    #[tokio::test]
    async fn same_request_is_received_once() {
        let (db, cid) = setup().await;
        let mut o = order(cid, vec![line("와이셔츠", 3000, 1)]);
        o.payment = paid_by("cash");

        let first = receive(&db, o.clone()).await.unwrap();
        let second = receive(&db, o).await.unwrap();

        assert_eq!(first.0.id, second.0.id);
        assert_eq!(count(&db, "work_items").await, 1);
        assert_eq!(count(&db, "payments").await, 1);
    }

    /// 결제 저장이 실패하면 접수도 남지 않음 (예전에는 접수만 남아 다시 누르면 중복 접수)
    #[tokio::test]
    async fn failed_payment_leaves_nothing() {
        let (db, cid) = setup().await;
        db.execute_unprepared(
            "CREATE TRIGGER fail_payment BEFORE INSERT ON payments
             BEGIN SELECT RAISE(ABORT, 'disk full'); END",
        )
        .await
        .unwrap();
        let mut o = order(cid, vec![line("와이셔츠", 3000, 1)]);
        o.payment = paid_by("card");

        assert!(receive(&db, o).await.is_err());
        assert_eq!(count(&db, "work_items").await, 0);
        assert_eq!(count(&db, "work_item_details").await, 0);
    }

    #[tokio::test]
    async fn validates_payment_and_customer() {
        let (db, cid) = setup().await;
        let lines = vec![line("와이셔츠", 3000, 1)];

        let mut over = order(cid, lines.clone());
        over.payment = Some(Prepayment {
            method: "cash".into(),
            amount: Some(30000),
        });
        let err = receive(&db, over).await.unwrap_err();
        assert_eq!(
            err.to_string(),
            "받은 금액이 청구 금액보다 많아집니다. (청구 3,000원, 받은 금액 30,000원)"
        );

        let mut credit = order(cid, lines.clone());
        credit.payment = paid_by("credit");
        assert_eq!(
            receive(&db, credit).await.unwrap_err().code(),
            ErrorCode::Validation
        );

        let err = receive(&db, order(999, lines)).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(count(&db, "work_items").await, 0);
    }

    /// 고객관리에서 지난 접수를 입력: 직접 정한 가격, 처음 상태와 수령 일시
    #[tokio::test]
    async fn manual_price_and_initial_status() {
        let (db, cid) = setup().await;
        let mut o = order(cid, vec![]);
        o.description = Some("수선".into());
        o.price_override = Some(5000);
        o.status = Some(WorkItemStatus::PickedUp);
        o.picked_up_at = Some("2026-09-20T01:00:00.000Z".into());

        let (wi, details, _) = receive(&db, o).await.unwrap();
        assert_eq!(wi.price, 5000);
        assert_eq!(wi.status, WorkItemStatus::PickedUp);
        assert_eq!(wi.picked_up_at.as_deref(), Some("2026-09-20T01:00:00.000Z"));
        assert!(details.is_empty());

        let mut done = order(cid, vec![line("바지", 4000, 1)]);
        done.request_id = "req-2".into();
        done.status = Some(WorkItemStatus::Completed);
        let (wi, _, _) = receive(&db, done).await.unwrap();
        assert!(wi.completed_at.is_some());

        let mut wrong = order(cid, vec![line("바지", 4000, 1)]);
        wrong.request_id = "req-3".into();
        wrong.picked_up_at = Some("2026-09-20T01:00:00.000Z".into());
        assert_eq!(
            receive(&db, wrong).await.unwrap_err().code(),
            ErrorCode::Validation
        );
    }

    /// 화면(cartStore, WorkItemFormCard)이 보내는 모양 그대로 받을 수 있어야 함
    #[test]
    fn accepts_frontend_payload() {
        let order: ReceiveOrder = serde_json::from_value(serde_json::json!({
            "requestId": "5f0c",
            "customerId": 1,
            "note": null,
            "lines": [{
                "priceItemId": 3, "itemName": "와이셔츠", "unitPrice": 3000,
                "quantity": 2, "optionsMemo": null
            }],
            "payment": { "method": "card" },
            "status": "PickedUp",
            "pickedUpAt": "2026-09-24T11:00:00.000Z"
        }))
        .unwrap();
        assert_eq!(order.lines[0].price_item_id, Some(3));
        assert!(order.description.is_none() && order.price_override.is_none());
        assert_eq!(order.payment.unwrap().amount, None);
        assert_eq!(order.status, Some(WorkItemStatus::PickedUp));
    }

    async fn received(db: &DatabaseConnection, cid: i32, paid: bool) -> work_item::Model {
        let mut o = order(cid, vec![line("와이셔츠", 3000, 2), line("바지", 4000, 1)]);
        o.lines[0].price_item_id = Some(1);
        if paid {
            o.payment = paid_by("cash");
        }
        receive(db, o).await.unwrap().0
    }

    fn amendment() -> AmendOrder {
        AmendOrder {
            description: None,
            note: None,
            received_at: None,
            picked_up_at: None,
            lines: None,
            price_override: None,
            status: None,
        }
    }

    /// 상태·내용·품목을 한 번에 저장하고, 품목의 단가표 연결(price_item_id)을 유지
    #[tokio::test]
    async fn amend_saves_all_at_once() {
        let (db, cid) = setup().await;
        let wi = received(&db, cid, false).await;

        let mut a = amendment();
        a.note = Some("얼룩 주의".into());
        a.status = Some(WorkItemStatus::Completed);
        let mut shirt = line("와이셔츠", 3000, 3);
        shirt.price_item_id = Some(1);
        a.lines = Some(vec![shirt]);

        let (updated, details, _) = amend(&db, wi.id, a).await.unwrap();
        assert_eq!(updated.price, 9000);
        assert_eq!(updated.note.as_deref(), Some("얼룩 주의"));
        assert_eq!(updated.status, WorkItemStatus::Completed);
        assert!(updated.completed_at.is_some());
        assert_eq!(details.len(), 1);
        assert_eq!(details[0].price_item_id, Some(1));
        assert_eq!(audit::actions(&db).await, vec!["order.reprice"]);
    }

    /// 접수 취소: 목록·상세에서 빠지고 받은 결제도 함께 취소되며, 기록은 남음
    #[tokio::test]
    async fn cancel_keeps_record() {
        let (db, cid) = setup().await;
        let wi = received(&db, cid, true).await;

        cancel(&db, wi.id).await.unwrap();

        assert!(work_items::get_full(&db, wi.id).await.unwrap().is_none());
        assert!(
            work_items::list(&db, Some(cid), None)
                .await
                .unwrap()
                .is_empty()
        );
        assert_eq!(count(&db, "work_items").await, 1);
        assert_eq!(count(&db, "payments WHERE voided_at IS NOT NULL").await, 1);
        assert_eq!(audit::actions(&db).await, vec!["order.cancel"]);

        // 취소한 접수는 고치거나 다시 취소할 수 없음
        assert_eq!(
            cancel(&db, wi.id).await.unwrap_err().code(),
            ErrorCode::NotFound
        );
        assert_eq!(
            amend(&db, wi.id, amendment()).await.unwrap_err().code(),
            ErrorCode::NotFound
        );
    }

    /// V6: 이미 받은 금액보다 낮은 가격으로는 고칠 수 없음 (아무것도 바뀌지 않음)
    #[tokio::test]
    async fn amend_rejects_price_below_paid() {
        let (db, cid) = setup().await;
        let wi = received(&db, cid, true).await; // 10,000원 전액 결제

        let mut a = amendment();
        a.lines = Some(vec![line("와이셔츠", 3000, 1)]);
        a.note = Some("바뀌면 안 됨".into());
        let err = amend(&db, wi.id, a).await.unwrap_err();
        assert!(
            err.to_string()
                .starts_with("이미 받은 금액(10,000원)보다 낮게")
        );

        let mut override_price = amendment();
        override_price.price_override = Some(9000);
        assert!(amend(&db, wi.id, override_price).await.is_err());

        let (same, details, _) = work_items::get_full(&db, wi.id).await.unwrap().unwrap();
        assert_eq!(same.price, 10000);
        assert_eq!(same.note, None);
        assert_eq!(details.len(), 2);
    }

    /// 품목 저장이 실패하면 가격·메모도 바뀌지 않음 (예전에는 따로 저장해 가격과 품목이 어긋남)
    #[tokio::test]
    async fn failed_amend_changes_nothing() {
        let (db, cid) = setup().await;
        let wi = received(&db, cid, false).await;
        db.execute_unprepared(
            "CREATE TRIGGER fail_detail BEFORE INSERT ON work_item_details
             BEGIN SELECT RAISE(ABORT, 'disk full'); END",
        )
        .await
        .unwrap();

        let mut a = amendment();
        a.lines = Some(vec![line("코트", 15000, 1)]);
        a.note = Some("메모".into());
        assert!(amend(&db, wi.id, a).await.is_err());

        let (same, details, _) = work_items::get_full(&db, wi.id).await.unwrap().unwrap();
        assert_eq!(same.price, 10000);
        assert_eq!(same.note, None);
        assert_eq!(details.len(), 2);
    }

    /// 수령 일시는 '수령' 상태일 때만 있고, 상태를 되돌리면 지워짐
    #[tokio::test]
    async fn status_rules() {
        let (db, cid) = setup().await;
        let wi = received(&db, cid, false).await;

        let mut a = amendment();
        a.status = Some(WorkItemStatus::PickedUp);
        a.picked_up_at = Some("2026-09-24T09:00:00.000Z".into());
        let (picked, _, _) = amend(&db, wi.id, a).await.unwrap();
        assert_eq!(
            picked.picked_up_at.as_deref(),
            Some("2026-09-24T09:00:00.000Z")
        );

        // 다른 내용만 고치면 수령 일시 유지
        let mut note_only = amendment();
        note_only.note = Some("메모".into());
        let (kept, _, _) = amend(&db, wi.id, note_only).await.unwrap();
        assert_eq!(kept.picked_up_at, picked.picked_up_at);

        let back = change_status(&db, wi.id, WorkItemStatus::Received)
            .await
            .unwrap();
        assert_eq!(back.completed_at, None);
        assert_eq!(back.picked_up_at, None);

        let mut wrong = amendment();
        wrong.status = Some(WorkItemStatus::Completed);
        wrong.picked_up_at = Some("2026-09-24T09:00:00.000Z".into());
        assert_eq!(
            amend(&db, wi.id, wrong).await.unwrap_err().code(),
            ErrorCode::Validation
        );

        let done = change_status(&db, wi.id, WorkItemStatus::Completed)
            .await
            .unwrap();
        let again = change_status(&db, wi.id, WorkItemStatus::Completed)
            .await
            .unwrap();
        assert_eq!(again.completed_at, done.completed_at);
    }
}
