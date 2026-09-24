use crate::backup::{self, BackupKind};
use crate::commands::CmdResult;
use crate::services::price_settings;
use sea_orm::DatabaseConnection;
use std::fs;
use tauri::{Manager, State};

#[tauri::command]
pub async fn export_price_settings_to_file(
    db: State<'_, DatabaseConnection>,
    path: String,
) -> CmdResult<()> {
    let data = price_settings::export_data(db.inner()).await?;
    let json = serde_json::to_string_pretty(&data)
        .map_err(|e| crate::commands::AppError::Validation(format!("JSON 변환 실패: {e}")))?;

    fs::write(&path, json)
        .map_err(|e| crate::commands::AppError::Validation(format!("파일 저장 실패: {e}")))?;

    Ok(())
}

#[tauri::command]
pub async fn import_price_settings_from_file(
    app: tauri::AppHandle,
    db: State<'_, DatabaseConnection>,
    path: String,
) -> CmdResult<()> {
    let content = fs::read_to_string(&path)
        .map_err(|e| crate::commands::AppError::Validation(format!("파일 읽기 실패: {e}")))?;

    let data: price_settings::PriceSettingsExportData =
        serde_json::from_str(&content).map_err(|e| {
            crate::commands::AppError::Validation(format!("잘못된 JSON 형식입니다: {e}"))
        })?;

    // 기존 단가표를 모두 지우고 교체하므로 먼저 백업
    let data_dir = app.path().app_data_dir().map_err(|e| {
        crate::commands::AppError::Validation(format!("앱 데이터 폴더를 찾을 수 없습니다: {e}"))
    })?;
    backup::create_backup(db.inner(), &data_dir, BackupKind::PreImport)
        .await
        .map_err(|e| {
            crate::commands::AppError::Validation(format!("가져오기 전 백업 실패: {e}"))
        })?;

    price_settings::import_data(db.inner(), data).await?;

    Ok(())
}
