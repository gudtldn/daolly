use sea_orm::{DatabaseConnection, EntityTrait};
use serde::Deserialize;
use tauri::State;

use crate::commands::{AppError, CmdResult};
use crate::db::entities::price_item;
use crate::services;

/// 단가표 항목 생성 DTO
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePriceItem {
    pub category_id: i32,
    pub name: String,
    /// 기본 단가
    pub default_price: i32,
    pub sort_order: i32,
}

/// 단가표 항목 부분 수정 DTO
/// NOTE: None인 필드는 변경하지 않습니다.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePriceItem {
    pub name: Option<String>,
    pub default_price: Option<i32>,
    pub sort_order: Option<i32>,
}

#[tauri::command]
pub async fn list_price_items(
    db: State<'_, DatabaseConnection>,
    category_id: Option<i32>,
) -> CmdResult<Vec<price_item::Model>> {
    Ok(services::price_items::list(db.inner(), category_id).await?)
}

#[tauri::command]
pub async fn create_price_item(
    db: State<'_, DatabaseConnection>,
    data: CreatePriceItem,
) -> CmdResult<price_item::Model> {
    Ok(services::price_items::create(
        db.inner(),
        data.category_id,
        data.name,
        data.default_price,
        data.sort_order,
    )
    .await?)
}

#[tauri::command]
pub async fn update_price_item(
    db: State<'_, DatabaseConnection>,
    id: i32,
    data: UpdatePriceItem,
) -> CmdResult<price_item::Model> {
    let existing = price_item::Entity::find_by_id(id)
        .one(db.inner())
        .await?
        .ok_or_else(|| AppError::NotFound(format!("price_item {id}")))?;

    Ok(services::price_items::update(
        db.inner(),
        existing,
        data.name,
        data.default_price,
        data.sort_order,
    )
    .await?)
}

#[tauri::command]
pub async fn delete_price_item(db: State<'_, DatabaseConnection>, id: i32) -> CmdResult<()> {
    let rows = services::price_items::delete(db.inner(), id).await?;
    if rows == 0 {
        return Err(AppError::NotFound(format!("price_item {id}")));
    }
    Ok(())
}
