use sea_orm::*;
use serde::Deserialize;
use tauri::State;

use crate::commands::{AppError, CmdResult};
use crate::db::entities::price_item;

// -- DTO --

#[derive(Deserialize)]
pub struct CreatePriceItem {
    pub category_id: i32,
    pub name: String,
    pub default_price: i32,
    pub sort_order: i32,
}

#[derive(Deserialize)]
pub struct UpdatePriceItem {
    pub name: Option<String>,
    pub default_price: Option<i32>,
    pub sort_order: Option<i32>,
}

// -- Commands --

#[tauri::command]
pub async fn list_price_items(
    db: State<'_, DatabaseConnection>,
    category_id: Option<i32>,
) -> CmdResult<Vec<price_item::Model>> {
    let mut query = price_item::Entity::find();

    if let Some(cid) = category_id {
        query = query.filter(price_item::Column::CategoryId.eq(cid));
    }

    let results = query
        .order_by_asc(price_item::Column::SortOrder)
        .all(db.inner())
        .await?;

    Ok(results)
}

#[tauri::command]
pub async fn create_price_item(
    db: State<'_, DatabaseConnection>,
    data: CreatePriceItem,
) -> CmdResult<price_item::Model> {
    let model = price_item::ActiveModel {
        category_id: Set(data.category_id),
        name: Set(data.name),
        default_price: Set(data.default_price),
        sort_order: Set(data.sort_order),
        ..Default::default()
    };

    let result = price_item::Entity::insert(model)
        .exec_with_returning(db.inner())
        .await?;

    Ok(result)
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

    let mut active: price_item::ActiveModel = existing.into();

    if let Some(name) = data.name {
        active.name = Set(name);
    }
    if let Some(price) = data.default_price {
        active.default_price = Set(price);
    }
    if let Some(order) = data.sort_order {
        active.sort_order = Set(order);
    }

    let updated = active.update(db.inner()).await?;
    Ok(updated)
}

#[tauri::command]
pub async fn delete_price_item(
    db: State<'_, DatabaseConnection>,
    id: i32,
) -> CmdResult<()> {
    let res = price_item::Entity::delete_by_id(id)
        .exec(db.inner())
        .await?;

    if res.rows_affected == 0 {
        return Err(AppError::NotFound(format!("price_item {id}")));
    }

    Ok(())
}
