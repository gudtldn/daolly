use chrono::Utc;
use sea_orm::{ConnectionTrait, Database, DatabaseConnection, EntityTrait, Set, TransactionTrait};
use std::collections::HashSet;
use std::path::PathBuf;

use crate::db::entities::{customer, payment, work_item};

pub async fn migrate_from_legacy(
    db: &DatabaseConnection,
    legacy_path: PathBuf,
) -> Result<(), Box<dyn std::error::Error>> {
    // 1. 레거시 DB 연결
    let legacy_url = format!("sqlite:{}?mode=ro", legacy_path.display());
    let legacy_db = Database::connect(&legacy_url).await?;

    // 2. 외래 키 체크 일시 중지
    db.execute(sea_orm::Statement::from_string(
        sea_orm::DatabaseBackend::Sqlite,
        "PRAGMA foreign_keys = OFF",
    ))
    .await?;

    // 3. 트랜잭션 시작
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

    let now = Utc::now().to_rfc3339();
    let mut imported_customer_ids = HashSet::new();

    for row in legacy_customers {
        let old_id: i32 = row.try_get("", "id")?;
        let name: String = row.try_get("", "name")?;
        let phone_number: Option<String> = row.try_get("", "phone_number")?;
        let note: Option<String> = row.try_get("", "note")?;

        let model = customer::ActiveModel {
            id: Set(old_id),
            name: Set(name),
            phone_number: Set(phone_number),
            note: Set(note),
            created_at: Set(now.clone()),
            last_modified_at: Set(now.clone()),
        };
        customer::Entity::insert(model).exec(&tx).await?;
        imported_customer_ids.insert(old_id);
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

        // ISO 8601 변환
        let recv_at = reception_date
            .as_ref()
            .map(|d| format!("{}T00:00:00", d))
            .unwrap_or_else(|| Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string());

        let proc_at = processing_date.as_ref().map(|d| format!("{}T00:00:00", d));

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

    // 6. 외래 키 체크 다시 활성화
    db.execute(sea_orm::Statement::from_string(
        sea_orm::DatabaseBackend::Sqlite,
        "PRAGMA foreign_keys = ON",
    ))
    .await?;

    Ok(())
}
