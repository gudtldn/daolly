use crate::commands::CmdResult;
use crate::services;
use chrono::Local;
use sea_orm::DatabaseConnection;
use serde::Serialize;
use tauri::{Manager, State};
use tauri_plugin_opener::OpenerExt;

/// 백업 파일 정보
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub filename: String,
    pub created_at: String,
    pub size_bytes: u64,
}

type DbResult<T> = Result<T, String>;

/// 이전 버전 데이터(customer.db)를 현재 DB로 마이그레이션합니다.
#[tauri::command]
pub async fn migrate_from_legacy(
    app: tauri::AppHandle,
    db: State<'_, DatabaseConnection>,
    legacy_path: std::path::PathBuf,
) -> CmdResult<()> {
    // 1. 현재 데이터 백업 (안전을 위해 명령 레이어에서 수행)
    backup_db(app.clone())
        .await
        .map_err(|e| crate::commands::AppError::Validation(format!("이관 전 백업 실패: {e}")))?;

    // 2. 서비스 레이어 호출하여 실제 마이그레이션 수행
    services::migration::migrate_from_legacy(db.inner(), legacy_path)
        .await
        .map_err(|e| crate::commands::AppError::Validation(e.to_string()))?;

    // 3. 앱 재시작
    app.restart();
}

/// DB가 있는 폴더를 파일 탐색기로 엽니다.
#[tauri::command]
pub async fn open_db_folder(app: tauri::AppHandle) -> DbResult<()> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    app.opener()
        .open_path(dir.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| format!("failed to open folder: {e}"))?;
    Ok(())
}

/// DB 파일의 절대 경로를 반환합니다.
#[tauri::command]
pub async fn get_db_path(app: tauri::AppHandle) -> DbResult<String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    Ok(dir.join("daolly.db").to_string_lossy().into_owned())
}

/// 현재 DB를 backups/ 폴더에 타임스탬프 파일명으로 복사합니다.
#[tauri::command]
pub async fn backup_db(app: tauri::AppHandle) -> DbResult<String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    let db_path = dir.join("daolly.db");
    if !db_path.exists() {
        return Err("DB file not found".to_owned());
    }

    let backups_dir = dir.join("backups");
    std::fs::create_dir_all(&backups_dir)
        .map_err(|e| format!("failed to create backups dir: {e}"))?;

    let now = Local::now().format("%Y%m%d_%H%M%S");
    let filename = format!("daolly_{now}.db");
    let dest = backups_dir.join(&filename);

    std::fs::copy(&db_path, &dest).map_err(|e| format!("backup failed: {e}"))?;
    Ok(filename)
}

/// backups/ 폴더에 있는 백업 목록을 반환합니다.
#[tauri::command]
pub async fn list_backups(app: tauri::AppHandle) -> DbResult<Vec<BackupInfo>> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    let backups_dir = dir.join("backups");
    if !backups_dir.exists() {
        return Ok(vec![]);
    }

    let mut backups: Vec<BackupInfo> = std::fs::read_dir(&backups_dir)
        .map_err(|e| format!("failed to read backups dir: {e}"))?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.extension()?.to_str()? != "db" {
                return None;
            }
            let metadata = std::fs::metadata(&path).ok()?;
            let filename = path.file_name()?.to_string_lossy().into_owned();
            let created_at =
                parse_timestamp_from_filename(&filename).unwrap_or_else(|| "알 수 없음".to_owned());
            Some(BackupInfo {
                filename,
                created_at,
                size_bytes: metadata.len(),
            })
        })
        .collect();

    backups.sort_by(|a, b| b.filename.cmp(&a.filename));
    Ok(backups)
}

/// 지정된 백업 파일로 복원을 시도합니다.
#[tauri::command]
pub async fn restore_db(app: tauri::AppHandle, filename: String) -> DbResult<()> {
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("invalid filename".to_owned());
    }
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    let backup_path = dir.join("backups").join(&filename);
    if !backup_path.exists() {
        return Err("backup file not found".to_owned());
    }

    let pending = dir.join("daolly.db.pending_restore");
    std::fs::copy(&backup_path, &pending).map_err(|e| format!("failed to stage restore: {e}"))?;

    app.restart();
}

fn parse_timestamp_from_filename(filename: &str) -> Option<String> {
    let stem = filename.strip_suffix(".db")?;
    let parts: Vec<&str> = stem.splitn(3, '_').collect();
    if parts.len() != 3 {
        return None;
    }
    let date = parts[1];
    let time = parts[2];
    if date.len() != 8 || time.len() != 6 {
        return None;
    }
    Some(format!(
        "{}.{}.{} {}:{}:{}",
        &date[0..4],
        &date[4..6],
        &date[6..8],
        &time[0..2],
        &time[2..4],
        &time[4..6]
    ))
}
