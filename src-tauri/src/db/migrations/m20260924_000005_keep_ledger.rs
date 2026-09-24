//! 장부 보존
//!
//! 예전에는 고객을 지우면 그 고객의 접수와 결제가 CASCADE로 함께 지워져 지난 매출이
//! 사라졌습니다(V8). 이제 고객·접수는 지우는 대신 보관(deleted_at)하고, 결제는 지우는 대신
//! 취소(voided_at)합니다. 돈과 관련된 외래 키는 RESTRICT로 바꿔, 어떤 코드가 실수로 행을
//! 지우려 해도 결제 기록이 함께 사라지지 않게 합니다. 취소·정정 내역은 audit_log에 남깁니다.
//!
//! SQLite에서 외래 키 동작과 CHECK 제약을 바꾸려면 테이블을 다시 만들어야 합니다.
//! 이 마이그레이션은 외래 키 검사를 끈 한 트랜잭션 안에서 실행되고, 커밋 전에
//! `foreign_key_check`로 확인합니다. (`db::run_migrations`)

use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::{ConnectionTrait, DbBackend, Statement};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();

        db.execute_unprepared(r#"ALTER TABLE "customers" ADD COLUMN "deleted_at" varchar"#)
            .await?;

        // 접수: 보관 표시, 고객 외래 키 RESTRICT
        let mut constraints = satisfied_checks(
            db,
            "work_items",
            &[
                "price >= 0",
                "paid_amount >= 0",
                "status IN ('Received', 'Completed', 'PickedUp')",
            ],
        )
        .await?;
        constraints.push(
            r#"FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") ON DELETE RESTRICT"#
                .into(),
        );
        rebuild(
            db,
            "work_items",
            &format!(
                r#""id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
                "customer_id" integer NOT NULL,
                "status" varchar NOT NULL DEFAULT 'Received',
                "description" varchar,
                "price" bigint NOT NULL DEFAULT 0,
                "paid_amount" bigint NOT NULL DEFAULT 0,
                "note" varchar,
                "received_at" varchar NOT NULL,
                "completed_at" varchar,
                "picked_up_at" varchar,
                "created_at" varchar NOT NULL,
                "last_modified_at" varchar NOT NULL,
                "request_id" text,
                "deleted_at" varchar,
                {}"#,
                constraints.join(",\n")
            ),
            "id, customer_id, status, description, price, paid_amount, note, received_at, \
             completed_at, picked_up_at, created_at, last_modified_at, request_id",
            &[
                r#"CREATE INDEX "idx_work_items_customer_id" ON "work_items" ("customer_id")"#,
                r#"CREATE INDEX "idx_work_items_received_at" ON "work_items" ("received_at")"#,
                r#"CREATE UNIQUE INDEX "idx_work_items_request_id" ON "work_items" ("request_id")"#,
            ],
        )
        .await?;

        // 결제: 취소 표시, 접수 외래 키 RESTRICT
        let mut constraints = satisfied_checks(db, "payments", &["amount > 0"]).await?;
        constraints.push(
            r#"FOREIGN KEY ("work_item_id") REFERENCES "work_items" ("id") ON DELETE RESTRICT"#
                .into(),
        );
        rebuild(
            db,
            "payments",
            &format!(
                r#""id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
                "work_item_id" integer NOT NULL,
                "amount" bigint NOT NULL,
                "method" varchar,
                "paid_at" varchar NOT NULL,
                "created_at" varchar NOT NULL,
                "voided_at" varchar,
                {}"#,
                constraints.join(",\n")
            ),
            "id, work_item_id, amount, method, paid_at, created_at",
            &[
                r#"CREATE INDEX "idx_payments_paid_at" ON "payments" ("paid_at")"#,
                r#"CREATE INDEX "idx_payments_work_item_id" ON "payments" ("work_item_id")"#,
            ],
        )
        .await?;

        // 취소·정정·보관 내역 (다른 테이블과 연결하지 않아 무엇을 지워도 남음)
        db.execute_unprepared(
            r#"CREATE TABLE "audit_log" (
                "id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
                "at" varchar NOT NULL,
                "action" varchar NOT NULL,
                "customer_id" integer,
                "work_item_id" integer,
                "payment_id" integer,
                "detail" varchar
            )"#,
        )
        .await?;
        db.execute_unprepared(
            r#"CREATE INDEX "idx_audit_log_work_item_id" ON "audit_log" ("work_item_id")"#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        // 보관·취소된 기록을 되살리게 되므로 되돌리지 않음 (필요하면 업데이트 전 백업에서 복원)
        Err(DbErr::Migration(
            "장부 보존 변경은 되돌릴 수 없습니다. 업데이트 전 백업에서 복원하세요.".into(),
        ))
    }
}

