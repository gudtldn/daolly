use sea_orm::{ConnectionTrait, Database, DatabaseConnection, DbBackend, DbErr, Statement};

/// 테스트용 in-memory SQLite DB를 생성하고 마이그레이션을 실행합니다.
pub async fn setup_test_db() -> Result<DatabaseConnection, DbErr> {
    let db = Database::connect("sqlite::memory:").await?;

    db.execute(Statement::from_string(
        DbBackend::Sqlite,
        "PRAGMA foreign_keys = ON",
    ))
    .await?;

    let sql = include_str!("db/migrations/001_init.sql");
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

    Ok(db)
}
