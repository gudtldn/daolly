use chrono::Local;
use serde::Serialize;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

/// 백업 파일 정보
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub filename: String,
    pub created_at: String,
    pub size_bytes: u64,
}

// DatabaseConnection State를 주입받지 않으므로 CmdResult 대신 Result<T, String> 사용
type DbResult<T> = Result<T, String>;

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
/// 성공 시 생성된 백업 파일명을 반환합니다.
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

/// backups/ 폴더에 있는 백업 목록을 최신순으로 반환합니다.
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
            // 파일명에서 날짜 파싱: daolly_YYYYMMDD_HHMMSS.db
            let created_at =
                parse_timestamp_from_filename(&filename).unwrap_or_else(|| "알 수 없음".to_owned());
            Some(BackupInfo {
                filename,
                created_at,
                size_bytes: metadata.len(),
            })
        })
        .collect();

    // 최신순 정렬 (파일명 기준: daolly_YYYYMMDD_HHMMSS)
    backups.sort_by(|a, b| b.filename.cmp(&a.filename));
    Ok(backups)
}

/// 지정된 백업 파일을 pending restore로 스테이징하고 앱을 재시작합니다.
/// 재시작 후 lib.rs 초기화에서 pending restore가 있으면 DB에 적용합니다.
#[tauri::command]
pub async fn restore_db(app: tauri::AppHandle, filename: String) -> DbResult<()> {
    // 경로 순회 방지
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

    // 복원 대상 파일을 pending 파일로 복사 (다음 시작 시 적용)
    let pending = dir.join("daolly.db.pending_restore");
    std::fs::copy(&backup_path, &pending).map_err(|e| format!("failed to stage restore: {e}"))?;

    // 앱 재시작 (재시작 후 pending restore 적용)
    app.restart();
}

/// 파일명 `daolly_YYYYMMDD_HHMMSS.db`에서 사람이 읽을 수 있는 날짜 문자열 추옵
fn parse_timestamp_from_filename(filename: &str) -> Option<String> {
    // daolly_20250104_153045.db -> "2025.01.04 15:30:45"
    let stem = filename.strip_suffix(".db")?;
    let parts: Vec<&str> = stem.splitn(3, '_').collect();
    if parts.len() != 3 {
        return None;
    }
    let date = parts[1]; // YYYYMMDD
    let time = parts[2]; // HHMMSS
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
