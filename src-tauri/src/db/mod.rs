pub mod entities;
pub mod migrations;

use std::path::Path;
use std::time::Duration;

use migrations::Migrator;
use sea_orm::sqlx::ConnectOptions as _;
use sea_orm::sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sea_orm::{
    ConnectionTrait, DatabaseConnection, DbBackend, DbErr, RuntimeErr, SqlxSqliteConnector,
    Statement, TransactionTrait,
};
use sea_orm_migration::MigratorTrait;

use crate::backup::{self, BackupKind};

/// app_data_dir 아래 DB 파일 이름
pub const DB_FILE_NAME: &str = "daolly.db";

/// SQLite 파일에 연결합니다.
///
/// - 커넥션은 1개만 사용합니다 (단일 사용자 앱에서 SQLITE_BUSY 방지).
/// - PRAGMA는 커넥션 옵션으로 지정해야 풀이 커넥션을 새로 만들 때도 유지됩니다.
/// - SQL 문장 로그는 끕니다 (로그 파일이 쿼리로 가득 차는 것 방지).
pub async fn connect(path: &Path, read_only: bool) -> Result<DatabaseConnection, DbErr> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(!read_only)
        .read_only(read_only)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(5))
        .disable_statement_logging();

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|e| DbErr::Conn(RuntimeErr::SqlxError(e)))?;

    Ok(SqlxSqliteConnector::from_sqlx_sqlite_pool(pool))
}

/// app_data_dir 아래 daolly.db를 열고(없으면 생성) 마이그레이션을 실행합니다.
///
/// 실패하면 커넥션을 닫은 뒤 에러를 돌려줍니다. (Windows에서 파일 잠금이 남지 않도록)
pub async fn init(app_data_dir: &Path) -> Result<DatabaseConnection, DbErr> {
    std::fs::create_dir_all(app_data_dir)
        .map_err(|e| DbErr::Custom(format!("failed to create app data directory: {e}")))?;

    let path = app_data_dir.join(DB_FILE_NAME);
    let has_data = path.exists();
    let db = connect(&path, false).await?;

    if let Err(e) = run_migrations::<Migrator>(&db, app_data_dir, has_data).await {
        let _ = db.close_by_ref().await;
        return Err(e);
    }

    Ok(db)
}

/// 대기 중인 마이그레이션을 안전하게 적용합니다.
///
/// 1. 기존 데이터가 있으면 먼저 백업합니다.
/// 2. 전체를 한 트랜잭션으로 실행합니다. (sea-orm-migration은 SQLite에서 트랜잭션을 쓰지 않아
///    중간에 실패하면 반쯤 적용된 스키마가 남음)
/// 3. SQLite는 테이블 재생성 시 DROP TABLE이 ON DELETE CASCADE로 자식 행을 지우므로
///    FK를 끈 상태에서 실행하고, 커밋 전에 `foreign_key_check`로 무결성을 확인합니다.
pub(crate) async fn run_migrations<M: MigratorTrait>(
    db: &DatabaseConnection,
    data_dir: &Path,
    has_data: bool,
) -> Result<(), DbErr> {
    let pending = M::get_pending_migrations(db).await?;
    if pending.is_empty() {
        return Ok(());
    }
    log::info!("DB 마이그레이션 {}건 적용 시작", pending.len());

    if has_data {
        let outcome = backup::create_backup(db, data_dir, BackupKind::PreMigration)
            .await
            .map_err(|e| {
                DbErr::Custom(format!(
                    "업데이트 전 백업에 실패해 DB 구조 변경을 중단했습니다: {e}"
                ))
            })?;
        log::info!("업데이트 전 백업: {}", outcome.info.filename);
    }

    // PRAGMA foreign_keys는 트랜잭션 안에서 바꿀 수 없으므로 밖에서 끔 (커넥션이 1개라 같은 커넥션에 적용)
    db.execute_unprepared("PRAGMA foreign_keys = OFF").await?;
    let result = migrate_in_transaction::<M>(db).await;
    let restored = db.execute_unprepared("PRAGMA foreign_keys = ON").await;
    result?;
    restored?;

    log::info!("DB 마이그레이션 완료");
    Ok(())
}

