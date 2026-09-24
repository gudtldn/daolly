use chrono::{Local, NaiveDate};
use sea_orm::DatabaseConnection;
use tauri::State;

use crate::commands::CmdResult;
use crate::services;
use crate::services::sales::{
    ChartDay, PaymentRecord, RevenueSummary, SalesRecord, TopItem, UnpaidRecord,
};

// 기간(from, to)은 가게 날짜 "YYYY-MM-DD"이며 양끝을 포함합니다.
// 날짜 경계는 이 PC의 로컬 타임존 기준으로 계산합니다.

#[tauri::command]
pub async fn get_revenue_summary(
    db: State<'_, DatabaseConnection>,
    from: Option<NaiveDate>,
    to: Option<NaiveDate>,
) -> CmdResult<RevenueSummary> {
    Ok(services::sales::get_revenue_summary(db.inner(), from, to, &Local).await?)
}

#[tauri::command]
pub async fn list_payment_records(
    db: State<'_, DatabaseConnection>,
    from: Option<NaiveDate>,
    to: Option<NaiveDate>,
) -> CmdResult<Vec<PaymentRecord>> {
    Ok(services::sales::list_payment_records(db.inner(), from, to, &Local).await?)
}

#[tauri::command]
pub async fn list_sales_records(
    db: State<'_, DatabaseConnection>,
    from: Option<NaiveDate>,
    to: Option<NaiveDate>,
) -> CmdResult<Vec<SalesRecord>> {
    Ok(services::sales::list_sales_records(db.inner(), from, to, &Local).await?)
}

#[tauri::command]
pub async fn list_unpaid_records(
    db: State<'_, DatabaseConnection>,
) -> CmdResult<Vec<UnpaidRecord>> {
    Ok(services::sales::list_unpaid_records(db.inner()).await?)
}

#[tauri::command]
pub async fn list_weekly_chart(db: State<'_, DatabaseConnection>) -> CmdResult<Vec<ChartDay>> {
    Ok(services::sales::list_weekly_chart(db.inner(), &Local).await?)
}

#[tauri::command]
pub async fn list_top_items(
    db: State<'_, DatabaseConnection>,
    from: Option<NaiveDate>,
    to: Option<NaiveDate>,
) -> CmdResult<Vec<TopItem>> {
    Ok(services::sales::list_top_items(db.inner(), from, to, &Local, 5).await?)
}
