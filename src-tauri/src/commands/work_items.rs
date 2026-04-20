use chrono::Utc;
use sea_orm::*;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::{AppError, CmdResult};
use crate::db::entities::{payment, work_item, work_item_detail};

// -- DTO --

#[derive(Deserialize)]
pub struct DetailInput {
    pub item_name: String,
    pub unit_price: i32,
    pub quantity: i32,
    pub options_memo: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateWorkItem {
    pub customer_id: i32,
    pub description: String,
    pub price: i32,
    pub note: Option<String>,
    pub details: Vec<DetailInput>,
}

#[derive(Deserialize)]
pub struct UpdateWorkItem {
    pub description: Option<String>,
    pub price: Option<i32>,
    pub note: Option<String>,
}

#[derive(Serialize)]
pub struct WorkItemFull {
    #[serde(flatten)]
    pub work_item: work_item::Model,
    pub details: Vec<work_item_detail::Model>,
    pub payments: Vec<payment::Model>,
}

// -- Commands --

#[tauri::command]
pub async fn list_work_items(
    db: State<'_, DatabaseConnection>,
    customer_id: Option<i32>,
    status: Option<String>,
) -> CmdResult<Vec<work_item::Model>> {
    let mut query = work_item::Entity::find();

    if let Some(cid) = customer_id {
        query = query.filter(work_item::Column::CustomerId.eq(cid));
    }
    if let Some(s) = status {
        query = query.filter(work_item::Column::Status.eq(s));
    }

    let results = query
        .order_by_desc(work_item::Column::ReceivedAt)
        .all(db.inner())
        .await?;

    Ok(results)
}

#[tauri::command]
pub async fn get_work_item(
    db: State<'_, DatabaseConnection>,
    id: i32,
) -> CmdResult<WorkItemFull> {
    let item = work_item::Entity::find_by_id(id)
        .one(db.inner())
        .await?
        .ok_or_else(|| AppError::NotFound(format!("work_item {id}")))?;

    let details = work_item_detail::Entity::find()
        .filter(work_item_detail::Column::WorkItemId.eq(id))
        .all(db.inner())
        .await?;

    let payments = payment::Entity::find()
        .filter(payment::Column::WorkItemId.eq(id))
        .order_by_asc(payment::Column::PaidAt)
        .all(db.inner())
        .await?;

    Ok(WorkItemFull {
        work_item: item,
        details,
        payments,
    })
}

#[tauri::command]
pub async fn create_work_item(
    db: State<'_, DatabaseConnection>,
    data: CreateWorkItem,
) -> CmdResult<work_item::Model> {
    let now = Utc::now().to_rfc3339();
    let tx = db.inner().begin().await?;

    // 1) work_item INSERT
    let wi = work_item::ActiveModel {
        customer_id: Set(data.customer_id),
        status: Set("Received".to_owned()),
        description: Set(data.description),
        price: Set(data.price),
        paid_amount: Set(0),
        note: Set(data.note),
        received_at: Set(now.clone()),
        created_at: Set(now.clone()),
        last_modified_at: Set(now),
        ..Default::default()
    };
    let inserted = work_item::Entity::insert(wi)
        .exec_with_returning(&tx)
        .await?;

    // 2) details INSERT
    if !data.details.is_empty() {
        let detail_models: Vec<work_item_detail::ActiveModel> = data
            .details
            .into_iter()
            .map(|d| work_item_detail::ActiveModel {
                work_item_id: Set(inserted.id),
                item_name: Set(d.item_name),
                unit_price: Set(d.unit_price),
                quantity: Set(d.quantity),
                options_memo: Set(d.options_memo),
                ..Default::default()
            })
            .collect();

        work_item_detail::Entity::insert_many(detail_models)
            .exec(&tx)
            .await?;
    }

    tx.commit().await?;
    Ok(inserted)
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

    let mut active: work_item::ActiveModel = existing.into();

    if let Some(desc) = data.description {
        active.description = Set(desc);
    }
    if let Some(price) = data.price {
        active.price = Set(price);
    }
    if let Some(note) = data.note {
        active.note = Set(Some(note));
    }
    active.last_modified_at = Set(Utc::now().to_rfc3339());

    let updated = active.update(db.inner()).await?;
    Ok(updated)
}

#[tauri::command]
pub async fn update_work_item_status(
    db: State<'_, DatabaseConnection>,
    id: i32,
    status: String,
) -> CmdResult<work_item::Model> {
    let existing = work_item::Entity::find_by_id(id)
        .one(db.inner())
        .await?
        .ok_or_else(|| AppError::NotFound(format!("work_item {id}")))?;

    let now = Utc::now().to_rfc3339();
    let mut active: work_item::ActiveModel = existing.into();
    active.status = Set(status.clone());
    active.last_modified_at = Set(now.clone());

    match status.as_str() {
        "Completed" => active.completed_at = Set(Some(now)),
        "PickedUp" => active.picked_up_at = Set(Some(now)),
        _ => {}
    }

    let updated = active.update(db.inner()).await?;
    Ok(updated)
}

#[tauri::command]
pub async fn replace_work_item_details(
    db: State<'_, DatabaseConnection>,
    work_item_id: i32,
    details: Vec<DetailInput>,
) -> CmdResult<Vec<work_item_detail::Model>> {
    // work_item 존재 확인
    work_item::Entity::find_by_id(work_item_id)
        .one(db.inner())
        .await?
        .ok_or_else(|| AppError::NotFound(format!("work_item {work_item_id}")))?;

    let tx = db.inner().begin().await?;

    // 1) 기존 details 일괄 삭제
    work_item_detail::Entity::delete_many()
        .filter(work_item_detail::Column::WorkItemId.eq(work_item_id))
        .exec(&tx)
        .await?;

    // 2) 새 details 일괄 삽입
    if !details.is_empty() {
        let models: Vec<work_item_detail::ActiveModel> = details
            .into_iter()
            .map(|d| work_item_detail::ActiveModel {
                work_item_id: Set(work_item_id),
                item_name: Set(d.item_name),
                unit_price: Set(d.unit_price),
                quantity: Set(d.quantity),
                options_memo: Set(d.options_memo),
                ..Default::default()
            })
            .collect();

        work_item_detail::Entity::insert_many(models)
            .exec(&tx)
            .await?;
    }

    tx.commit().await?;

    // 교체 후 결과 반환
    let result = work_item_detail::Entity::find()
        .filter(work_item_detail::Column::WorkItemId.eq(work_item_id))
        .all(db.inner())
        .await?;

    Ok(result)
}

#[tauri::command]
pub async fn delete_work_item(
    db: State<'_, DatabaseConnection>,
    id: i32,
) -> CmdResult<()> {
    let res = work_item::Entity::delete_by_id(id)
        .exec(db.inner())
        .await?;

    if res.rows_affected == 0 {
        return Err(AppError::NotFound(format!("work_item {id}")));
    }

    Ok(())
}
