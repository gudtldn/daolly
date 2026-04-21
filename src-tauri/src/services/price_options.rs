use sea_orm::*;

use crate::db::entities::price_option;

pub async fn list(db: &DatabaseConnection) -> Result<Vec<price_option::Model>, DbErr> {
    price_option::Entity::find()
        .order_by_asc(price_option::Column::SortOrder)
        .order_by_asc(price_option::Column::Id)
        .all(db)
        .await
}

pub async fn create(
    db: &DatabaseConnection,
    name: String,
    price: i64,
    sort_order: i32,
) -> Result<price_option::Model, DbErr> {
    let name = name.trim().to_owned();
    price_option::Entity::insert(price_option::ActiveModel {
        name: Set(name),
        price: Set(price),
        sort_order: Set(sort_order),
        ..Default::default()
    })
    .exec_with_returning(db)
    .await
}

pub async fn update(
    db: &DatabaseConnection,
    existing: price_option::Model,
    name: Option<String>,
    price: Option<i64>,
    sort_order: Option<i32>,
) -> Result<price_option::Model, DbErr> {
    let mut active: price_option::ActiveModel = existing.into();
    if let Some(n) = name {
        active.name = Set(n.trim().to_owned());
    }
    if let Some(p) = price {
        active.price = Set(p);
    }
    if let Some(s) = sort_order {
        active.sort_order = Set(s);
    }
    active.update(db).await
}

pub async fn delete(db: &DatabaseConnection, id: i32) -> Result<u64, DbErr> {
    let res = price_option::Entity::delete_by_id(id).exec(db).await?;
    Ok(res.rows_affected)
}
