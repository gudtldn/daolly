//! 저장된 시각을 UTC 저장 형식 하나로 통일하고, 조회에 쓰는 컬럼에 인덱스를 추가합니다.
//!
//! 이전 버전은 UTC(`+00:00`, 소수 자릿수 제각각), 타임존 없는 현지 시각(수정 모달·결제관리 탭),
//! 레거시 이관 자정 값(`YYYY-MM-DDT00:00:00`)을 섞어 저장해 일별 매출이 틀리게 집계되었습니다.
//! 타임존이 없는 값은 이 PC의 현지 시각으로 입력된 것이므로 로컬 타임존으로 해석합니다.

use chrono::{Local, TimeZone};
use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::{ConnectionTrait, DbBackend, Statement};

use crate::timestamp;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// 정규화할 시각 컬럼
const TIMESTAMP_COLUMNS: [(&str, &[&str]); 3] = [
    ("customers", &["created_at", "last_modified_at"]),
    (
        "work_items",
        &[
            "received_at",
            "completed_at",
            "picked_up_at",
            "created_at",
            "last_modified_at",
        ],
    ),
    ("payments", &["paid_at", "created_at"]),
];

/// (인덱스, 테이블, 컬럼): 기간 조회와 외래 키(CASCADE) 검색에 쓰임
const INDEXES: [(&str, &str, &str); 6] = [
    ("idx_work_items_customer_id", "work_items", "customer_id"),
    ("idx_work_items_received_at", "work_items", "received_at"),
    ("idx_payments_work_item_id", "payments", "work_item_id"),
    ("idx_payments_paid_at", "payments", "paid_at"),
    (
        "idx_work_item_details_work_item_id",
        "work_item_details",
        "work_item_id",
    ),
    ("idx_price_items_category_id", "price_items", "category_id"),
];

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        normalize_timestamps(manager.get_connection(), &Local).await?;

        for (name, table, column) in INDEXES {
            manager
                .create_index(
                    Index::create()
                        .if_not_exists()
                        .name(name)
                        .table(Alias::new(table))
                        .col(Alias::new(column))
                        .to_owned(),
                )
                .await?;
        }
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        for (name, table, _) in INDEXES {
            manager
                .drop_index(
                    Index::drop()
                        .if_exists()
                        .name(name)
                        .table(Alias::new(table))
                        .to_owned(),
                )
                .await?;
        }
        // 시각 형식은 되돌리지 않음 (정규화된 값도 이전 코드가 읽을 수 있음)
        Ok(())
    }
}

