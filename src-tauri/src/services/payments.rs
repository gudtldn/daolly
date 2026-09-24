use sea_orm::*;
use serde::Serialize;

use crate::db::entities::{customer, payment, work_item};
use crate::error::AppError;
use crate::timestamp;

pub async fn list(
    db: &DatabaseConnection,
    work_item_id: i32,
) -> Result<Vec<payment::Model>, DbErr> {
    payment::Entity::find()
        .filter(payment::Column::WorkItemId.eq(work_item_id))
        .order_by_asc(payment::Column::PaidAt)
        .all(db)
        .await
}

/// 결제 수단을 코드로 바꿉니다. 예전 버전이 저장한 한글 값도 받습니다.
/// 외상은 돈을 받은 것이 아니므로 결제로 기록하지 않습니다. (미수금으로 남김)
pub fn normalize_method(method: Option<&str>) -> Result<&'static str, AppError> {
    match method.map(str::trim) {
        Some("cash" | "현금") => Ok("cash"),
        Some("card" | "카드") => Ok("card"),
        Some("transfer" | "계좌이체" | "이체") => Ok("transfer"),
        Some("credit" | "외상") => Err(AppError::Validation(
            "외상은 결제로 기록하지 않습니다. 돈을 받지 않았다면 결제를 등록하지 말고 미수금으로 두세요."
                .into(),
        )),
        _ => Err(AppError::Validation("결제 수단을 다시 선택해 주세요.".into())),
    }
}

/// 받은 금액 합계가 청구 금액을 넘지 않는지 확인합니다.
pub fn check_not_overpaid(price: i64, paid_after: i64) -> Result<(), AppError> {
    if paid_after > price {
        return Err(AppError::Validation(format!(
            "받은 금액이 청구 금액보다 많아집니다. (청구 {}, 받은 금액 {})",
            won(price),
            won(paid_after)
        )));
    }
    Ok(())
}

/// 결제를 등록하고 work_item.paid_amount를 자동 갱신합니다.
pub async fn create(
    db: &DatabaseConnection,
    work_item_id: i32,
    amount: i64,
    method: Option<String>,
    paid_at: Option<String>,
) -> Result<payment::Model, AppError> {
    let method = normalize_method(method.as_deref())?;
    let tx = db.begin().await?;
    let wi = find_work_item(&tx, work_item_id).await?;
    check_not_overpaid(wi.price, wi.paid_amount + amount)?;

    let inserted = insert(&tx, work_item_id, amount, method, paid_at).await?;
    tx.commit().await?;
    Ok(inserted)
}

/// 결제 행을 추가하고 paid_amount를 맞춥니다. 검증과 트랜잭션은 호출하는 쪽에서 합니다.
pub(crate) async fn insert<C: ConnectionTrait>(
    conn: &C,
    work_item_id: i32,
    amount: i64,
    method: &str,
    paid_at: Option<String>,
) -> Result<payment::Model, DbErr> {
    let now = timestamp::now();
    let model = payment::ActiveModel {
        work_item_id: Set(work_item_id),
        amount: Set(amount),
        method: Set(Some(method.to_owned())),
        paid_at: Set(paid_at.unwrap_or_else(|| now.clone())),
        created_at: Set(now),
        ..Default::default()
    };
    let inserted = payment::Entity::insert(model)
        .exec_with_returning(conn)
        .await?;

    sync_paid_amount(conn, work_item_id).await?;
    Ok(inserted)
}

/// 결제 내역(금액, 수단, 일시)을 수정하고 work_item.paid_amount를 자동 갱신합니다.
pub async fn update(
    db: &DatabaseConnection,
    id: i32,
    amount: i64,
    method: Option<String>,
    paid_at: Option<String>,
) -> Result<payment::Model, AppError> {
    let method = normalize_method(method.as_deref())?;
    let tx = db.begin().await?;

    let p = payment::Entity::find_by_id(id)
        .one(&tx)
        .await?
        .ok_or(AppError::NotFound("결제"))?;
    let wi = find_work_item(&tx, p.work_item_id).await?;
    check_not_overpaid(wi.price, wi.paid_amount - p.amount + amount)?;

    let mut active: payment::ActiveModel = p.into();
    active.amount = Set(amount);
    active.method = Set(Some(method.to_owned()));
    if let Some(at) = paid_at {
        active.paid_at = Set(at);
    }
    let updated = active.update(&tx).await?;

    sync_paid_amount(&tx, wi.id).await?;
    tx.commit().await?;
    Ok(updated)
}

