use sea_orm::*;

use crate::db::entities::price_item;

pub async fn list(
    db: &DatabaseConnection,
    category_id: Option<i32>,
) -> Result<Vec<price_item::Model>, DbErr> {
    let mut query = price_item::Entity::find();

    if let Some(cid) = category_id {
        query = query.filter(price_item::Column::CategoryId.eq(cid));
    }

    query
        .order_by_asc(price_item::Column::SortOrder)
        .all(db)
        .await
}

pub async fn create(
    db: &DatabaseConnection,
    category_id: i32,
    name: String,
    default_price: i64,
    sort_order: i32,
) -> Result<price_item::Model, DbErr> {
    let name = name.trim().to_owned();
    if name.is_empty() {
        return Err(DbErr::Custom("name is required".to_owned()));
    }

    let model = price_item::ActiveModel {
        category_id: Set(category_id),
        name: Set(name),
        default_price: Set(default_price),
        sort_order: Set(sort_order),
        ..Default::default()
    };

    price_item::Entity::insert(model)
        .exec_with_returning(db)
        .await
}

pub async fn update(
    db: &DatabaseConnection,
    existing: price_item::Model,
    name: Option<String>,
    default_price: Option<i64>,
    sort_order: Option<i32>,
) -> Result<price_item::Model, DbErr> {
    let mut active: price_item::ActiveModel = existing.into();

    if let Some(name) = name {
        let name = name.trim().to_owned();
        if name.is_empty() {
            return Err(DbErr::Custom("name cannot be empty".to_owned()));
        }
        active.name = Set(name);
    }
    if let Some(price) = default_price {
        active.default_price = Set(price);
    }
    if let Some(order) = sort_order {
        active.sort_order = Set(order);
    }

    active.update(db).await
}

pub async fn delete(db: &DatabaseConnection, id: i32) -> Result<u64, DbErr> {
    let res = price_item::Entity::delete_by_id(id).exec(db).await?;
    Ok(res.rows_affected)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::categories;
    use crate::test_helpers::setup_test_db;

    #[tokio::test]
    async fn create_and_list_by_category() {
        let db = setup_test_db().await.unwrap();
        let cat = categories::create(&db, "상의".into(), 1).await.unwrap();
        create(&db, cat.id, "와이셔츠".into(), 3000, 1)
            .await
            .unwrap();
        create(&db, cat.id, "티셔츠".into(), 2000, 2).await.unwrap();

        let items = list(&db, Some(cat.id)).await.unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].name, "와이셔츠"); // sort_order 1
    }

    #[tokio::test]
    async fn partial_update() {
        let db = setup_test_db().await.unwrap();
        let cat = categories::create(&db, "하의".into(), 1).await.unwrap();
        let item = create(&db, cat.id, "바지".into(), 4000, 1).await.unwrap();

        let updated = update(&db, item, None, Some(5000), None).await.unwrap();
        assert_eq!(updated.name, "바지"); // unchanged
        assert_eq!(updated.default_price, 5000); // changed
    }

    #[tokio::test]
    async fn create_empty_name_error() {
        let db = setup_test_db().await.unwrap();
        let cat = categories::create(&db, "상의".into(), 1).await.unwrap();
        let err = create(&db, cat.id, "  ".into(), 1000, 1).await.unwrap_err();
        assert!(err.to_string().contains("name is required"));
    }
}
