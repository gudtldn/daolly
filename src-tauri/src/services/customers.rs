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

    query = query.order_by_asc(customer::Column::Name);

    query.all(db).await
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::setup_test_db;

    #[tokio::test]
    async fn create_customer_valid() {
        let db = setup_test_db().await.unwrap();
        let c = create(&db, "홍길동".into(), Some("01012345678".into()), None)
            .await
            .unwrap();
        assert_eq!(c.name, "홍길동");
        assert_eq!(c.phone_number, Some("01012345678".to_owned()));
    }

    #[tokio::test]
    async fn create_customer_trims_whitespace() {
        let db = setup_test_db().await.unwrap();
        let c = create(&db, "  김철수  ".into(), Some("  ".into()), None)
            .await
            .unwrap();
        assert_eq!(c.name, "김철수");
        assert_eq!(c.phone_number, None); // whitespace-only -> None
    }

    #[tokio::test]
    async fn list_with_search() {
        let db = setup_test_db().await.unwrap();
        create(&db, "홍길동".into(), Some("01011111111".into()), None)
            .await
            .unwrap();
        create(&db, "김철수".into(), Some("01022222222".into()), None)
            .await
            .unwrap();

        let results = list(&db, Some("홍".into())).await.unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "홍길동");
    }

    #[tokio::test]
    async fn delete_customer_success() {
        let db = setup_test_db().await.unwrap();
        let c = create(&db, "삭제대상".into(), None, None).await.unwrap();
        let rows = delete(&db, c.id).await.unwrap();
        assert_eq!(rows, 1);
        assert!(get_by_id(&db, c.id).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn list_all_at_once() {
        let db = setup_test_db().await.unwrap();
        for i in 1..=5 {
            create(&db, format!("고객{}", i), None, None).await.unwrap();
        }

        let results = list(&db, None).await.unwrap();
        assert_eq!(results.len(), 5);
        assert_eq!(results[0].name, "고객1");
        assert_eq!(results[4].name, "고객5");
    }
}