/// 시각 컬럼을 저장 형식으로 바꿉니다. 타임존이 없는 값은 `tz` 현지 시각으로 해석하고,
/// 해석할 수 없는 값은 로그만 남기고 그대로 둡니다.
pub(crate) async fn normalize_timestamps<C: ConnectionTrait, Tz: TimeZone>(
    db: &C,
    tz: &Tz,
) -> Result<(), DbErr> {
    for (table, columns) in TIMESTAMP_COLUMNS {
        for column in columns {
            let rows = db
                .query_all(Statement::from_string(
                    DbBackend::Sqlite,
                    format!("SELECT id, {column} FROM {table} WHERE {column} IS NOT NULL"),
                ))
                .await?;
            for row in rows {
                let id: i32 = row.try_get_by_index(0)?;
                let value: String = row.try_get_by_index(1)?;
                match timestamp::normalize_legacy(&value, tz) {
                    Some(normalized) if normalized == value => {}
                    Some(normalized) => {
                        db.execute(Statement::from_sql_and_values(
                            DbBackend::Sqlite,
                            format!("UPDATE {table} SET {column} = ? WHERE id = ?"),
                            [normalized.into(), id.into()],
                        ))
                        .await?;
                    }
                    None => log::warn!(
                        "{table}.{column} (id {id}): 해석할 수 없는 시각이라 그대로 둡니다: {value}"
                    ),
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::sales;
    use crate::test_helpers::setup_test_db;
    use chrono::{FixedOffset, NaiveDate};
    use sea_orm_migration::sea_orm::DatabaseConnection;

    fn kst() -> FixedOffset {
        FixedOffset::east_opt(9 * 3600).unwrap()
    }

    async fn column(db: &DatabaseConnection, sql: &str) -> Vec<Option<String>> {
        db.query_all(Statement::from_string(DbBackend::Sqlite, sql))
            .await
            .unwrap()
            .into_iter()
            .map(|r| r.try_get_by_index(0).unwrap())
            .collect()
    }

    /// 예전 버전이 남긴 세 가지 형식이 섞인 DB를 정규화하면 일별 매출이 맞게 나옴
    #[tokio::test]
    async fn normalizes_mixed_formats_and_fixes_daily_totals() {
        let db = setup_test_db().await.unwrap();
        db.execute_unprepared(
            "INSERT INTO customers (id, name, created_at, last_modified_at)
             VALUES (1, '고객', '2026-09-20T01:00:00.123456789+00:00', '2026-09-20T01:00:00+00:00')",
        )
        .await
        .unwrap();
        // A: 9/24 08:00 KST (서버 UTC), B: 9/24 20:00 KST (서버 UTC)
        // C: 9/23 23:00 KST (수정 모달의 현지 시각), D: 2024-01-01 레거시 이관 자정, E: 해석 불가
        db.execute_unprepared(
            "INSERT INTO work_items (id, customer_id, status, price, paid_amount, received_at, picked_up_at, created_at, last_modified_at) VALUES
             (1, 1, 'Received', 1000, 0, '2026-09-23T23:00:00.123456+00:00', NULL, 'x', 'x'),
             (2, 1, 'Received', 2000, 0, '2026-09-24T11:00:00.5+00:00', NULL, 'x', 'x'),
             (3, 1, 'PickedUp', 4000, 0, '2026-09-23T23:00:00', '2026-09-24T09:30:00', 'x', 'x'),
             (4, 1, 'PickedUp', 8000, 0, '2024-01-01T00:00:00', '2024-01-02T00:00:00', 'x', 'x')",
        )
        .await
        .unwrap();
        db.execute_unprepared(
            "INSERT INTO payments (work_item_id, amount, method, paid_at, created_at) VALUES
             (3, 4000, 'cash', '2026-09-23T20:00:00', '2026-09-23T11:00:00+00:00')",
        )
        .await
        .unwrap();

        normalize_timestamps(&db, &kst()).await.unwrap();

        assert_eq!(
            column(&db, "SELECT received_at FROM work_items ORDER BY id").await,
            vec![
                Some("2026-09-23T23:00:00.123Z".to_owned()),
                Some("2026-09-24T11:00:00.500Z".to_owned()),
                Some("2026-09-23T14:00:00.000Z".to_owned()),
                Some("2023-12-31T15:00:00.000Z".to_owned()),
            ]
        );
        assert_eq!(
            column(&db, "SELECT picked_up_at FROM work_items WHERE id = 3").await,
            vec![Some("2026-09-24T00:30:00.000Z".to_owned())]
        );
        assert_eq!(
            column(&db, "SELECT paid_at FROM payments").await,
            vec![Some("2026-09-23T11:00:00.000Z".to_owned())]
        );
        // 해석할 수 없는 값은 그대로
        assert_eq!(
            column(&db, "SELECT DISTINCT created_at FROM work_items").await,
            vec![Some("x".to_owned())]
        );

        let d = |day| NaiveDate::from_ymd_opt(2026, 9, day);
        let s24 = sales::get_revenue_summary(&db, d(24), d(24), &kst())
            .await
            .unwrap();
        let s23 = sales::get_revenue_summary(&db, d(23), d(23), &kst())
            .await
            .unwrap();
        assert_eq!(s24.total_sales, 3000);
        assert_eq!(s23.total_sales, 4000);
        assert_eq!(s23.actual_income, 4000);
        assert_eq!(s24.actual_income, 0);

        // 두 번 실행해도 결과가 같음
        normalize_timestamps(&db, &kst()).await.unwrap();
        let again = sales::get_revenue_summary(&db, d(24), d(24), &kst())
            .await
            .unwrap();
        assert_eq!(again.total_sales, 3000);
    }
}
