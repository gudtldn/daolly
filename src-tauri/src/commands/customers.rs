use sea_orm::{DatabaseConnection, EntityTrait};
use tauri::State;

use crate::commands::{require_non_empty, AppError, CmdResult};
use crate::db::entities::customer;
use crate::services;
use serde::Deserialize;

/// 고객 생성 DTO
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCustomer {
    pub name: String,
    pub phone_number: Option<String>,
    pub note: Option<String>,
}

/// 고객 수정 DTO
/// NOTE: 모든 필드를 덮어씁니다.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCustomer {
    pub name: String,
    pub phone_number: Option<String>,
    pub note: Option<String>,
}

#[tauri::command]
pub async fn list_customers(
    db: State<'_, DatabaseConnection>,
    search: Option<String>,
) -> CmdResult<Vec<customer::Model>> {
    Ok(services::customers::list(db.inner(), search).await?)
}

#[tauri::command]
pub async fn get_customer(
    db: State<'_, DatabaseConnection>,
    id: i32,
) -> CmdResult<customer::Model> {
    services::customers::get_by_id(db.inner(), id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("customer {id}")))
}

#[tauri::command]
pub async fn create_customer(
    db: State<'_, DatabaseConnection>,
    data: CreateCustomer,
) -> CmdResult<customer::Model> {
    require_non_empty(&data.name, "고객 이름")?;
    Ok(services::customers::create(db.inner(), data.name, data.phone_number, data.note).await?)
}

#[tauri::command]
pub async fn update_customer(
    db: State<'_, DatabaseConnection>,
    id: i32,
    data: UpdateCustomer,
) -> CmdResult<customer::Model> {
    require_non_empty(&data.name, "고객 이름")?;
    let existing = customer::Entity::find_by_id(id)
        .one(db.inner())
        .await?
        .ok_or_else(|| AppError::NotFound(format!("customer {id}")))?;

    Ok(services::customers::update(
        db.inner(),
        existing,
        data.name,
        data.phone_number,
        data.note,
    )
    .await?)
}

#[tauri::command]
pub async fn delete_customer(db: State<'_, DatabaseConnection>, id: i32) -> CmdResult<()> {
    let rows = services::customers::delete(db.inner(), id).await?;
    if rows == 0 {
        return Err(AppError::NotFound(format!("customer {id}")));
    }
    Ok(())
}
