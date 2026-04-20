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
    amount: i32,
    method: Option<String>,
) -> Result<payment::Model, DbErr> {
    if amount <= 0 {
        return Err(DbErr::Custom("amount must be positive".to_owned()));
    }
    let method = method
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty());

    let now = Utc::now().to_rfc3339();
    let tx = db.begin().await?;

    let model = payment::ActiveModel {
        work_item_id: Set(work_item_id),
        amount: Set(amount),
        method: Set(method),
        paid_at: Set(now.clone()),
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

    let total = sum.unwrap_or(0) as i32;

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
