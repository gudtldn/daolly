use chrono::Utc;
use sea_orm::*;

use crate::db::entities::{payment, work_item};

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

/// 결제를 등록하고 work_item.paid_amount를 자동 갱신합니다.
pub async fn create(
    db: &DatabaseConnection,
    work_item_id: i32,
    amount: i64,
    method: Option<String>,
    paid_at: Option<String>,
) -> Result<payment::Model, DbErr> {
    let method = method
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty());

    let now = Utc::now().to_rfc3339();
    let paid_at_val = paid_at.unwrap_or_else(|| now.clone());
    let tx = db.begin().await?;

    let model = payment::ActiveModel {
        work_item_id: Set(work_item_id),
        amount: Set(amount),
        method: Set(method),
        paid_at: Set(paid_at_val),
        created_at: Set(now),
        ..Default::default()
    };
    let inserted = payment::Entity::insert(model)
        .exec_with_returning(&tx)
        .await?;

    sync_paid_amount(&tx, work_item_id).await?;
    tx.commit().await?;
    Ok(inserted)
}

/// 결제 내역(금액, 수단, 일시)을 수정하고 work_item.paid_amount를 자동 갱신합니다.
pub async fn update(
    db: &DatabaseConnection,
    id: i32,
    amount: i64,
    method: Option<String>,
    paid_at: Option<String>,
) -> Result<payment::Model, DbErr> {
    let method = method
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty());

    let tx = db.begin().await?;

    let p = payment::Entity::find_by_id(id)
        .one(&tx)
        .await?
        .ok_or_else(|| DbErr::Custom(format!("payment {id} not found")))?;
    let wi_id = p.work_item_id;

    let mut active: payment::ActiveModel = p.into();
    active.amount = Set(amount);
    active.method = Set(method);
    if let Some(at) = paid_at {
        active.paid_at = Set(at);
    }
    let updated = active.update(&tx).await?;

    sync_paid_amount(&tx, wi_id).await?;
    tx.commit().await?;
    Ok(updated)
}

/// 결제를 삭제하고 work_item.paid_amount를 자동 갱신합니다.
pub async fn delete(db: &DatabaseConnection, id: i32) -> Result<(), DbErr> {
    let tx = db.begin().await?;

    let p = payment::Entity::find_by_id(id)
        .one(&tx)
        .await?
        .ok_or_else(|| DbErr::Custom(format!("payment {id} not found")))?;
    let wi_id = p.work_item_id;

    payment::Entity::delete_by_id(id).exec(&tx).await?;
    sync_paid_amount(&tx, wi_id).await?;

    tx.commit().await?;
    Ok(())
}

/// payments 합계를 계산하여 work_item.paid_amount를 갱신합니다.
async fn sync_paid_amount(tx: &DatabaseTransaction, work_item_id: i32) -> Result<(), DbErr> {
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
        .ok_or_else(|| DbErr::Custom(format!("work_item {work_item_id} not found")))?;

    let mut active: work_item::ActiveModel = wi.into();
    active.paid_amount = Set(total);
    active.last_modified_at = Set(Utc::now().to_rfc3339());
    active.update(tx).await?;

    Ok(())
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
            "접수".into(),
            10000,
            None,
            None,
            vec![DetailInput {
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

        create(&db, wi_id, 5000, Some("카드".into()), None)
            .await
            .unwrap();

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

        let p1 = create(&db, wi_id, 3000, None, None).await.unwrap();
        create(&db, wi_id, 2000, None, None).await.unwrap();
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
}
