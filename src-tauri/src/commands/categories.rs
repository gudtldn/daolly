use sea_orm::*;
use serde::Deserialize;
use tauri::State;

use crate::commands::{AppError, CmdResult};
use crate::db::entities::category;

// -- DTO --

#[derive(Deserialize)]
pub struct CreateCategory {
    pub name: String,
    pub sort_order: i32,
}

#[derive(Deserialize)]
pub struct UpdateCategory {
    pub name: String,
    pub sort_order: i32,
}

// -- Commands --

#[tauri::command]
pub async fn list_categories(
    db: State<'_, DatabaseConnection>,
) -> CmdResult<Vec<category::Model>> {
    let results = category::Entity::find()
        .order_by_asc(category::Column::SortOrder)
        .all(db.inner())
        .await?;

    Ok(results)
}

#[tauri::command]
pub async fn create_category(
    db: State<'_, DatabaseConnection>,
    data: CreateCategory,
) -> CmdResult<category::Model> {
    let model = category::ActiveModel {
        name: Set(data.name),
        sort_order: Set(data.sort_order),
        ..Default::default()
    };

    let result = category::Entity::insert(model)
        .exec_with_returning(db.inner())
        .await?;

    Ok(result)
}

#[tauri::command]
pub async fn update_category(
    db: State<'_, DatabaseConnection>,
    id: i32,
    data: UpdateCategory,
) -> CmdResult<category::Model> {
    let existing = category::Entity::find_by_id(id)
        .one(db.inner())
        .await?
        .ok_or_else(|| AppError::NotFound(format!("category {id}")))?;

    let mut active: category::ActiveModel = existing.into();
    active.name = Set(data.name);
    active.sort_order = Set(data.sort_order);

    let updated = active.update(db.inner()).await?;
    Ok(updated)
}

#[tauri::command]
pub async fn delete_category(
    db: State<'_, DatabaseConnection>,
    id: i32,
) -> CmdResult<()> {
    let res = category::Entity::delete_by_id(id)
        .exec(db.inner())
        .await?;

    if res.rows_affected == 0 {
        return Err(AppError::NotFound(format!("category {id}")));
    }

    Ok(())
}
