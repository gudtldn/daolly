use chrono::{Datelike, Duration, Local, NaiveDate};
use sea_orm::prelude::Expr;
use sea_orm::*;
use serde::Serialize;
use std::collections::HashMap;

use crate::db::entities::{customer, payment, work_item, work_item_detail};

/// Sales record for one work_item (includes customer name and payment method).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesRecord {
    pub work_item_id: i32,
    pub customer_id: i32,
    pub customer_name: String,
    pub description: Option<String>,
    pub price: i64,
    pub paid_amount: i64,
    /// None = credit (no payment recorded)
    pub payment_method: Option<String>,
    pub received_at: String,
}

/// Unpaid work_item with customer info.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnpaidRecord {
    pub work_item_id: i32,
    pub customer_id: i32,
    pub customer_name: String,
    pub customer_phone: Option<String>,
    pub description: Option<String>,
    pub price: i64,
    pub paid_amount: i64,
    /// price - paid_amount
    pub unpaid_amount: i64,
    pub received_at: String,
}

/// Returns work_items received in the given date range with customer name and payment method.
///
/// `from` / `to` are optional "YYYY-MM-DD" strings. Credit items have payment_method = None.
pub async fn list_sales_records(
    db: &DatabaseConnection,
    from: Option<&str>,
    to: Option<&str>,
) -> Result<Vec<SalesRecord>, DbErr> {
    let mut query = work_item::Entity::find();

    if let Some(f) = from {
        query = query.filter(work_item::Column::ReceivedAt.gte(f));
    }
    if let Some(t) = to {
        // Include the full last day (cover sub-second timestamps).
        let to_end = format!("{}T23:59:59.9999", t);
        query = query.filter(work_item::Column::ReceivedAt.lte(to_end));
    }

    let work_items = query
        .order_by_desc(work_item::Column::ReceivedAt)
        .all(db)
        .await?;

    if work_items.is_empty() {
        return Ok(vec![]);
    }

    let customer_ids: Vec<i32> = work_items.iter().map(|wi| wi.customer_id).collect();
    let work_item_ids: Vec<i32> = work_items.iter().map(|wi| wi.id).collect();

    // Fetch customer names.
    let customers = customer::Entity::find()
        .filter(customer::Column::Id.is_in(customer_ids))
        .all(db)
        .await?;
    let customer_map: HashMap<i32, String> =
        customers.into_iter().map(|c| (c.id, c.name)).collect();

    // Fetch all payments per work_item.
    let payments = payment::Entity::find()
        .filter(payment::Column::WorkItemId.is_in(work_item_ids))
        .order_by_asc(payment::Column::PaidAt)
        .all(db)
        .await?;

    let mut method_map: HashMap<i32, String> = HashMap::new();
    for p in payments {
        if let Some(m) = p.method {
            let entry = method_map.entry(p.work_item_id).or_default();
            if !entry.contains(&m) {
                if !entry.is_empty() {
                    entry.push_str(", ");
                }
                entry.push_str(&m);
            }
        }
    }

    let records = work_items
        .into_iter()
        .map(|wi| SalesRecord {
            customer_name: customer_map
                .get(&wi.customer_id)
                .cloned()
                .unwrap_or_default(),
            payment_method: method_map.get(&wi.id).cloned(),
            work_item_id: wi.id,
            customer_id: wi.customer_id,
            description: wi.description,
            price: wi.price,
            paid_amount: wi.paid_amount,
            received_at: wi.received_at,
        })
        .collect();

    Ok(records)
}

/// Returns all work_items where paid_amount < price, with customer info.
pub async fn list_unpaid_records(db: &DatabaseConnection) -> Result<Vec<UnpaidRecord>, DbErr> {
    let work_items = work_item::Entity::find()
        .filter(
            Expr::col(work_item::Column::PaidAmount)
                .lt(Expr::col(work_item::Column::Price)),
        )
        .order_by_desc(work_item::Column::ReceivedAt)
        .all(db)
        .await?;

    if work_items.is_empty() {
        return Ok(vec![]);
    }

    let customer_ids: Vec<i32> = work_items.iter().map(|wi| wi.customer_id).collect();

    let customers = customer::Entity::find()
        .filter(customer::Column::Id.is_in(customer_ids))
        .all(db)
        .await?;

    let customer_map: HashMap<i32, (String, Option<String>)> = customers
        .into_iter()
        .map(|c| (c.id, (c.name, c.phone_number)))
        .collect();

    let records = work_items
        .into_iter()
        .map(|wi| {
            let (name, phone) = customer_map
                .get(&wi.customer_id)
                .cloned()
                .unwrap_or_default();
            UnpaidRecord {
                work_item_id: wi.id,
                customer_id: wi.customer_id,
                customer_name: name,
                customer_phone: phone,
                description: wi.description,
                price: wi.price,
                paid_amount: wi.paid_amount,
                unpaid_amount: wi.price - wi.paid_amount,
                received_at: wi.received_at,
            }
        })
        .collect();

    Ok(records)
}