/// 결제를 삭제하고 work_item.paid_amount를 자동 갱신합니다.
pub async fn delete(db: &DatabaseConnection, id: i32) -> Result<(), AppError> {
    let tx = db.begin().await?;

    let p = payment::Entity::find_by_id(id)
        .one(&tx)
        .await?
        .ok_or(AppError::NotFound("결제"))?;
    let wi_id = p.work_item_id;

    payment::Entity::delete_by_id(id).exec(&tx).await?;
    sync_paid_amount(&tx, wi_id).await?;

    tx.commit().await?;
    Ok(())
}

/// 예전 버전에서 결제 수단을 '외상'으로 등록한 결제 (돈을 받지 않았는데 받은 것으로 잡힘)
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditPayment {
    pub payment_id: i32,
    pub work_item_id: i32,
    pub customer_id: i32,
    pub customer_name: String,
    pub description: Option<String>,
    pub amount: i64,
    pub paid_at: String,
}

/// 외상으로 기록된 결제 목록. 자동으로 지우지 않고 사용자가 확인한 뒤 정리합니다.
pub async fn list_credit(db: &DatabaseConnection) -> Result<Vec<CreditPayment>, DbErr> {
    let rows: Vec<(payment::Model, Option<work_item::Model>)> = payment::Entity::find()
        .filter(payment::Column::Method.is_in(["credit", "외상"]))
        .find_also_related(work_item::Entity)
        .order_by_asc(payment::Column::PaidAt)
        .all(db)
        .await?;

    let mut result = Vec::with_capacity(rows.len());
    for (p, wi) in rows {
        let Some(wi) = wi else { continue };
        let customer_name = customer::Entity::find_by_id(wi.customer_id)
            .one(db)
            .await?
            .map(|c| c.name)
            .unwrap_or_default();
        result.push(CreditPayment {
            payment_id: p.id,
            work_item_id: wi.id,
            customer_id: wi.customer_id,
            customer_name,
            description: wi.description,
            amount: p.amount,
            paid_at: p.paid_at,
        });
    }
    Ok(result)
}

async fn find_work_item<C: ConnectionTrait>(
    conn: &C,
    id: i32,
) -> Result<work_item::Model, AppError> {
    work_item::Entity::find_by_id(id)
        .one(conn)
        .await?
        .ok_or(AppError::NotFound("접수"))
}

/// payments 합계를 계산하여 work_item.paid_amount를 갱신합니다.
pub(crate) async fn sync_paid_amount<C: ConnectionTrait>(
    tx: &C,
    work_item_id: i32,
) -> Result<(), DbErr> {
    let sum: Option<i64> = payment::Entity::find()
        .filter(payment::Column::WorkItemId.eq(work_item_id))
        .select_only()
        .column_as(payment::Column::Amount.sum(), "total")
        .into_tuple::<Option<i64>>()
        .one(tx)
        .await?
        .flatten();

    let total = sum.unwrap_or(0);

    let wi = work_item::Entity::find_by_id(work_item_id)
        .one(tx)
        .await?
        .ok_or_else(|| DbErr::RecordNotFound(format!("work_item {work_item_id}")))?;

    let mut active: work_item::ActiveModel = wi.into();
    active.paid_amount = Set(total);
    active.last_modified_at = Set(timestamp::now());
    active.update(tx).await?;

    Ok(())
}

