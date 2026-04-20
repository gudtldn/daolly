use sea_orm::*;

use crate::db::entities::category;

pub async fn list(db: &DatabaseConnection) -> Result<Vec<category::Model>, DbErr> {
    category::Entity::find()
        .order_by_asc(category::Column::SortOrder)
        .all(db)
        .await
}

pub async fn create(
    db: &DatabaseConnection,
    name: String,
    sort_order: i32,
) -> Result<category::Model, DbErr> {
    let name = name.trim().to_owned();
    if name.is_empty() {
        return Err(DbErr::Custom("name is required".to_owned()));
    }

    let model = category::ActiveModel {
        name: Set(name),
        sort_order: Set(sort_order),
        ..Default::default()
    };

    category::Entity::insert(model)
        .exec_with_returning(db)
        .await
}

pub async fn update(
    db: &DatabaseConnection,
    existing: category::Model,
    name: String,
    sort_order: i32,
) -> Result<category::Model, DbErr> {
    let name = name.trim().to_owned();
    if name.is_empty() {
        return Err(DbErr::Custom("name is required".to_owned()));
    }

    let mut active: category::ActiveModel = existing.into();
    active.name = Set(name);
    active.sort_order = Set(sort_order);

    active.update(db).await
}

pub async fn delete(db: &DatabaseConnection, id: i32) -> Result<u64, DbErr> {
    let res = category::Entity::delete_by_id(id).exec(db).await?;
    Ok(res.rows_affected)
}
