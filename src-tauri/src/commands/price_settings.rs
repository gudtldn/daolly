use crate::commands::CmdResult;
use crate::services::price_settings;
use sea_orm::DatabaseConnection;
use std::fs;
use tauri::State;

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
    db: State<'_, DatabaseConnection>,
    path: String,
) -> CmdResult<()> {
    let content = fs::read_to_string(&path)
        .map_err(|e| crate::commands::AppError::Validation(format!("파일 읽기 실패: {e}")))?;

    let data: price_settings::PriceSettingsExportData =
        serde_json::from_str(&content).map_err(|e| {
            crate::commands::AppError::Validation(format!("잘못된 JSON 형식입니다: {e}"))
        })?;

    price_settings::import_data(db.inner(), data).await?;

    Ok(())
}