/// 기존 데이터가 모두 만족하는 CHECK 제약만 돌려줍니다.
/// 맞지 않는 행이 있으면 그 제약은 빼고 경고만 남깁니다. (제약 때문에 업데이트가 실패해
/// 프로그램을 열 수 없게 되는 것보다, 규칙은 저장할 때 검사하고 기존 행은 두는 편이 안전)
async fn satisfied_checks<C: ConnectionTrait>(
    db: &C,
    table: &str,
    conditions: &[&str],
) -> Result<Vec<String>, DbErr> {
    let mut checks = Vec::new();
    for condition in conditions {
        let violations = scalar(
            db,
            &format!(r#"SELECT COUNT(*) FROM "{table}" WHERE NOT ({condition})"#),
        )
        .await?;
        if violations == 0 {
            checks.push(format!("CHECK ({condition})"));
        } else {
            log::warn!(
                "{table}: {violations}건이 조건 ({condition})에 맞지 않아 이 제약은 추가하지 않습니다"
            );
        }
    }
    Ok(checks)
}

/// SQLite 권장 절차로 테이블을 다시 만듭니다: 새 테이블 생성 → 복사 → 기존 삭제 → 이름 변경.
/// 인덱스는 기존 테이블과 함께 지워지므로 다시 만들고, AUTOINCREMENT 번호도 이어서 씁니다.
/// (지워진 마지막 행의 번호가 다시 쓰이지 않도록)
async fn rebuild<C: ConnectionTrait>(
    db: &C,
    table: &str,
    definition: &str,
    columns: &str,
    indexes: &[&str],
) -> Result<(), DbErr> {
    let sequence = scalar(
        db,
        &format!("SELECT COALESCE(MAX(seq), 0) FROM sqlite_sequence WHERE name = '{table}'"),
    )
    .await?;

    db.execute_unprepared(&format!(r#"CREATE TABLE "{table}_new" ({definition})"#))
        .await?;
    db.execute_unprepared(&format!(
        r#"INSERT INTO "{table}_new" ({columns}) SELECT {columns} FROM "{table}""#
    ))
    .await?;
    db.execute_unprepared(&format!(r#"DROP TABLE "{table}""#))
        .await?;
    db.execute_unprepared(&format!(r#"ALTER TABLE "{table}_new" RENAME TO "{table}""#))
        .await?;
    for index in indexes {
        db.execute_unprepared(index).await?;
    }

    let current = scalar(
        db,
        &format!("SELECT COALESCE(MAX(seq), 0) FROM sqlite_sequence WHERE name = '{table}'"),
    )
    .await?;
    if sequence > current {
        db.execute_unprepared(&format!(
            "DELETE FROM sqlite_sequence WHERE name = '{table}'"
        ))
        .await?;
        db.execute_unprepared(&format!(
            "INSERT INTO sqlite_sequence (name, seq) VALUES ('{table}', {sequence})"
        ))
        .await?;
    }
    Ok(())
}

async fn scalar<C: ConnectionTrait>(db: &C, sql: &str) -> Result<i64, DbErr> {
    let row = db
        .query_one(Statement::from_string(DbBackend::Sqlite, sql))
        .await?
        .ok_or_else(|| DbErr::Custom(format!("결과가 없습니다: {sql}")))?;
    row.try_get_by_index(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::Migrator;
    use crate::db::{DB_FILE_NAME, connect, run_migrations};
    use sea_orm_migration::MigratorTrait;
    use sea_orm_migration::sea_orm::DatabaseConnection;

    /// 마이그레이션 4까지 적용된(이전 버전) DB에 데이터를 넣고, 5를 실제 기동 경로로 적용
    async fn upgrade_with(seed: &str) -> (tempfile::TempDir, DatabaseConnection) {
        let dir = tempfile::tempdir().unwrap();
        let db = connect(&dir.path().join(DB_FILE_NAME), false)
            .await
            .unwrap();
        Migrator::up(&db, Some(4)).await.unwrap();
        for sql in seed.split(';').filter(|s| !s.trim().is_empty()) {
            db.execute_unprepared(sql).await.unwrap();
        }
        run_migrations::<Migrator>(&db, dir.path(), true)
            .await
            .unwrap();
        (dir, db)
    }

    const SEED: &str = "
        INSERT INTO customers (id, name, created_at, last_modified_at) VALUES (1, '고객', 't', 't');
        INSERT INTO work_items (id, customer_id, status, price, paid_amount, received_at, created_at, last_modified_at)
            VALUES (1, 1, 'Received', 3000, 3000, 't', 't', 't'), (2, 1, 'Received', 5000, 0, 't', 't', 't');
        INSERT INTO work_item_details (work_item_id, item_name, unit_price, quantity) VALUES (1, '와이셔츠', 3000, 1);
        INSERT INTO payments (id, work_item_id, amount, method, paid_at, created_at) VALUES (1, 1, 3000, 'cash', 't', 't');
        DELETE FROM work_items WHERE id = 2;
    ";

    async fn texts(db: &DatabaseConnection, sql: &str) -> Vec<String> {
        db.query_all(Statement::from_string(DbBackend::Sqlite, sql))
            .await
            .unwrap()
            .into_iter()
            .map(|r| r.try_get_by_index(0).unwrap())
            .collect()
    }

    #[tokio::test]
    async fn keeps_data_and_switches_to_restrict() {
        let (_dir, db) = upgrade_with(SEED).await;

        // 데이터와 연결(품목·결제)이 그대로
        assert_eq!(
            scalar(&db, "SELECT COUNT(*) FROM work_items")
                .await
                .unwrap(),
            1
        );
        assert_eq!(
            scalar(&db, "SELECT COUNT(*) FROM work_item_details")
                .await
                .unwrap(),
            1
        );
        assert_eq!(
            scalar(&db, "SELECT COUNT(*) FROM payments").await.unwrap(),
            1
        );
        assert_eq!(scalar(&db, "PRAGMA foreign_keys").await.unwrap(), 1);

        // 돈과 관련된 외래 키는 RESTRICT, 품목은 접수와 함께 (CASCADE)
        for (table, action) in [
            ("work_items", "RESTRICT"),
            ("payments", "RESTRICT"),
            ("work_item_details", "CASCADE"),
        ] {
            assert_eq!(
                texts(
                    &db,
                    &format!("SELECT on_delete FROM pragma_foreign_key_list('{table}')")
                )
                .await,
                vec![action],
                "{table}"
            );
        }
        assert!(
            db.execute_unprepared("DELETE FROM work_items WHERE id = 1")
                .await
                .is_err()
        );

        // 금액 규칙 CHECK
        assert!(
            db.execute_unprepared(
                "INSERT INTO payments (work_item_id, amount, paid_at, created_at) VALUES (1, 0, 't', 't')"
            )
            .await
            .is_err()
        );

        // 인덱스를 다시 만들었고, 지워진 마지막 번호(2)를 다시 쓰지 않음
        let mut indexes = texts(
            &db,
            "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'
             AND tbl_name IN ('work_items', 'payments')",
        )
        .await;
        indexes.sort();
        assert_eq!(
            indexes,
            vec![
                "idx_payments_paid_at",
                "idx_payments_work_item_id",
                "idx_work_items_customer_id",
                "idx_work_items_received_at",
                "idx_work_items_request_id",
            ]
        );
        db.execute_unprepared(
            "INSERT INTO work_items (customer_id, received_at, created_at, last_modified_at) VALUES (1, 't', 't', 't')",
        )
        .await
        .unwrap();
        assert_eq!(
            scalar(&db, "SELECT MAX(id) FROM work_items").await.unwrap(),
            3
        );
    }

    /// 기존 데이터가 맞지 않는 CHECK는 빼고 업데이트를 마침 (프로그램을 못 여는 것보다 안전)
    #[tokio::test]
    async fn skips_check_that_existing_rows_violate() {
        let (_dir, db) = upgrade_with(&format!(
            "{SEED};
             INSERT INTO work_items (id, customer_id, status, price, paid_amount, received_at, created_at, last_modified_at)
                VALUES (5, 1, 'Received', -1000, 0, 't', 't', 't')"
        ))
        .await;

        assert_eq!(
            scalar(&db, "SELECT price FROM work_items WHERE id = 5")
                .await
                .unwrap(),
            -1000
        );
        let schema = texts(
            &db,
            "SELECT sql FROM sqlite_master WHERE name = 'work_items'",
        )
        .await;
        assert!(!schema[0].contains("price >= 0"));
        assert!(schema[0].contains("paid_amount >= 0"));
    }
}