async fn migrate_in_transaction<M: MigratorTrait>(db: &DatabaseConnection) -> Result<(), DbErr> {
    let txn = db.begin().await?;

    // 커넥션이 교체되어 FK가 다시 켜진 상태라면 CASCADE 위험이 있으므로 중단
    let fk_enabled: i32 = txn
        .query_one(Statement::from_string(
            DbBackend::Sqlite,
            "PRAGMA foreign_keys",
        ))
        .await?
        .and_then(|row| row.try_get_by_index(0).ok())
        .unwrap_or(1);
    if fk_enabled != 0 {
        return Err(DbErr::Custom(
            "마이그레이션을 위해 외래 키 검사를 끄지 못했습니다".to_owned(),
        ));
    }

    M::up(&txn, None).await?;

    let violations = txn
        .query_all(Statement::from_string(
            DbBackend::Sqlite,
            "PRAGMA foreign_key_check",
        ))
        .await?;
    if !violations.is_empty() {
        // txn을 커밋하지 않고 반환하면 롤백됨
        return Err(DbErr::Custom(format!(
            "DB 구조 변경 후 외래 키 위반이 {}건 있어 변경을 취소했습니다",
            violations.len()
        )));
    }

    txn.commit().await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backup::list_backups;
    use crate::services::{customers, payments, work_items};
    use sea_orm_migration::prelude::*;

    /// 실제 마이그레이션 뒤에 테스트용 마이그레이션을 덧붙인 Migrator
    macro_rules! test_migrator {
        ($migrator:ident, $migration:ident, $name:literal, |$manager:ident| $body:block) => {
            struct $migration;
            impl MigrationName for $migration {
                fn name(&self) -> &str {
                    $name
                }
            }
            #[async_trait::async_trait]
            impl MigrationTrait for $migration {
                async fn up(&self, $manager: &SchemaManager) -> Result<(), DbErr> $body
            }
            struct $migrator;
            impl MigratorTrait for $migrator {
                fn migrations() -> Vec<Box<dyn MigrationTrait>> {
                    let mut all = Migrator::migrations();
                    all.push(Box::new($migration));
                    all
                }
            }
        };
    }

    test_migrator!(
        FailingMigrator,
        FailingMigration,
        "m29990101_000001_failing",
        |manager| {
            let db = manager.get_connection();
            db.execute_unprepared("CREATE TABLE half_done (x INTEGER)")
                .await?;
            db.execute_unprepared("THIS IS NOT SQL").await?;
            Ok(())
        }
    );

    // SQLite에서 컬럼 제약을 바꿀 때 쓰는 테이블 재생성 패턴
    test_migrator!(
        RebuildMigrator,
        RebuildCustomers,
        "m29990101_000002_rebuild",
        |manager| {
            let db = manager.get_connection();
            db.execute_unprepared(
                "CREATE TABLE customers_new (
                id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                phone_number TEXT,
                note TEXT,
                created_at TEXT NOT NULL,
                last_modified_at TEXT NOT NULL,
                deleted_at TEXT
            )",
            )
            .await?;
            db.execute_unprepared("INSERT INTO customers_new SELECT * FROM customers")
                .await?;
            db.execute_unprepared("DROP TABLE customers").await?;
            db.execute_unprepared("ALTER TABLE customers_new RENAME TO customers")
                .await?;
            Ok(())
        }
    );

    async fn scalar(db: &DatabaseConnection, sql: &str) -> i64 {
        db.query_one(Statement::from_string(DbBackend::Sqlite, sql))
            .await
            .unwrap()
            .unwrap()
            .try_get_by_index(0)
            .unwrap()
    }

    async fn seed(db: &DatabaseConnection) {
        let c = customers::create(db, "고객".into(), None, None)
            .await
            .unwrap();
        let wi = work_items::create(db, c.id, Some("접수".into()), 1000, None, None, vec![])
            .await
            .unwrap();
        payments::create(db, wi.id, 1000, Some("cash".into()), None)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn fresh_database_is_migrated_without_backup() {
        let dir = tempfile::tempdir().unwrap();
        let db = init(dir.path()).await.unwrap();
        assert_eq!(scalar(&db, "PRAGMA foreign_keys").await, 1);
        assert!(list_backups(dir.path()).unwrap().is_empty());
    }

    #[tokio::test]
    async fn failed_migration_rolls_back_and_keeps_backup() {
        let dir = tempfile::tempdir().unwrap();
        let db = init(dir.path()).await.unwrap();
        seed(&db).await;

        let result = run_migrations::<FailingMigrator>(&db, dir.path(), true).await;
        assert!(result.is_err());

        // 반쯤 만든 테이블과 마이그레이션 기록이 남지 않음
        assert_eq!(
            scalar(
                &db,
                "SELECT COUNT(*) FROM sqlite_master WHERE name = 'half_done'"
            )
            .await,
            0
        );
        assert_eq!(
            scalar(
                &db,
                "SELECT COUNT(*) FROM seaql_migrations WHERE version LIKE 'm2999%'"
            )
            .await,
            0
        );
        // 데이터와 FK 설정이 그대로이고, 업데이트 전 백업이 남음
        assert_eq!(scalar(&db, "SELECT COUNT(*) FROM payments").await, 1);
        assert_eq!(scalar(&db, "PRAGMA foreign_keys").await, 1);
        let kinds: Vec<BackupKind> = list_backups(dir.path())
            .unwrap()
            .iter()
            .map(|b| b.kind)
            .collect();
        assert_eq!(kinds, vec![BackupKind::PreMigration]);
    }

    #[tokio::test]
    async fn table_rebuild_does_not_cascade_delete_children() {
        let dir = tempfile::tempdir().unwrap();
        let db = init(dir.path()).await.unwrap();
        seed(&db).await;

        run_migrations::<RebuildMigrator>(&db, dir.path(), true)
            .await
            .unwrap();

        assert_eq!(scalar(&db, "SELECT COUNT(*) FROM customers").await, 1);
        assert_eq!(scalar(&db, "SELECT COUNT(*) FROM work_items").await, 1);
        assert_eq!(scalar(&db, "SELECT COUNT(*) FROM payments").await, 1);
        assert_eq!(scalar(&db, "PRAGMA foreign_keys").await, 1);

        // 재생성한 테이블에도 외래 키가 계속 동작 (접수가 있는 고객 행은 지울 수 없음)
        assert!(
            db.execute_unprepared("DELETE FROM customers WHERE id = 1")
                .await
                .is_err()
        );
        assert_eq!(scalar(&db, "SELECT COUNT(*) FROM work_items").await, 1);
    }

    async fn text(db: &DatabaseConnection, sql: &str) -> String {
        db.query_one(Statement::from_string(DbBackend::Sqlite, sql))
            .await
            .unwrap()
            .unwrap()
            .try_get_by_index(0)
            .unwrap()
    }

    /// 0.2.7이 남긴 DB(시각 형식이 섞임)를 열면 백업 후 시각이 정규화되고 인덱스가 생김
    #[tokio::test]
    async fn upgrading_v0_2_7_database_normalizes_timestamps() {
        let dir = tempfile::tempdir().unwrap();
        {
            let db = connect(&dir.path().join(DB_FILE_NAME), false)
                .await
                .unwrap();
            // 0.2.7까지의 마이그레이션만 적용된 상태
            Migrator::up(&db, Some(2)).await.unwrap();
            db.execute_unprepared(
                "INSERT INTO customers (id, name, created_at, last_modified_at)
                 VALUES (1, '고객', '2026-09-20T01:00:00.123456789+00:00', '2026-09-20T01:00:00+00:00')",
            )
            .await
            .unwrap();
            db.execute_unprepared(
                "INSERT INTO work_items (id, customer_id, status, price, paid_amount, received_at, created_at, last_modified_at)
                 VALUES (1, 1, 'Received', 1000, 0, '2026-09-23T23:00:00', '2026-09-23T14:00:00+00:00', '2026-09-23T14:00:00+00:00')",
            )
            .await
            .unwrap();
            db.close().await.unwrap();
        }

        let db = init(dir.path()).await.unwrap();

        assert_eq!(
            scalar(&db, "SELECT COUNT(*) FROM seaql_migrations").await,
            Migrator::migrations().len() as i64
        );
        assert_eq!(
            text(&db, "SELECT created_at FROM customers").await,
            "2026-09-20T01:00:00.123Z"
        );
        // 타임존 없는 값은 이 PC의 현지 시각으로 해석
        assert_eq!(
            text(&db, "SELECT received_at FROM work_items").await,
            crate::timestamp::normalize_legacy("2026-09-23T23:00:00", &chrono::Local).unwrap()
        );
        assert_eq!(
            scalar(
                &db,
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_work_items_received_at'"
            )
            .await,
            1
        );
        let kinds: Vec<BackupKind> = list_backups(dir.path())
            .unwrap()
            .iter()
            .map(|b| b.kind)
            .collect();
        assert_eq!(kinds, vec![BackupKind::PreMigration]);
    }
}
