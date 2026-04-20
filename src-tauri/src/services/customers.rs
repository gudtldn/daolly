use chrono::Utc;
use sea_orm::*;

use crate::db::entities::customer;

pub async fn list(
    db: &DatabaseConnection,
    search: Option<String>,
) -> Result<Vec<customer::Model>, DbErr> {
    let mut query = customer::Entity::find();

    if let Some(keyword) = search {
        query = query.filter(
            Condition::any()
                .add(customer::Column::Name.contains(&keyword))
                .add(customer::Column::PhoneNumber.contains(&keyword)),
        );
    }

    query.order_by_asc(customer::Column::Name).all(db).await
}

pub async fn get_by_id(db: &DatabaseConnection, id: i32) -> Result<Option<customer::Model>, DbErr> {
    customer::Entity::find_by_id(id).one(db).await
}

pub async fn create(
    db: &DatabaseConnection,
    name: String,
    phone_number: Option<String>,
    note: Option<String>,
) -> Result<customer::Model, DbErr> {
    let name = name.trim().to_owned();
    let phone_number = phone_number
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty());
    let note = note.map(|s| s.trim().to_owned()).filter(|s| !s.is_empty());

    if name.is_empty() {
        return Err(DbErr::Custom("name is required".to_owned()));
    }

    let now = Utc::now().to_rfc3339();
    let model = customer::ActiveModel {
        name: Set(name),
        phone_number: Set(phone_number),
        note: Set(note),
        created_at: Set(now.clone()),
        last_modified_at: Set(now),
        ..Default::default()
    };

    customer::Entity::insert(model)
        .exec_with_returning(db)
        .await
}

pub async fn update(
    db: &DatabaseConnection,
    existing: customer::Model,
    name: String,
    phone_number: Option<String>,
    note: Option<String>,
) -> Result<customer::Model, DbErr> {
    let name = name.trim().to_owned();
    let phone_number = phone_number
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty());
    let note = note.map(|s| s.trim().to_owned()).filter(|s| !s.is_empty());

    if name.is_empty() {
        return Err(DbErr::Custom("name is required".to_owned()));
    }

    let mut active: customer::ActiveModel = existing.into();
    active.name = Set(name);
    active.phone_number = Set(phone_number);
    active.note = Set(note);
    active.last_modified_at = Set(Utc::now().to_rfc3339());

    active.update(db).await
}

pub async fn delete(db: &DatabaseConnection, id: i32) -> Result<u64, DbErr> {
    let res = customer::Entity::delete_by_id(id).exec(db).await?;
    Ok(res.rows_affected)
}
