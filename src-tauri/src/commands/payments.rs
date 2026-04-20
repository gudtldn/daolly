use sea_orm::{DatabaseConnection, EntityTrait};
use serde::Deserialize;
use tauri::State;

use crate::commands::{AppError, CmdResult};
use crate::db::entities::payment;
use crate::services;

/// 결제 등록 DTO
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePayment {
    pub work_item_id: i32,
    /// 결제 금액 (양수)
    pub amount: i32,
    /// 결제 수단
    pub method: Option<String>,
}

#[tauri::command]
pub async fn list_payments(
    db: State<'_, DatabaseConnection>,
    work_item_id: i32,
) -> CmdResult<Vec<payment::Model>> {
    Ok(services::payments::list(db.inner(), work_item_id).await?)
}

#[tauri::command]
pub async fn create_payment(
    db: State<'_, DatabaseConnection>,
    data: CreatePayment,
) -> CmdResult<payment::Model> {
    Ok(services::payments::create(db.inner(), data.work_item_id, data.amount, data.method).await?)
}

#[tauri::command]
pub async fn delete_payment(db: State<'_, DatabaseConnection>, id: i32) -> CmdResult<()> {
    // 존재 확인
    payment::Entity::find_by_id(id)
        .one(db.inner())
        .await?
        .ok_or_else(|| AppError::NotFound(format!("payment {id}")))?;

    services::payments::delete(db.inner(), id).await?;
    Ok(())
}
