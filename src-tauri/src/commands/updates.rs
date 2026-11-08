use tauri::State;

use crate::commands::{AppError, CmdResult};
use crate::updater::{self, UpdateStatus, UpdaterState};

/// 현재 업데이트 상태
#[tauri::command]
pub fn get_update_status(state: State<'_, UpdaterState>) -> UpdateStatus {
    state.status()
}

/// 지금 업데이트를 확인하고, 있으면 내려받아 둡니다.
#[tauri::command]
pub async fn check_for_update(app: tauri::AppHandle) -> UpdateStatus {
    updater::check_and_download(&app).await
}

/// 받아 둔 업데이트를 지금 설치하고 다시 시작합니다.
#[tauri::command]
pub fn install_update_now(app: tauri::AppHandle) -> CmdResult<()> {
    // Windows는 설치 프로그램을 실행하며 앱이 종료되고, 설치가 끝나면 다시 열림
    let installed = updater::install_now(&app).map_err(|e| {
        AppError::file(
            "업데이트 설치 프로그램을 실행하지 못했습니다. 지금 버전은 그대로 쓸 수 있고, 프로그램을 끌 때 다시 설치를 시도합니다.",
            e,
        )
    })?;
    if installed {
        return Ok(());
    }
    Err(AppError::Validation(
        "아직 받아 둔 새 버전이 없습니다. 업데이트 확인을 먼저 눌러 주세요.".to_owned(),
    ))
}
