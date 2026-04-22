use crate::db::migrations::Migrator;
use sea_orm::{ConnectionTrait, Database, DatabaseConnection, DbBackend, DbErr, Statement};
use sea_orm_migration::MigratorTrait;

/// 테스트용 in-memory SQLite DB를 생성하고 마이그레이션을 실행합니다.
pub async fn setup_test_db() -> Result<DatabaseConnection, DbErr> {
    let db = Database::connect("sqlite::memory:").await?;

    db.execute(Statement::from_string(
        DbBackend::Sqlite,
        "PRAGMA foreign_keys = ON",
    ))
    .await?;

    Migrator::up(&db, None).await?;

    Ok(db)
}
