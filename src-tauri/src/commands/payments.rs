use sea_orm::DatabaseConnection;
use serde::Deserialize;
use tauri::State;

use crate::commands::{CmdResult, require_positive};
use crate::db::entities::payment;
use crate::services;

/// 결제 등록 DTO
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePayment {
    pub work_item_id: i32,
    /// 결제 금액 (양수)
    pub amount: i64,
    /// 결제 수단
    pub method: Option<String>,
    /// 결제 일시 (ISO 8601). None이면 현재 시각 사용
    pub paid_at: Option<String>,
}

/// 결제 수정 DTO
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePayment {
    pub amount: i64,
    pub method: Option<String>,
    pub paid_at: Option<String>,
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
    require_positive(data.amount, "결제 금액")?;
    Ok(services::payments::create(
        db.inner(),
        data.work_item_id,
        data.amount,
        data.method,
        data.paid_at,
    )
    .await?)
}

#[tauri::command]
pub async fn update_payment(
    db: State<'_, DatabaseConnection>,
    id: i32,
    data: UpdatePayment,
) -> CmdResult<payment::Model> {
    require_positive(data.amount, "결제 금액")?;
    Ok(services::payments::update(db.inner(), id, data.amount, data.method, data.paid_at).await?)
}

#[tauri::command]
pub async fn delete_payment(db: State<'_, DatabaseConnection>, id: i32) -> CmdResult<()> {
    services::payments::delete(db.inner(), id).await?;
    Ok(())
}
