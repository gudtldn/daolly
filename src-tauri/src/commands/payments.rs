use chrono::Utc;
use sea_orm::*;
use serde::Deserialize;
use tauri::State;

use crate::commands::{AppError, CmdResult};
use crate::db::entities::{payment, work_item};

// -- DTO --

#[derive(Deserialize)]
pub struct CreatePayment {
    pub work_item_id: i32,
    pub amount: i32,
    pub method: Option<String>,
}

// -- Commands --

#[tauri::command]
pub async fn list_payments(
    db: State<'_, DatabaseConnection>,
    work_item_id: i32,
) -> CmdResult<Vec<payment::Model>> {
    let results = payment::Entity::find()
        .filter(payment::Column::WorkItemId.eq(work_item_id))
        .order_by_asc(payment::Column::PaidAt)
        .all(db.inner())
        .await?;

    Ok(results)
}

#[tauri::command]
pub async fn create_payment(
    db: State<'_, DatabaseConnection>,
    data: CreatePayment,
) -> CmdResult<payment::Model> {
    let now = Utc::now().to_rfc3339();
    let tx = db.inner().begin().await?;

    // 1) payment INSERT
    let model = payment::ActiveModel {
        work_item_id: Set(data.work_item_id),
        amount: Set(data.amount),
        method: Set(data.method),
        paid_at: Set(now.clone()),
        created_at: Set(now),
        ..Default::default()
    };
    let inserted = payment::Entity::insert(model)
        .exec_with_returning(&tx)
        .await?;

    // 2) paid_amount 갱신
    sync_paid_amount(&tx, data.work_item_id).await?;

    tx.commit().await?;
    Ok(inserted)
}

#[tauri::command]
pub async fn delete_payment(
    db: State<'_, DatabaseConnection>,
    id: i32,
) -> CmdResult<()> {
    let tx = db.inner().begin().await?;

    // 1) 삭제 전에 work_item_id 조회 (tx 내부)
    let p = payment::Entity::find_by_id(id)
        .one(&tx)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("payment {id}")))?;
    let wi_id = p.work_item_id;

    // 2) payment DELETE
    payment::Entity::delete_by_id(id).exec(&tx).await?;

    // 3) paid_amount 갱신
    sync_paid_amount(&tx, wi_id).await?;

    tx.commit().await?;
    Ok(())
}

/// payments 합계를 계산하여 work_items.paid_amount를 갱신한다.
async fn sync_paid_amount(tx: &DatabaseTransaction, work_item_id: i32) -> Result<(), DbErr> {
    // SUM 집계
    let sum: Option<i64> = payment::Entity::find()
        .filter(payment::Column::WorkItemId.eq(work_item_id))
        .select_only()
        .column_as(payment::Column::Amount.sum(), "total")
        .into_tuple::<Option<i64>>()
        .one(tx)
        .await?
        .flatten();

    let total = sum.unwrap_or(0) as i32;

    // work_item.paid_amount UPDATE
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
