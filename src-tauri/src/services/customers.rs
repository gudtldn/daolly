use sea_orm::prelude::Expr;
use sea_orm::*;

use crate::db::entities::customer;
use crate::services::audit::{self, Entry};
use crate::timestamp;

pub async fn list(
    db: &DatabaseConnection,
    search: Option<String>,
) -> Result<Vec<customer::Model>, DbErr> {
    let mut query = customer::Entity::find().filter(customer::Column::DeletedAt.is_null());

    if let Some(keyword) = search {
        let mut condition = Condition::any()
            .add(customer::Column::Name.contains(&keyword))
            .add(customer::Column::PhoneNumber.contains(&keyword));
        // 전화번호는 하이픈을 넣어 저장하므로 숫자만 비교 (12345678, 01012345678로도 찾기)
        let digits: String = keyword.chars().filter(char::is_ascii_digit).collect();
        if !digits.is_empty() {
            condition = condition.add(Expr::cust_with_values(
                "REPLACE(REPLACE(phone_number, '-', ''), ' ', '') LIKE ?",
                [format!("%{digits}%")],
            ));
        }
        query = query.filter(condition);
    }

    query = query.order_by_asc(customer::Column::Name);

    query.all(db).await
}

/// 삭제하지 않은 고객
pub async fn get_by_id(db: &DatabaseConnection, id: i32) -> Result<Option<customer::Model>, DbErr> {
    customer::Entity::find_by_id(id)
        .filter(customer::Column::DeletedAt.is_null())
        .one(db)
        .await
}

pub fn format_phone(phone: &str) -> String {
    let digits: String = phone.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return phone.to_owned();
    }

    let is_seoul = digits.starts_with("02");
    let area_len = if is_seoul { 2 } else { 3 };
    let max_len = if is_seoul { 10 } else { 11 };

    if digits.len() <= area_len {
        return digits;
    }

    let (area, rest) = digits.split_at(area_len);
    let mid_len = if digits.len() >= max_len { 4 } else { 3 };

    if rest.len() <= mid_len {
        format!("{}-{}", area, rest)
    } else {
        let (mid, end) = rest.split_at(mid_len);
        format!("{}-{}-{}", area, mid, end)
    }
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
        .filter(|s| !s.is_empty())
        .map(|s| format_phone(&s));
    let note = note.map(|s| s.trim().to_owned()).filter(|s| !s.is_empty());

    let now = timestamp::now();
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
        .filter(|s| !s.is_empty())
        .map(|s| format_phone(&s));
    let note = note.map(|s| s.trim().to_owned()).filter(|s| !s.is_empty());

    let mut active: customer::ActiveModel = existing.into();
    active.name = Set(name);
    active.phone_number = Set(phone_number);
    active.note = Set(note);
    active.last_modified_at = Set(timestamp::now());

    active.update(db).await
}

/// 삭제한 고객을 되돌립니다. 없는 고객이면 false
pub async fn restore(db: &DatabaseConnection, id: i32) -> Result<bool, DbErr> {
    let tx = db.begin().await?;
    let Some(existing) = customer::Entity::find_by_id(id).one(&tx).await? else {
        return Ok(false);
    };
    if existing.deleted_at.is_some() {
        audit::record(
            &tx,
            Entry::CustomerRestored {
                customer: &existing,
            },
        )
        .await?;
        let mut active: customer::ActiveModel = existing.into();
        active.deleted_at = Set(None);
        active.last_modified_at = Set(timestamp::now());
        active.update(&tx).await?;
    }
    tx.commit().await?;
    Ok(true)
}

/// 고객을 목록에서 삭제합니다. 지난 접수·결제는 매출 기록으로 남습니다.
/// (예전에는 접수·결제까지 함께 지워져 지난 매출이 사라졌음) 없는 고객이면 false
pub async fn delete(db: &DatabaseConnection, id: i32) -> Result<bool, DbErr> {
    let tx = db.begin().await?;
    let Some(existing) = customer::Entity::find_by_id(id)
        .filter(customer::Column::DeletedAt.is_null())
        .one(&tx)
        .await?
    else {
        return Ok(false);
    };
    audit::record(
        &tx,
        Entry::CustomerDeleted {
            customer: &existing,
        },
    )
    .await?;

    let now = timestamp::now();
    let mut active: customer::ActiveModel = existing.into();
    active.deleted_at = Set(Some(now.clone()));
    active.last_modified_at = Set(now);
    active.update(&tx).await?;
    tx.commit().await?;
    Ok(true)
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
        assert_eq!(c.phone_number, Some("010-1234-5678".to_owned()));
    }

    #[tokio::test]
    async fn format_phone_variations() {
        assert_eq!(format_phone("01012345678"), "010-1234-5678");
        assert_eq!(format_phone("021234567"), "02-123-4567");
        assert_eq!(format_phone("0212345678"), "02-1234-5678");
        assert_eq!(format_phone("010-1234-5678"), "010-1234-5678"); // 이미 포맷팅된 경우 유지
        assert_eq!(format_phone("010 1234 5678"), "010-1234-5678"); // 공백 포함된 경우
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

    /// V5: 010-1234-5678로 저장된 번호를 하이픈 없이 찾기
    #[tokio::test]
    async fn search_phone_by_digits() {
        let db = setup_test_db().await.unwrap();
        create(&db, "홍길동".into(), Some("010-1234-5678".into()), None)
            .await
            .unwrap();

        for keyword in ["12345678", "01012345678", "1234-5678", "5678", "010 1234"] {
            let found = list(&db, Some(keyword.into())).await.unwrap();
            assert_eq!(found.len(), 1, "{keyword}");
        }
        assert!(list(&db, Some("9999".into())).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn delete_customer_success() {
        let db = setup_test_db().await.unwrap();
        let c = create(&db, "삭제대상".into(), None, None).await.unwrap();
        assert!(delete(&db, c.id).await.unwrap());
        assert!(get_by_id(&db, c.id).await.unwrap().is_none());
        assert!(list(&db, None).await.unwrap().is_empty());
        // 두 번 지울 수 없음
        assert!(!delete(&db, c.id).await.unwrap());

        // 되돌리기
        assert!(restore(&db, c.id).await.unwrap());
        assert_eq!(list(&db, None).await.unwrap().len(), 1);
        assert_eq!(
            crate::services::audit::actions(&db).await,
            vec!["customer.delete", "customer.restore"]
        );
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
