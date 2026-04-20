use chrono::Utc;
use sea_orm::*;
use serde::Deserialize;
use tauri::State;

use crate::commands::{AppError, CmdResult};
use crate::db::entities::customer;

// -- DTO --

#[derive(Deserialize)]
pub struct CreateCustomer {
    pub name: String,
    pub phone_number: Option<String>,
    pub note: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateCustomer {
    pub name: String,
    pub phone_number: Option<String>,
    pub note: Option<String>,
}

// -- Commands --

#[tauri::command]
pub async fn list_customers(
    db: State<'_, DatabaseConnection>,
    search: Option<String>,
) -> CmdResult<Vec<customer::Model>> {
    let mut query = customer::Entity::find();

    if let Some(keyword) = search {
        query = query.filter(
            Condition::any()
                .add(customer::Column::Name.contains(&keyword))
                .add(customer::Column::PhoneNumber.contains(&keyword)),
        );
    }

    let results = query
        .order_by_asc(customer::Column::Name)
        .all(db.inner())
        .await?;

    Ok(results)
}

#[tauri::command]
pub async fn get_customer(
    db: State<'_, DatabaseConnection>,
    id: i32,
) -> CmdResult<customer::Model> {
    customer::Entity::find_by_id(id)
        .one(db.inner())
        .await?
        .ok_or_else(|| AppError::NotFound(format!("customer {id}")))
}

#[tauri::command]
pub async fn create_customer(
    db: State<'_, DatabaseConnection>,
    data: CreateCustomer,
) -> CmdResult<customer::Model> {
    let now = Utc::now().to_rfc3339();

    let model = customer::ActiveModel {
        name: Set(data.name),
        phone_number: Set(data.phone_number),
        note: Set(data.note),
        created_at: Set(now.clone()),
        last_modified_at: Set(now),
        ..Default::default()
    };

    let result = customer::Entity::insert(model)
        .exec_with_returning(db.inner())
        .await?;

    Ok(result)
}

#[tauri::command]
pub async fn update_customer(
    db: State<'_, DatabaseConnection>,
    id: i32,
    data: UpdateCustomer,
) -> CmdResult<customer::Model> {
    let existing = customer::Entity::find_by_id(id)
        .one(db.inner())
        .await?
        .ok_or_else(|| AppError::NotFound(format!("customer {id}")))?;

    let mut active: customer::ActiveModel = existing.into();
    active.name = Set(data.name);
    active.phone_number = Set(data.phone_number);
    active.note = Set(data.note);
    active.last_modified_at = Set(Utc::now().to_rfc3339());

    let updated = active.update(db.inner()).await?;
    Ok(updated)
}

#[tauri::command]
pub async fn delete_customer(
    db: State<'_, DatabaseConnection>,
    id: i32,
) -> CmdResult<()> {
    let res = customer::Entity::delete_by_id(id)
        .exec(db.inner())
        .await?;

    if res.rows_affected == 0 {
        return Err(AppError::NotFound(format!("customer {id}")));
    }

    Ok(())
}
