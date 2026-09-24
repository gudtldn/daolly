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
use crate::services::payments;
use crate::services::work_items::{self, DetailInput};
use crate::timestamp;

/// 한 접수의 최대 금액 (자릿수를 잘못 입력한 경우 방지)
pub const MAX_AMOUNT: i64 = 100_000_000;

/// 접수와 함께 받을 수 있는 결제 수단 (외상은 결제를 기록하지 않음)
const PAYMENT_METHODS: [&str; 3] = ["card", "cash", "transfer"];

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
        Some(p) => prepayment_amount(p, price)?.map(|amount| (p.method.clone(), amount)),
        None => None,
    };
    if customer::Entity::find_by_id(order.customer_id)
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
        payments::insert(&txn, inserted.id, amount, Some(method), None).await?;
    }

    let receipt = load_receipt(&txn, inserted.id).await?;
    txn.commit().await?;
    Ok(receipt)
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

/// 받을 금액. 전액을 받는데 청구 금액이 0원이면 기록할 결제가 없으므로 None
fn prepayment_amount(payment: &Prepayment, price: i64) -> Result<Option<i64>, AppError> {
    if !PAYMENT_METHODS.contains(&payment.method.as_str()) {
        return Err(invalid("결제 수단을 다시 선택해 주세요."));
    }
    match payment.amount {
        None if price == 0 => Ok(None),
        None => Ok(Some(price)),
        Some(amount) if amount <= 0 => Err(invalid("받은 금액은 0원보다 커야 합니다.")),
        Some(amount) if amount > price => Err(invalid(format!(
            "받은 금액({})이 청구 금액({})보다 많습니다.",
            won(amount),
            won(price)
        ))),
        Some(amount) => Ok(Some(amount)),
    }
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

/// 12000 → "12,000원"
fn won(amount: i64) -> String {
    let digits = amount.unsigned_abs().to_string();
    let mut out = String::new();
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(c);
    }
    let sign = if amount < 0 { "-" } else { "" };
    format!("{sign}{out}원")
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
            "받은 금액(30,000원)이 청구 금액(3,000원)보다 많습니다."
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

    #[test]
    fn formats_won() {
        assert_eq!(won(0), "0원");
        assert_eq!(won(3000), "3,000원");
        assert_eq!(won(100_000_000), "100,000,000원");
    }
}
