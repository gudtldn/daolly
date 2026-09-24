use sea_orm::DatabaseConnection;
use serde::Serialize;
use std::collections::HashMap;
use tauri::State;

use crate::commands::{AppError, CmdResult};
use crate::db::entities::{payment, work_item, work_item::WorkItemStatus, work_item_detail};
use crate::services;

/// 접수 상세 DTO
/// NOTE: work_item + details + payments를 포함합니다.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkItemFull {
    /// work_item 필드 평탄화
    #[serde(flatten)]
    pub work_item: work_item::Model,
    pub details: Vec<work_item_detail::Model>,
    pub payments: Vec<payment::Model>,
}

#[tauri::command]
pub async fn list_work_items(
    db: State<'_, DatabaseConnection>,
    customer_id: Option<i32>,
    status: Option<WorkItemStatus>,
) -> CmdResult<Vec<work_item::Model>> {
    Ok(services::work_items::list(db.inner(), customer_id, status).await?)
}

#[tauri::command]
pub async fn get_work_item(db: State<'_, DatabaseConnection>, id: i32) -> CmdResult<WorkItemFull> {
    let (wi, details, payments) = services::work_items::get_full(db.inner(), id)
        .await?
        .ok_or_else(|| AppError::NotFound("접수"))?;

    Ok(WorkItemFull {
        work_item: wi,
        details,
        payments,
    })
}

/// 상태만 바꿉니다. (내용·품목까지 고치는 수정은 amend_order)
#[tauri::command]
pub async fn update_work_item_status(
    db: State<'_, DatabaseConnection>,
    id: i32,
    status: WorkItemStatus,
) -> CmdResult<work_item::Model> {
    services::orders::change_status(db.inner(), id, status).await
}

#[tauri::command]
pub async fn delete_work_item(db: State<'_, DatabaseConnection>, id: i32) -> CmdResult<()> {
    // 지우지 않고 취소 표시 (받은 결제도 함께 취소, 기록은 남음)
    services::orders::cancel(db.inner(), id).await
}

#[tauri::command]
pub async fn get_all_unpaid_amounts(
    db: State<'_, DatabaseConnection>,
) -> CmdResult<HashMap<i32, i64>> {
    Ok(services::work_items::get_all_unpaid_amounts(db.inner()).await?)
}
