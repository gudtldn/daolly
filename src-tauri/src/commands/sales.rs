use sea_orm::DatabaseConnection;
use tauri::State;

use crate::commands::CmdResult;
use crate::services;
use crate::services::sales::{ChartDay, SalesRecord, TopItem, UnpaidRecord};

#[tauri::command]
pub async fn list_sales_records(
    db: State<'_, DatabaseConnection>,
    from: Option<String>,
    to: Option<String>,
) -> CmdResult<Vec<SalesRecord>> {
    Ok(services::sales::list_sales_records(db.inner(), from.as_deref(), to.as_deref()).await?)
}

#[tauri::command]
pub async fn list_unpaid_records(
    db: State<'_, DatabaseConnection>,
) -> CmdResult<Vec<UnpaidRecord>> {
    Ok(services::sales::list_unpaid_records(db.inner()).await?)
}

#[tauri::command]
pub async fn list_weekly_chart(db: State<'_, DatabaseConnection>) -> CmdResult<Vec<ChartDay>> {
    Ok(services::sales::list_weekly_chart(db.inner()).await?)
}

#[tauri::command]
pub async fn list_top_items(
    db: State<'_, DatabaseConnection>,
    from: Option<String>,
    to: Option<String>,
) -> CmdResult<Vec<TopItem>> {
    Ok(services::sales::list_top_items(db.inner(), from.as_deref(), to.as_deref(), 5).await?)
}
