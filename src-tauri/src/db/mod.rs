pub mod entities;
pub mod migrations;

use migrations::Migrator;
use sea_orm::DbBackend;
use sea_orm::{ConnectionTrait, Database, DatabaseConnection, DbErr, Statement};
use sea_orm_migration::prelude::*;

/// app_data_dir 아래에 daolly.db를 생성하고, 테이블이 없으면 마이그레이션을 실행합니다.
pub async fn init(app_data_dir: std::path::PathBuf) -> Result<DatabaseConnection, DbErr> {
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| DbErr::Custom(format!("failed to create app data directory: {e}")))?;

    let db_path = app_data_dir.join("daolly.db");
    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

    let db = Database::connect(&db_url).await?;

    // SQLite는 FK가 기본 비활성이므로 명시적으로 활성화
    db.execute(Statement::from_string(
        DbBackend::Sqlite,
        "PRAGMA foreign_keys = ON",
    ))
    .await?;

    Migrator::up(&db, None).await?;

    Ok(db)
}
