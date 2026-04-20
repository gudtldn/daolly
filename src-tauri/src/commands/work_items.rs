use sea_orm::{DatabaseConnection, EntityTrait};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

use crate::commands::{AppError, CmdResult};
use crate::db::entities::{payment, work_item, work_item::WorkItemStatus, work_item_detail};
use crate::services;
use crate::services::work_items::DetailInput;

/// 접수 생성 DTO
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkItem {
    pub customer_id: i32,
    pub description: String,
    /// 총액
    pub price: i32,
    pub note: Option<String>,
    /// 접수 일시 (RFC3339). None이면 현재 시각 사용
    pub received_at: Option<String>,
    /// 항목 스냅샷
    pub details: Vec<DetailInput>,
}

/// 접수 부분 수정 DTO
/// NOTE: None인 필드는 변경하지 않습니다.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWorkItem {
    pub description: Option<String>,
    pub price: Option<i32>,
    pub note: Option<String>,
    /// 접수 일시 변경
    pub received_at: Option<String>,
    /// 수령 일시 변경
    pub picked_up_at: Option<String>,
}

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
        .ok_or_else(|| AppError::NotFound(format!("work_item {id}")))?;

    Ok(WorkItemFull {
        work_item: wi,
        details,
        payments,
    })
}

#[tauri::command]
pub async fn create_work_item(
    db: State<'_, DatabaseConnection>,
    data: CreateWorkItem,
) -> CmdResult<work_item::Model> {
    Ok(services::work_items::create(
        db.inner(),
        data.customer_id,
        data.description,
        data.price,
        data.note,
        data.received_at,
        data.details,
    )
    .await?)
}

#[tauri::command]
pub async fn update_work_item(
    db: State<'_, DatabaseConnection>,
    id: i32,
    data: UpdateWorkItem,
) -> CmdResult<work_item::Model> {
    let existing = work_item::Entity::find_by_id(id)
        .one(db.inner())
        .await?
        .ok_or_else(|| AppError::NotFound(format!("work_item {id}")))?;

    Ok(services::work_items::update(
        db.inner(),
        existing,
        data.description,
        data.price,
        data.note,
        data.received_at,
        data.picked_up_at,
    )
    .await?)
}

#[tauri::command]
pub async fn update_work_item_status(
    db: State<'_, DatabaseConnection>,
    id: i32,
    status: WorkItemStatus,
) -> CmdResult<work_item::Model> {
    let existing = work_item::Entity::find_by_id(id)
        .one(db.inner())
        .await?
        .ok_or_else(|| AppError::NotFound(format!("work_item {id}")))?;

    Ok(services::work_items::update_status(db.inner(), existing, status).await?)
}

#[tauri::command]
pub async fn replace_work_item_details(
    db: State<'_, DatabaseConnection>,
    work_item_id: i32,
    details: Vec<DetailInput>,
) -> CmdResult<Vec<work_item_detail::Model>> {
    work_item::Entity::find_by_id(work_item_id)
        .one(db.inner())
        .await?
        .ok_or_else(|| AppError::NotFound(format!("work_item {work_item_id}")))?;

    Ok(services::work_items::replace_details(db.inner(), work_item_id, details).await?)
}

#[tauri::command]
pub async fn delete_work_item(db: State<'_, DatabaseConnection>, id: i32) -> CmdResult<()> {
    let rows = services::work_items::delete(db.inner(), id).await?;
    if rows == 0 {
        return Err(AppError::NotFound(format!("work_item {id}")));
    }
    Ok(())
}

#[tauri::command]
pub async fn get_unpaid_amounts(
    db: State<'_, DatabaseConnection>,
    customer_ids: Vec<i32>,
) -> CmdResult<HashMap<i32, i64>> {
    Ok(services::work_items::get_unpaid_by_customers(db.inner(), customer_ids).await?)
}
