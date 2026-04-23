use sea_orm::DatabaseConnection;
use tauri::State;

use crate::commands::CmdResult;
use crate::services;
use crate::services::sales::{
    ChartDay, PaymentRecord, RevenueSummary, SalesRecord, TopItem, UnpaidRecord,
};

#[tauri::command]
pub async fn get_revenue_summary(
    db: State<'_, DatabaseConnection>,
    from: Option<String>,
    to: Option<String>,
) -> CmdResult<RevenueSummary> {
    Ok(services::sales::get_revenue_summary(db.inner(), from.as_deref(), to.as_deref()).await?)
}

#[tauri::command]
pub async fn list_payment_records(
    db: State<'_, DatabaseConnection>,
    from: Option<String>,
    to: Option<String>,
) -> CmdResult<Vec<PaymentRecord>> {
    Ok(services::sales::list_payment_records(db.inner(), from.as_deref(), to.as_deref()).await?)
}

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
