use chrono::Local;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbErr, EntityTrait, Set, TransactionTrait};
use std::collections::HashSet;
use std::path::PathBuf;

use crate::db::entities::{category, customer, payment, price_item, work_item, work_item_detail};
use crate::timestamp;

/// 모든 데이터를 삭제합니다.
pub async fn clear_database(db: &DatabaseConnection) -> Result<(), DbErr> {
    db.transaction::<_, (), DbErr>(|txn| {
        Box::pin(async move {
            // 하위 테이블부터 삭제 (외래 키 제약 조건 고려)
            work_item_detail::Entity::delete_many().exec(txn).await?;
            payment::Entity::delete_many().exec(txn).await?;
            work_item::Entity::delete_many().exec(txn).await?;
            customer::Entity::delete_many().exec(txn).await?;
            price_item::Entity::delete_many().exec(txn).await?;
            category::Entity::delete_many().exec(txn).await?;
            Ok(())
        })
    })
    .await
    .map_err(|e| match e {
        sea_orm::TransactionError::Connection(e) => e,
        sea_orm::TransactionError::Transaction(e) => e,
    })
}

pub async fn migrate_from_legacy(
    db: &DatabaseConnection,
    legacy_path: PathBuf,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // 1. 레거시 DB 연결 (읽기 전용)
    let legacy_db = crate::db::connect(&legacy_path, true).await?;
    let result = import_legacy(db, &legacy_db).await;
    let _ = legacy_db.close_by_ref().await;
    result
}

