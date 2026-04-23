use sea_orm::{DatabaseConnection, EntityTrait};
use serde::Deserialize;
use tauri::State;

use crate::commands::{AppError, CmdResult, require_non_empty};
use crate::db::entities::category;
use crate::services;

/// 카테고리 생성 DTO
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCategory {
    pub name: String,
    /// 정렬 순서
    pub sort_order: i32,
}

/// 카테고리 수정 DTO
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCategory {
    pub name: String,
    pub sort_order: i32,
}

#[tauri::command]
pub async fn list_categories(db: State<'_, DatabaseConnection>) -> CmdResult<Vec<category::Model>> {
    Ok(services::categories::list(db.inner()).await?)
}

#[tauri::command]
pub async fn create_category(
    db: State<'_, DatabaseConnection>,
    data: CreateCategory,
) -> CmdResult<category::Model> {
    require_non_empty(&data.name, "카테고리 이름")?;
    Ok(services::categories::create(db.inner(), data.name, data.sort_order).await?)
}

#[tauri::command]
pub async fn update_category(
    db: State<'_, DatabaseConnection>,
    id: i32,
    data: UpdateCategory,
) -> CmdResult<category::Model> {
    require_non_empty(&data.name, "카테고리 이름")?;
    let existing = category::Entity::find_by_id(id)
        .one(db.inner())
        .await?
        .ok_or_else(|| AppError::NotFound(format!("category {id}")))?;

    Ok(services::categories::update(db.inner(), existing, data.name, data.sort_order).await?)
}

#[tauri::command]
pub async fn delete_category(db: State<'_, DatabaseConnection>, id: i32) -> CmdResult<()> {
    let rows = services::categories::delete(db.inner(), id).await?;
    if rows == 0 {
        return Err(AppError::NotFound(format!("category {id}")));
    }
    Ok(())
}
