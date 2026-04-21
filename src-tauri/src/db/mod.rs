pub mod entities;

use sea_orm::DbBackend;
use sea_orm::{ConnectionTrait, Database, DatabaseConnection, DbErr, Statement};

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

    run_migrations(&db).await?;

    Ok(db)
}

/// 001_init.sql을 읽어 테이블과 인덱스를 생성합니다.
/// SQLite는 multi-statement를 지원하지 않으므로 세미콜론으로 분리하여 개별 실행합니다.
async fn run_migrations(db: &DatabaseConnection) -> Result<(), DbErr> {
    let sql = include_str!("migrations/001_init.sql");

    // 세미콜론으로 분리하여 개별 실행 (SQLite는 multi-statement 미지원)
    for stmt in sql.split(';') {
        let trimmed = stmt.trim();
        if trimmed.is_empty() {
            continue;
        }
        db.execute(Statement::from_string(
            DbBackend::Sqlite,
            trimmed.to_owned(),
        ))
        .await?;
    }

    Ok(())
}
