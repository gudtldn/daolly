use sea_orm::{DatabaseConnection, EntityTrait};
use serde::Deserialize;
use tauri::State;

use crate::commands::{require_non_empty, require_non_negative, AppError, CmdResult};
use crate::db::entities::price_option;
use crate::services;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePriceOption {
    pub name: String,
    pub price: i64,
    pub sort_order: i32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePriceOption {
    pub name: Option<String>,
    pub price: Option<i64>,
    pub sort_order: Option<i32>,
}

#[tauri::command]
pub async fn list_price_options(
    db: State<'_, DatabaseConnection>,
) -> CmdResult<Vec<price_option::Model>> {
    Ok(services::price_options::list(db.inner()).await?)
}

#[tauri::command]
pub async fn create_price_option(
    db: State<'_, DatabaseConnection>,
    data: CreatePriceOption,
) -> CmdResult<price_option::Model> {
    require_non_empty(&data.name, "옵션명")?;
    require_non_negative(data.price, "추가 금액")?;
    Ok(services::price_options::create(db.inner(), data.name, data.price, data.sort_order).await?)
}

#[tauri::command]
pub async fn update_price_option(
    db: State<'_, DatabaseConnection>,
    id: i32,
    data: UpdatePriceOption,
) -> CmdResult<price_option::Model> {
    if let Some(ref name) = data.name {
        require_non_empty(name, "옵션명")?;
    }
    if let Some(price) = data.price {
        require_non_negative(price, "추가 금액")?;
    }
    let existing = price_option::Entity::find_by_id(id)
        .one(db.inner())
        .await?
        .ok_or_else(|| AppError::NotFound(format!("price_option {id}")))?;
    Ok(services::price_options::update(
        db.inner(),
        existing,
        data.name,
        data.price,
        data.sort_order,
    )
    .await?)
}

#[tauri::command]
pub async fn delete_price_option(db: State<'_, DatabaseConnection>, id: i32) -> CmdResult<()> {
    let affected = services::price_options::delete(db.inner(), id).await?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("price_option {id}")));
    }
    Ok(())
}
