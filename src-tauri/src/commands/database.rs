use std::path::PathBuf;

use crate::backup::{self, BackupInfo, BackupKind, BackupOutcome, BackupSettings};
use crate::commands::{AppError, CmdResult};
use crate::db::DB_FILE_NAME;
use crate::services;
use crate::startup::{StartupNotice, StartupNotices, StartupStatus};
use sea_orm::DatabaseConnection;
use tauri::{Manager, State};
use tauri_plugin_opener::OpenerExt;

fn data_dir(app: &tauri::AppHandle) -> CmdResult<PathBuf> {
    app.path().app_data_dir().map_err(|e| {
        AppError::file(
            "프로그램 데이터 폴더를 찾지 못했습니다. Windows 사용자 폴더 설정에 문제가 있을 수 있습니다.",
            e,
        )
    })
}

/// 위험한 작업 전 백업에 실패하면 작업을 멈추고, 백업이 왜 안 됐는지 함께 알립니다.
fn backup_before(what: &str, e: backup::BackupError) -> AppError {
    let cause = AppError::from(e);
    AppError::file(
        format!(
            "{what} 전에 현재 데이터를 백업하지 못해 멈췄습니다. {}",
            cause.message()
        ),
        cause.detail().unwrap_or_default(),
    )
}

/// 폴더를 탐색기로 엽니다.
fn open_folder(app: &tauri::AppHandle, dir: &std::path::Path) -> CmdResult<()> {
    app.opener()
        .open_path(dir.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| AppError::file("파일 탐색기로 폴더를 열지 못했습니다.", e))
}

/// 이전 버전 데이터(customer.db)를 현재 DB로 마이그레이션합니다.
#[tauri::command]
pub async fn migrate_from_legacy(
    app: tauri::AppHandle,
    db: State<'_, DatabaseConnection>,
    legacy_path: std::path::PathBuf,
) -> CmdResult<()> {
    let dir = data_dir(&app)?;

    // 1. 현재 데이터 백업 (안전을 위해 명령 레이어에서 수행)
    backup::create_backup(db.inner(), &dir, BackupKind::PreImport)
        .await
        .map_err(|e| backup_before("가져오기", e))?;

    // 2. 서비스 레이어 호출하여 실제 마이그레이션 수행
    services::migration::migrate_from_legacy(db.inner(), legacy_path)
        .await
        .map_err(|e| {
            AppError::file(
                "이전 프로그램의 데이터를 가져오지 못했습니다. 선택한 파일이 이전 프로그램의 데이터 파일이 아니거나 손상되었을 수 있습니다. 지금 데이터는 바뀌지 않았습니다.",
                e,
            )
        })?;

    // 3. 앱 재시작
    app.restart();
}

/// 모든 데이터를 삭제합니다. 삭제 전 백업을 수행합니다.
#[tauri::command]
pub async fn clear_all_data(
    app: tauri::AppHandle,
    db: State<'_, DatabaseConnection>,
) -> CmdResult<()> {
    let dir = data_dir(&app)?;

    // 1. 현재 데이터 백업
    backup::create_backup(db.inner(), &dir, BackupKind::PreClear)
        .await
        .map_err(|e| backup_before("전체 삭제", e))?;

    // 2. 서비스 레이어 호출하여 모든 데이터 삭제
    services::migration::clear_database(db.inner()).await?;

    // 3. 앱 재시작 (메모리 및 프론트엔드 상태 초기화)
    app.restart();
}

/// DB가 있는 폴더를 파일 탐색기로 엽니다.
#[tauri::command]
pub async fn open_db_folder(app: tauri::AppHandle) -> CmdResult<()> {
    open_folder(&app, &data_dir(&app)?)
}

/// DB 파일의 절대 경로를 반환합니다.
#[tauri::command]
pub async fn get_db_path(app: tauri::AppHandle) -> CmdResult<String> {
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
) -> CmdResult<BackupOutcome> {
    let dir = data_dir(&app)?;
    Ok(backup::create_backup(db.inner(), &dir, BackupKind::Manual).await?)
}

/// 백업 목록을 최신순으로 반환합니다.
#[tauri::command]
pub async fn list_backups(app: tauri::AppHandle) -> CmdResult<Vec<BackupInfo>> {
    let dir = data_dir(&app)?;
    backup::list_backups(&dir).map_err(|e| AppError::io("백업 목록을 읽지 못했습니다.", &e))
}

/// 백업 파일을 검증하고 현재 데이터를 백업한 뒤, 재시작하면서 복원합니다.
/// DB를 열지 못한 복구 모드에서도 동작합니다.
#[tauri::command]
pub async fn restore_db(app: tauri::AppHandle, filename: String) -> CmdResult<()> {
    let dir = data_dir(&app)?;
    let db = app.try_state::<DatabaseConnection>();
    backup::stage_restore(db.as_ref().map(|s| s.inner()), &dir, &filename).await?;
    log::info!("복원 예약: {filename}");
    app.restart();
}

/// 기동 결과 (DB를 열지 못했으면 복구 화면을 띄우기 위함)
#[tauri::command]
pub fn get_startup_status(status: State<'_, StartupStatus>) -> StartupStatus {
    status.inner().clone()
}

/// 로그 파일이 있는 폴더를 엽니다.
#[tauri::command]
pub async fn open_log_folder(app: tauri::AppHandle) -> CmdResult<()> {
    let dir = app.path().app_log_dir().map_err(|e| {
        AppError::file(
            "로그 폴더를 찾지 못했습니다. Windows 사용자 폴더 설정에 문제가 있을 수 있습니다.",
            e,
        )
    })?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| AppError::io("로그 폴더를 만들지 못했습니다.", &e))?;
    open_folder(&app, &dir)
}

/// 추가 백업 폴더 설정과 마지막 복사 결과를 반환합니다.
#[tauri::command]
pub async fn get_backup_settings(app: tauri::AppHandle) -> CmdResult<BackupSettings> {
    Ok(backup::load_settings(&data_dir(&app)?))
}

/// 추가 백업 폴더를 지정(path)하거나 해제(null)합니다.
/// 지정하면 바로 백업을 하나 만들어 그 폴더에 복사해 봅니다.
#[tauri::command]
pub async fn set_backup_mirror_dir(
    app: tauri::AppHandle,
    db: State<'_, DatabaseConnection>,
    path: Option<String>,
) -> CmdResult<Option<BackupOutcome>> {
    let dir = data_dir(&app)?;
    let mirror = path.map(PathBuf::from);
    let enabled = mirror.is_some();
    backup::set_mirror_dir(&dir, mirror).await?;
    if !enabled {
        return Ok(None);
    }
    Ok(Some(
        backup::create_backup(db.inner(), &dir, BackupKind::Manual).await?,
    ))
}

/// 기동 중 발생한 알림(복원 결과 등)을 한 번만 반환합니다.
#[tauri::command]
pub fn take_startup_notices(notices: State<'_, StartupNotices>) -> Vec<StartupNotice> {
    notices.take()
}
