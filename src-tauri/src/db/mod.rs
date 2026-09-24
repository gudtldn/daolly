pub mod entities;
pub mod migrations;

use std::path::Path;
use std::time::Duration;

use migrations::Migrator;
use sea_orm::sqlx::ConnectOptions as _;
use sea_orm::sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sea_orm::{DatabaseConnection, DbErr, RuntimeErr, SqlxSqliteConnector};
use sea_orm_migration::prelude::*;

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

    let db = connect(&app_data_dir.join(DB_FILE_NAME), false).await?;

    if let Err(e) = Migrator::up(&db, None).await {
        let _ = db.close_by_ref().await;
        return Err(e);
    }

    Ok(db)
}
