use serde_json::Value;
use tauri::{Manager, State};

use crate::commands::{AppError, CmdResult};
use crate::usage::{self, UsageLog};

/// 화면에서 모아 둔 사용 기록을 오늘 파일에 덧붙입니다.
#[tauri::command]
pub async fn record_usage(log: State<'_, UsageLog>, events: Vec<Value>) -> Result<(), String> {
    log.append(&events)
        .map_err(|e| format!("사용 기록을 남기지 못했습니다: {e}"))
}

/// 오류 로그와 사용 기록을 zip 파일 하나로 저장합니다. (개발자에게 보내기 위함)
#[tauri::command]
pub async fn export_usage_logs(app: tauri::AppHandle, path: String) -> CmdResult<()> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| AppError::Validation(format!("로그 폴더를 찾을 수 없습니다: {e}")))?;
    tauri::async_runtime::spawn_blocking(move || usage::export_zip(&log_dir, path.as_ref()))
        .await
        .map_err(|e| AppError::Validation(format!("기록을 저장하지 못했습니다: {e}")))?
        .map_err(|e| AppError::Validation(format!("기록을 저장하지 못했습니다: {e}")))
}