/// One day entry for the weekly chart.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartDay {
    /// "YYYY-MM-DD"
    pub date: String,
    /// Short weekday label ("월" ~ "일")
    pub label: String,
    /// Sum of work_item prices received on this day
    pub total: i64,
}

/// Returns the last 7 days (inclusive of today) as chart data, ordered oldest -> newest.
///
/// Groups work_items by the date portion of `received_at` and sums their `price`.
pub async fn list_weekly_chart(db: &DatabaseConnection) -> Result<Vec<ChartDay>, DbErr> {
    let today = Local::now().date_naive();
    let from = today - Duration::days(6);

    let from_str = from.format("%Y-%m-%d").to_string();
    let to_str = format!("{}T23:59:59.9999", today.format("%Y-%m-%d"));

    let items = work_item::Entity::find()
        .filter(work_item::Column::ReceivedAt.gte(&from_str))
        .filter(work_item::Column::ReceivedAt.lte(&to_str))
        .all(db)
        .await?;

    // Sum price per date.
    let mut totals: HashMap<NaiveDate, i64> = HashMap::new();
    for item in items {
        if let Some(date) = parse_date_prefix(&item.received_at) {
            *totals.entry(date).or_insert(0) += item.price;
        }
    }

    let weekday_labels = ["월", "화", "수", "목", "금", "토", "일"];

    let mut days: Vec<ChartDay> = (0..7)
        .map(|i| {
            let date = from + Duration::days(i as i64);
            let total = totals.get(&date).copied().unwrap_or(0);
            // chrono weekday: Mon=0 .. Sun=6
            let wd = date.weekday().num_days_from_monday() as usize;
            ChartDay {
                date: date.format("%Y-%m-%d").to_string(),
                label: weekday_labels[wd].to_string(),
                total,
            }
        })
        .collect();

    // Mark the last entry as today.
    if let Some(last) = days.last_mut() {
        last.label = "오늘".to_string();
    }

    Ok(days)
}

/// Parses "YYYY-MM-DD..." -> NaiveDate, ignoring the time portion.
fn parse_date_prefix(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s.get(..10)?, "%Y-%m-%d").ok()
}

/// Top item entry for the popular items list.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopItem {
    pub rank: usize,
    pub item_name: String,
    pub total_quantity: i64,
}

/// Returns the top `limit` most frequently received items in the given date range.
///
/// Groups `work_item_details` by `item_name` and sums `quantity`.
/// `from` / `to` filter the parent `work_item.received_at`.
pub async fn list_top_items(
    db: &DatabaseConnection,
    from: Option<&str>,
    to: Option<&str>,
    limit: usize,
) -> Result<Vec<TopItem>, DbErr> {
    let mut query = work_item::Entity::find();
    if let Some(f) = from {
        query = query.filter(work_item::Column::ReceivedAt.gte(f));
    }
    if let Some(t) = to {
        let to_end = format!("{}T23:59:59.9999", t);
        query = query.filter(work_item::Column::ReceivedAt.lte(to_end));
    }
    let work_items = query.all(db).await?;

    if work_items.is_empty() {
        return Ok(vec![]);
    }

    let work_item_ids: Vec<i32> = work_items.iter().map(|wi| wi.id).collect();

    let details = work_item_detail::Entity::find()
        .filter(work_item_detail::Column::WorkItemId.is_in(work_item_ids))
        .all(db)
        .await?;

    // Sum quantity per item_name in Rust (avoids sea_orm GROUP BY complexity).
    let mut totals: HashMap<String, i64> = HashMap::new();
    for d in details {
        *totals.entry(d.item_name).or_insert(0) += d.quantity as i64;
    }

    let mut sorted: Vec<(String, i64)> = totals.into_iter().collect();
    sorted.sort_by(|a, b| b.1.cmp(&a.1));

    let items = sorted
        .into_iter()
        .take(limit)
        .enumerate()
        .map(|(i, (name, qty))| TopItem {
            rank: i + 1,
            item_name: name,
            total_quantity: qty,
        })
        .collect();

    Ok(items)
}
