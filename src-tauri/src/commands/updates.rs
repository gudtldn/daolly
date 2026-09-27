use tauri::State;

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
pub fn install_update_now(app: tauri::AppHandle) -> Result<(), String> {
    if updater::install_downloaded(&app)? {
        // Windows는 설치 프로그램 실행과 함께 종료되므로 여기까지 오지 않음
        app.restart();
    }
    Err("설치할 업데이트가 없습니다".to_owned())
}