async fn import_legacy(
    db: &DatabaseConnection,
    legacy_db: &DatabaseConnection,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // 2~3. 트랜잭션 시작 (실패하면 전체 롤백)
    // 외래 키 검사는 켠 채로 둡니다: 자식 → 부모 순으로 지우고 부모 → 자식 순으로 넣으므로
    // 끌 필요가 없고, 끈 채로 실패하면 이후 CASCADE가 동작하지 않는 문제가 있었습니다.
    let tx = db.begin().await?;

    // 3.1 기존 데이터 완전 초기화 (Clean Slate)
    tx.execute(sea_orm::Statement::from_string(
        sea_orm::DatabaseBackend::Sqlite,
        "DELETE FROM payments",
    ))
    .await?;
    tx.execute(sea_orm::Statement::from_string(
        sea_orm::DatabaseBackend::Sqlite,
        "DELETE FROM work_item_details",
    ))
    .await?;
    tx.execute(sea_orm::Statement::from_string(
        sea_orm::DatabaseBackend::Sqlite,
        "DELETE FROM work_items",
    ))
    .await?;
    tx.execute(sea_orm::Statement::from_string(
        sea_orm::DatabaseBackend::Sqlite,
        "DELETE FROM customers",
    ))
    .await?;

    // 4. 고객 데이터 이관
    let legacy_customers = legacy_db
        .query_all(sea_orm::Statement::from_string(
            sea_orm::DatabaseBackend::Sqlite,
            "SELECT * FROM customers",
        ))
        .await?;

    let now = timestamp::now();
    let mut imported_customer_ids = HashSet::new();
    let mut customer_models = Vec::new();

    for row in legacy_customers {
        let old_id: i32 = row.try_get("", "id")?;
        let name: String = row.try_get("", "name")?;
        let phone_number: Option<String> = row
            .try_get::<Option<String>>("", "phone_number")?
            .map(|s| crate::services::customers::format_phone(&s));
        let note: Option<String> = row.try_get("", "note")?;

        customer_models.push(customer::ActiveModel {
            id: Set(old_id),
            name: Set(name),
            phone_number: Set(phone_number),
            note: Set(note),
            created_at: Set(now.clone()),
            last_modified_at: Set(now.clone()),
        });
        imported_customer_ids.insert(old_id);
    }

    if !customer_models.is_empty() {
        // 고객 데이터 벌크 삽입
        customer::Entity::insert_many(customer_models)
            .exec(&tx)
            .await?;
    }

    // 4.1 고아 데이터 처리를 위한 '이름 없음' 고객 생성
    // 레거시 고객 ID와 겹치지 않도록 충분히 큰 ID 부여
    let orphan_customer_id = 999999;
    let orphan_model = customer::ActiveModel {
        id: Set(orphan_customer_id),
        name: Set("이름 없음 (고아 데이터)".to_owned()),
        phone_number: Set(None),
        note: Set(Some(
            "구버전에서 고객 정보가 유실된 세탁물들입니다.".to_owned(),
        )),
        created_at: Set(now.clone()),
        last_modified_at: Set(now.clone()),
    };
    customer::Entity::insert(orphan_model).exec(&tx).await?;

    // 5. 작업(Garment) 데이터 이관
    let legacy_garments = legacy_db
        .query_all(sea_orm::Statement::from_string(
            sea_orm::DatabaseBackend::Sqlite,
            "SELECT * FROM garments",
        ))
        .await?;

    for row in legacy_garments {
        let old_id: i32 = row.try_get("", "id")?;
        let reception_date: Option<String> = row.try_get("", "reception_date")?;
        let processing_date: Option<String> = row.try_get("", "processing_date")?;
        let is_completed: i32 = row.try_get("", "is_completed")?;
        let contents: Option<String> = row.try_get("", "contents")?;
        let price: i64 = row.try_get("", "price")?;
        let note: Option<String> = row.try_get("", "note")?;
        let mut customer_id: i32 = row.try_get("", "customer_id")?;

        // 고아 데이터 처리: 주인 없는 세탁물은 가상 고객에게 배정
        if !imported_customer_ids.contains(&customer_id) {
            customer_id = orphan_customer_id;
        }

        // --- 정교한 상태 매핑 로직 ---
        let mut status = work_item::WorkItemStatus::Received;
        let mut picked_up_at = None;
        let mut completed_at = None;
        let mut paid_amount = 0;

        // 레거시 날짜(YYYY-MM-DD)는 이 PC 현지 자정으로 보고 저장 형식(UTC)으로 변환
        let recv_at = reception_date
            .as_deref()
            .and_then(|d| timestamp::normalize_legacy(d, &Local))
            .unwrap_or_else(|| now.clone());

        let proc_at = processing_date
            .as_deref()
            .and_then(|d| timestamp::normalize_legacy(d, &Local));

        // 1. 납품일자가 있으면 무조건 수거완료(PickedUp)
        if proc_at.is_some() {
            status = work_item::WorkItemStatus::PickedUp;
            picked_up_at = proc_at.clone();
            completed_at = proc_at.clone(); // 납품되었으면 당연히 완료된 것
        }
        // 2. 납품일자는 없는데 완납이면 작업완료(Completed)
        else if is_completed == 1 {
            status = work_item::WorkItemStatus::Completed;
            completed_at = Some(recv_at.clone()); // 시점을 알 수 없으므로 접수일로 대체
        }

        // 3. 완납 처리
        if is_completed == 1 {
            paid_amount = price;
        }

        let model = work_item::ActiveModel {
            id: Set(old_id),
            customer_id: Set(customer_id),
            status: Set(status),
            description: Set(contents),
            price: Set(price),
            paid_amount: Set(paid_amount),
            note: Set(note),
            received_at: Set(recv_at.clone()),
            completed_at: Set(completed_at),
            picked_up_at: Set(picked_up_at),
            created_at: Set(now.clone()),
            last_modified_at: Set(now.clone()),
        };
        work_item::Entity::insert(model).exec(&tx).await?;

        // 4. 완납 시 결제 내역(payments) 추가
        if is_completed == 1 && price > 0 {
            let payment_model = payment::ActiveModel {
                work_item_id: Set(old_id),
                amount: Set(price),
                method: Set(Some("transfer".to_owned())),
                paid_at: Set(proc_at.unwrap_or(recv_at)), // 납품일 우선, 없으면 접수일
                created_at: Set(now.clone()),
                ..Default::default()
            };
            payment::Entity::insert(payment_model).exec(&tx).await?;
        }
    }

    tx.commit().await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::entities::{customer, payment, work_item};
    use crate::test_helpers::setup_test_db;
    use sea_orm::{Database, EntityTrait};

    #[tokio::test]
    async fn test_full_migration_flow() {
        // 1. 테스트용 레거시 DB 생성
        let dir = tempfile::tempdir().unwrap();
        let legacy_path = dir.path().join("test_legacy.db");
        let legacy_url = format!("sqlite:{}?mode=rwc", legacy_path.display());

        {
            let legacy_db = Database::connect(&legacy_url).await.unwrap();
            legacy_db.execute(sea_orm::Statement::from_string(sea_orm::DatabaseBackend::Sqlite, "CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, phone_number TEXT, note TEXT)")).await.unwrap();
            legacy_db.execute(sea_orm::Statement::from_string(sea_orm::DatabaseBackend::Sqlite, "CREATE TABLE garments (id INTEGER PRIMARY KEY, reception_date TEXT, processing_date TEXT, is_completed INTEGER, contents TEXT, price INTEGER, note TEXT, customer_id INTEGER)")).await.unwrap();

            // 고객 데이터 삽입
            legacy_db.execute(sea_orm::Statement::from_string(sea_orm::DatabaseBackend::Sqlite, "INSERT INTO customers (id, name, phone_number, note) VALUES (1, '홍길동', '01012345678', '메모')")).await.unwrap();
            legacy_db.execute(sea_orm::Statement::from_string(sea_orm::DatabaseBackend::Sqlite, "INSERT INTO customers (id, name, phone_number, note) VALUES (2, '김철수', NULL, NULL)")).await.unwrap();

            // 작업 데이터 삽입
            legacy_db.execute(sea_orm::Statement::from_string(sea_orm::DatabaseBackend::Sqlite, "INSERT INTO garments (id, reception_date, processing_date, is_completed, contents, price, note, customer_id) VALUES (101, '2024-01-01', '2024-01-02', 1, '양복 상의', 5000, '빨리', 1)")).await.unwrap();
            legacy_db.execute(sea_orm::Statement::from_string(sea_orm::DatabaseBackend::Sqlite, "INSERT INTO garments (id, reception_date, processing_date, is_completed, contents, price, note, customer_id) VALUES (102, '2024-01-03', NULL, 0, '셔츠', 2000, NULL, 2)")).await.unwrap();
            legacy_db.execute(sea_orm::Statement::from_string(sea_orm::DatabaseBackend::Sqlite, "INSERT INTO garments (id, reception_date, processing_date, is_completed, contents, price, note, customer_id) VALUES (103, '2024-01-04', NULL, 0, '고아 옷', 3000, '주인찾기', 99)")).await.unwrap();
        }

        // 2. 새 DB 초기화 및 마이그레이션 실행
        let db = setup_test_db().await.unwrap();
        migrate_from_legacy(&db, legacy_path.clone())
            .await
            .expect("Migration failed");

        // 3. 검증
        // 3.1 고객 수 검증 (기존 2명 + 이름 없음 1명 = 3명)
        let customers = customer::Entity::find().all(&db).await.unwrap();
        assert_eq!(customers.len(), 3);
        let hgd = customers.iter().find(|c| c.name == "홍길동").unwrap();
        assert_eq!(hgd.phone_number, Some("010-1234-5678".to_owned())); // 포매팅 확인
        assert!(customers.iter().any(|c| c.name.contains("이름 없음")));

        // 3.2 작업 수 검증 (총 3건)
        let work_items = work_item::Entity::find().all(&db).await.unwrap();
        assert_eq!(work_items.len(), 3);

        // 3.3 상태 매핑 검증 (작업 1: PickedUp)
        let wi1 = work_item::Entity::find_by_id(101)
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(wi1.status, work_item::WorkItemStatus::PickedUp);
        assert_eq!(wi1.paid_amount, 5000);
        assert!(wi1.completed_at.is_some());

        // 3.4 고아 데이터 연결 검증 (작업 3: customer_id = 999999)
        let wi3 = work_item::Entity::find_by_id(103)
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(wi3.customer_id, 999999);
        assert_eq!(wi3.description, Some("고아 옷".to_owned()));

        // 3.5 결제 내역 검증 (완납된 작업 1에 대해 1건 생성)
        let payments = payment::Entity::find().all(&db).await.unwrap();
        assert_eq!(payments.len(), 1);
        assert_eq!(payments[0].amount, 5000);
        assert_eq!(payments[0].method, Some("transfer".to_owned()));
    }

    /// 이관이 중간에 실패해도 기존 데이터는 그대로이고, 외래 키 검사(CASCADE)가 계속 동작해야 함
    #[tokio::test]
    async fn failed_import_keeps_data_and_foreign_keys() {
        let dir = tempfile::tempdir().unwrap();
        let legacy_path = dir.path().join("broken_legacy.db");
        {
            let legacy_url = format!("sqlite:{}?mode=rwc", legacy_path.display());
            let legacy_db = Database::connect(&legacy_url).await.unwrap();
            // garments 테이블이 없어 고객 이관 후 실패
            legacy_db
                .execute_unprepared("CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, phone_number TEXT, note TEXT)")
                .await
                .unwrap();
        }

        let db = setup_test_db().await.unwrap();
        let existing = crate::services::customers::create(&db, "기존 고객".into(), None, None)
            .await
            .unwrap();
        let wi = crate::services::work_items::create(
            &db,
            existing.id,
            Some("접수".into()),
            1000,
            None,
            None,
            vec![],
        )
        .await
        .unwrap();

        assert!(migrate_from_legacy(&db, legacy_path).await.is_err());

        // 트랜잭션 롤백으로 기존 데이터 유지
        let names: Vec<String> = customer::Entity::find()
            .all(&db)
            .await
            .unwrap()
            .into_iter()
            .map(|c| c.name)
            .collect();
        assert_eq!(names, vec!["기존 고객"]);

        // 외래 키가 켜져 있어 고객 삭제 시 접수도 함께 삭제됨
        crate::services::customers::delete(&db, existing.id)
            .await
            .unwrap();
        assert!(
            work_item::Entity::find_by_id(wi.id)
                .one(&db)
                .await
                .unwrap()
                .is_none()
        );
    }
}