/// 12000 → "12,000원"
pub fn won(amount: i64) -> String {
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
    use crate::services::work_items::DetailInput;
    use crate::services::{customers, work_items};
    use crate::test_helpers::setup_test_db;

    async fn setup_work_item(db: &DatabaseConnection) -> i32 {
        let c = customers::create(db, "고객".into(), None, None)
            .await
            .unwrap();
        let wi = work_items::create(
            db,
            c.id,
            Some("접수".to_owned()),
            10000,
            None,
            None,
            vec![DetailInput {
                price_item_id: None,
                item_name: "품목".into(),
                unit_price: 10000,
                quantity: 1,
                options_memo: None,
            }],
        )
        .await
        .unwrap();
        wi.id
    }

    #[tokio::test]
    async fn create_payment_syncs_paid_amount() {
        let db = setup_test_db().await.unwrap();
        let wi_id = setup_work_item(&db).await;

        // 예전 버전의 한글 수단 값은 코드로 저장
        let p = create(&db, wi_id, 5000, Some("카드".into()), None)
            .await
            .unwrap();
        assert_eq!(p.method.as_deref(), Some("card"));

        let wi = work_item::Entity::find_by_id(wi_id)
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(wi.paid_amount, 5000);
    }

    #[tokio::test]
    async fn delete_payment_syncs_paid_amount() {
        let db = setup_test_db().await.unwrap();
        let wi_id = setup_work_item(&db).await;

        let p1 = create(&db, wi_id, 3000, Some("cash".into()), None)
            .await
            .unwrap();
        create(&db, wi_id, 2000, Some("cash".into()), None)
            .await
            .unwrap();
        // paid_amount = 5000

        delete(&db, p1.id).await.unwrap();
        let wi = work_item::Entity::find_by_id(wi_id)
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(wi.paid_amount, 2000); // 3000 제거 후 2000만 남음
    }

    #[tokio::test]
    async fn list_payments_ordered() {
        let db = setup_test_db().await.unwrap();
        let wi_id = setup_work_item(&db).await;

        create(&db, wi_id, 1000, Some("현금".into()), None)
            .await
            .unwrap();
        create(&db, wi_id, 2000, Some("카드".into()), None)
            .await
            .unwrap();

        let payments = list(&db, wi_id).await.unwrap();
        assert_eq!(payments.len(), 2);
        assert_eq!(payments[0].amount, 1000);
        assert_eq!(payments[1].amount, 2000);
    }

    /// V12: 청구 금액보다 많이 받을 수 없음 (추가·수정 모두)
    #[tokio::test]
    async fn rejects_overpayment() {
        let db = setup_test_db().await.unwrap();
        let wi_id = setup_work_item(&db).await; // 청구 10,000원

        let p = create(&db, wi_id, 10000, Some("cash".into()), None)
            .await
            .unwrap();
        let err = create(&db, wi_id, 30000, Some("cash".into()), None)
            .await
            .unwrap_err();
        assert_eq!(
            err.to_string(),
            "받은 금액이 청구 금액보다 많아집니다. (청구 10,000원, 받은 금액 40,000원)"
        );
        assert!(
            update(&db, p.id, 12000, Some("cash".into()), None)
                .await
                .is_err()
        );
        // 금액을 줄이는 수정은 가능
        update(&db, p.id, 8000, Some("card".into()), None)
            .await
            .unwrap();
        let wi = work_item::Entity::find_by_id(wi_id)
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(wi.paid_amount, 8000);
    }

    /// V7: '외상'은 결제로 기록하지 않음 (미수금으로 남김)
    #[tokio::test]
    async fn credit_is_not_a_payment_method() {
        let db = setup_test_db().await.unwrap();
        let wi_id = setup_work_item(&db).await;

        for method in ["credit", "외상"] {
            let err = create(&db, wi_id, 7000, Some(method.into()), None)
                .await
                .unwrap_err();
            assert!(err.to_string().contains("외상은 결제로 기록하지 않습니다"));
        }
        assert!(create(&db, wi_id, 7000, None, None).await.is_err());
        let wi = work_item::Entity::find_by_id(wi_id)
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(wi.paid_amount, 0);
    }

    /// 예전에 외상으로 기록된 결제는 점검 목록으로 보여주고, 지우면 미수금으로 돌아감
    #[tokio::test]
    async fn lists_credit_payments_for_review() {
        let db = setup_test_db().await.unwrap();
        let wi_id = setup_work_item(&db).await;
        db.execute_unprepared(&format!(
            "INSERT INTO payments (work_item_id, amount, method, paid_at, created_at)
             VALUES ({wi_id}, 7000, 'credit', '2026-09-20T01:00:00.000Z', '2026-09-20T01:00:00.000Z'),
                    ({wi_id}, 1000, 'cash', '2026-09-20T02:00:00.000Z', '2026-09-20T02:00:00.000Z')"
        ))
        .await
        .unwrap();

        let credit = list_credit(&db).await.unwrap();
        assert_eq!(credit.len(), 1);
        assert_eq!(credit[0].amount, 7000);
        assert_eq!(credit[0].customer_name, "고객");

        delete(&db, credit[0].payment_id).await.unwrap();
        let wi = work_item::Entity::find_by_id(wi_id)
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(wi.paid_amount, 1000);
        assert!(list_credit(&db).await.unwrap().is_empty());
    }

    #[test]
    fn formats_won() {
        assert_eq!(won(0), "0원");
        assert_eq!(won(3000), "3,000원");
        assert_eq!(won(100_000_000), "100,000,000원");
    }
}
