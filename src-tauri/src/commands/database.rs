use std::path::PathBuf;

use crate::backup::{self, BackupInfo, BackupKind, BackupOutcome, BackupSettings};
use crate::commands::CmdResult;
use crate::db::DB_FILE_NAME;
use crate::services;
use crate::startup::{StartupNotice, StartupNotices};
use sea_orm::DatabaseConnection;
use tauri::{Manager, State};
use tauri_plugin_opener::OpenerExt;

type DbResult<T> = Result<T, String>;

fn data_dir(app: &tauri::AppHandle) -> DbResult<PathBuf> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("앱 데이터 폴더를 찾을 수 없습니다: {e}"))
}

/// 이전 버전 데이터(customer.db)를 현재 DB로 마이그레이션합니다.
#[tauri::command]
pub async fn migrate_from_legacy(
    app: tauri::AppHandle,
    db: State<'_, DatabaseConnection>,
    legacy_path: std::path::PathBuf,
) -> CmdResult<()> {
    let dir = data_dir(&app).map_err(crate::commands::AppError::Validation)?;

    // 1. 현재 데이터 백업 (안전을 위해 명령 레이어에서 수행)
    backup::create_backup(db.inner(), &dir, BackupKind::PreImport)
        .await
        .map_err(|e| crate::commands::AppError::Validation(format!("이관 전 백업 실패: {e}")))?;

    // 2. 서비스 레이어 호출하여 실제 마이그레이션 수행
    services::migration::migrate_from_legacy(db.inner(), legacy_path)
        .await
        .map_err(|e| crate::commands::AppError::Validation(e.to_string()))?;

    // 3. 앱 재시작
    app.restart();
}

/// 모든 데이터를 삭제합니다. 삭제 전 백업을 수행합니다.
#[tauri::command]
pub async fn clear_all_data(
    app: tauri::AppHandle,
    db: State<'_, DatabaseConnection>,
) -> CmdResult<()> {
    let dir = data_dir(&app).map_err(crate::commands::AppError::Validation)?;

    // 1. 현재 데이터 백업
    backup::create_backup(db.inner(), &dir, BackupKind::PreClear)
        .await
        .map_err(|e| crate::commands::AppError::Validation(format!("삭제 전 백업 실패: {e}")))?;

    // 2. 서비스 레이어 호출하여 모든 데이터 삭제
    services::migration::clear_database(db.inner())
        .await
        .map_err(|e| crate::commands::AppError::Validation(e.to_string()))?;

    // 3. 앱 재시작 (메모리 및 프론트엔드 상태 초기화)
    app.restart();
}

/// DB가 있는 폴더를 파일 탐색기로 엽니다.
#[tauri::command]
pub async fn open_db_folder(app: tauri::AppHandle) -> DbResult<()> {
    let dir = data_dir(&app)?;
    app.opener()
        .open_path(dir.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| format!("폴더를 열지 못했습니다: {e}"))?;
    Ok(())
}

/// DB 파일의 절대 경로를 반환합니다.
#[tauri::command]
pub async fn get_db_path(app: tauri::AppHandle) -> DbResult<String> {
    Ok(data_dir(&app)?
        .join(DB_FILE_NAME)
        .to_string_lossy()
        .into_owned())
}

/// 지금 백업합니다. 추가 백업 폴더가 지정되어 있으면 복사까지 합니다.
#[tauri::command]
pub async fn backup_db(
    app: tauri::AppHandle,
    db: State<'_, DatabaseConnection>,
) -> DbResult<BackupOutcome> {
    let dir = data_dir(&app)?;
    backup::create_backup(db.inner(), &dir, BackupKind::Manual)
        .await
        .map_err(|e| e.to_string())
}

/// 백업 목록을 최신순으로 반환합니다.
#[tauri::command]
pub async fn list_backups(app: tauri::AppHandle) -> DbResult<Vec<BackupInfo>> {
    let dir = data_dir(&app)?;
    backup::list_backups(&dir).map_err(|e| format!("백업 목록을 읽지 못했습니다: {e}"))
}

/// 백업 파일을 검증하고 현재 데이터를 백업한 뒤, 재시작하면서 복원합니다.
#[tauri::command]
pub async fn restore_db(
    app: tauri::AppHandle,
    db: State<'_, DatabaseConnection>,
    filename: String,
) -> DbResult<()> {
    let dir = data_dir(&app)?;
    backup::stage_restore(db.inner(), &dir, &filename)
        .await
        .map_err(|e| e.to_string())?;
    app.restart();
}

/// 추가 백업 폴더 설정과 마지막 복사 결과를 반환합니다.
#[tauri::command]
pub async fn get_backup_settings(app: tauri::AppHandle) -> DbResult<BackupSettings> {
    Ok(backup::load_settings(&data_dir(&app)?))
}

/// 추가 백업 폴더를 지정(path)하거나 해제(null)합니다.
/// 지정하면 바로 백업을 하나 만들어 그 폴더에 복사해 봅니다.
#[tauri::command]
pub async fn set_backup_mirror_dir(
    app: tauri::AppHandle,
    db: State<'_, DatabaseConnection>,
    path: Option<String>,
) -> DbResult<Option<BackupOutcome>> {
    let dir = data_dir(&app)?;
    let mirror = path.map(PathBuf::from);
    let enabled = mirror.is_some();
    backup::set_mirror_dir(&dir, mirror)
        .await
        .map_err(|e| e.to_string())?;
    if !enabled {
        return Ok(None);
    }
    backup::create_backup(db.inner(), &dir, BackupKind::Manual)
        .await
        .map(Some)
        .map_err(|e| e.to_string())
}

/// 기동 중 발생한 알림(복원 결과 등)을 한 번만 반환합니다.
#[tauri::command]
pub fn take_startup_notices(notices: State<'_, StartupNotices>) -> Vec<StartupNotice> {
    notices.take()
}
