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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::setup_test_db;

    #[tokio::test]
    async fn create_category_valid() {
        let db = setup_test_db().await.unwrap();
        let c = create(&db, "상의".into(), 1).await.unwrap();
        assert_eq!(c.name, "상의");
        assert_eq!(c.sort_order, 1);
    }

    #[tokio::test]
    async fn create_category_empty_name_error() {
        let db = setup_test_db().await.unwrap();
        let err = create(&db, "  ".into(), 0).await.unwrap_err();
        assert!(err.to_string().contains("name is required"));
    }

    #[tokio::test]
    async fn list_ordered_by_sort_order() {
        let db = setup_test_db().await.unwrap();
        create(&db, "하의".into(), 2).await.unwrap();
        create(&db, "상의".into(), 1).await.unwrap();

        let cats = list(&db).await.unwrap();
        assert_eq!(cats[0].name, "상의");
        assert_eq!(cats[1].name, "하의");
    }
}
