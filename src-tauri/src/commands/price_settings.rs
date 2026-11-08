use crate::backup::{self, BackupKind};
use crate::commands::{AppError, CmdResult};
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
        .map_err(|e| AppError::file("단가표를 파일 형식으로 바꾸지 못했습니다.", e))?;

    fs::write(&path, json).map_err(|e| AppError::io("단가표 파일을 저장하지 못했습니다.", &e))?;

    Ok(())
}

#[tauri::command]
pub async fn import_price_settings_from_file(
    app: tauri::AppHandle,
    db: State<'_, DatabaseConnection>,
    path: String,
) -> CmdResult<()> {
    let content = fs::read_to_string(&path)
        .map_err(|e| AppError::io("단가표 파일을 읽지 못했습니다.", &e))?;

    let data: price_settings::PriceSettingsExportData =
        serde_json::from_str(&content).map_err(|e| {
            AppError::file(
                "다올리에서 내보낸 단가표 파일이 아니거나 내용이 손상되어 가져올 수 없습니다. 지금 단가표는 바뀌지 않았습니다.",
                e,
            )
        })?;

    // 기존 단가표를 모두 지우고 교체하므로 먼저 백업
    let data_dir = app.path().app_data_dir().map_err(|e| {
        AppError::file(
            "프로그램 데이터 폴더를 찾지 못했습니다. Windows 사용자 폴더 설정에 문제가 있을 수 있습니다.",
            e,
        )
    })?;
    backup::create_backup(db.inner(), &data_dir, BackupKind::PreImport)
        .await
        .map_err(|e| {
            let cause = AppError::from(e);
            AppError::file(
                format!(
                    "가져오기 전에 현재 단가표를 백업하지 못해 멈췄습니다. {}",
                    cause.message()
                ),
                cause.detail().unwrap_or_default(),
            )
        })?;

    price_settings::import_data(db.inner(), data).await?;

    Ok(())
}
