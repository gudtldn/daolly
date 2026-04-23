use chrono::{DateTime, Datelike, Duration, Local, NaiveDate, Utc};
use sea_orm::prelude::Expr;
use sea_orm::*;
use serde::Serialize;
use std::collections::HashMap;

use crate::db::entities::{customer, payment, work_item, work_item_detail};

/// Parses RFC3339 string and converts to local date.
fn parse_to_local_date(iso: &str) -> Option<NaiveDate> {
    DateTime::parse_from_rfc3339(iso)
        .ok()
        .map(|dt| dt.with_timezone(&Local).date_naive())
}

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
    let mut query = work_item::Entity::find()
        .join(JoinType::LeftJoin, work_item::Relation::Customer.def())
        .select_also(customer::Entity);

    if let Some(f) = from {
        query = query.filter(work_item::Column::ReceivedAt.gte(f));
    }
    if let Some(t) = to {
        if let Ok(date) = NaiveDate::parse_from_str(t, "%Y-%m-%d") {
            let next_day = date + Duration::days(1);
            let next_day_str = next_day.format("%Y-%m-%d").to_string();
            query = query.filter(work_item::Column::ReceivedAt.lt(next_day_str));
        } else {
            let to_end = format!("{}T23:59:59.999", t);
            query = query.filter(work_item::Column::ReceivedAt.lte(to_end));
        }
    }

    let results: Vec<(work_item::Model, Option<customer::Model>)> = query
        .order_by_desc(work_item::Column::ReceivedAt)
        .all(db)
        .await?;

    if results.is_empty() {
        return Ok(vec![]);
    }

    let work_item_ids: Vec<i32> = results.iter().map(|(wi, _)| wi.id).collect();

    // Fetch all payments per work_item for payment_method mapping.
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

    let records = results
        .into_iter()
        .map(|(wi, cust)| {
            let customer_name = cust.map(|c| c.name).unwrap_or_default();
            SalesRecord {
                customer_name,
                payment_method: method_map.get(&wi.id).cloned(),
                work_item_id: wi.id,
                customer_id: wi.customer_id,
                description: wi.description,
                price: wi.price,
                paid_amount: wi.paid_amount,
                received_at: wi.received_at,
            }
        })
        .collect();

    Ok(records)
}

/// Returns all work_items where paid_amount < price, with customer info.
pub async fn list_unpaid_records(db: &DatabaseConnection) -> Result<Vec<UnpaidRecord>, DbErr> {
    let results: Vec<(work_item::Model, Option<customer::Model>)> = work_item::Entity::find()
        .filter(Expr::col(work_item::Column::PaidAmount).lt(Expr::col(work_item::Column::Price)))
        .join(JoinType::LeftJoin, work_item::Relation::Customer.def())
        .select_also(customer::Entity)
        .order_by_desc(work_item::Column::ReceivedAt)
        .all(db)
        .await?;

    if results.is_empty() {
        return Ok(vec![]);
    }

    let records = results
        .into_iter()
        .map(|(wi, cust)| {
            let (name, phone) = cust.map(|c| (c.name, c.phone_number)).unwrap_or_default();
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
/// Groups work_items by the Local date portion of `received_at` and sums their `price`.
pub async fn list_weekly_chart(db: &DatabaseConnection) -> Result<Vec<ChartDay>, DbErr> {
    let now_local = Local::now();
    let today = now_local.date_naive();
    let from_local = today - Duration::days(6);

    // Convert local boundaries to UTC RFC3339 for filtering.
    let from_utc = from_local
        .and_hms_opt(0, 0, 0)
        .expect("valid time")
        .and_local_timezone(Local)
        .unwrap()
        .with_timezone(&Utc)
        .to_rfc3339();

    let to_utc = today
        .and_hms_opt(23, 59, 59)
        .expect("valid time")
        .and_local_timezone(Local)
        .unwrap()
        .with_timezone(&Utc)
        .to_rfc3339();
    let items = work_item::Entity::find()
        .filter(work_item::Column::ReceivedAt.gte(&from_utc))
        .filter(work_item::Column::ReceivedAt.lte(&to_utc))
        .all(db)
        .await?;

    // Sum price per Local date.
    let mut totals: HashMap<NaiveDate, i64> = HashMap::new();
    for item in items {
        if let Some(date) = parse_to_local_date(&item.received_at) {
            *totals.entry(date).or_insert(0) += item.price;
        }
    }

    let weekday_labels = ["월", "화", "수", "목", "금", "토", "일"];

    let mut days: Vec<ChartDay> = (0..7)
        .map(|i| {
            let date = from_local + Duration::days(i as i64);
            let total = totals.get(&date).copied().unwrap_or(0);
            let wd = date.weekday().num_days_from_monday() as usize;
            ChartDay {
                date: date.format("%Y-%m-%d").to_string(),
                label: weekday_labels[wd].to_string(),
                total,
            }
        })
        .collect();

    if let Some(last) = days.last_mut() {
        last.label = "오늘".to_string();
    }

    Ok(days)
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
    let mut query = work_item_detail::Entity::find()
        .select_only()
        .column(work_item_detail::Column::ItemName)
        .column_as(Expr::col(work_item_detail::Column::Quantity).sum(), "total_quantity")
        .group_by(work_item_detail::Column::ItemName)
        .order_by_desc(Expr::cust("total_quantity"));

    // If date filters are provided, they are expected to be UTC strings from FE.
    if from.is_some() || to.is_some() {
        query = query.join_rev(
            JoinType::InnerJoin,
            work_item::Entity::belongs_to(work_item_detail::Entity)
                .from(work_item::Column::Id)
                .to(work_item_detail::Column::WorkItemId)
                .into(),
        );

        if let Some(f) = from {
            query = query.filter(work_item::Column::ReceivedAt.gte(f));
        }
        if let Some(t) = to {
            query = query.filter(work_item::Column::ReceivedAt.lte(t));
        }
    }

    #[derive(FromQueryResult)]
    struct TopItemRow {
        item_name: String,
        total_quantity: i64,
    }

    let rows = query.into_model::<TopItemRow>().all(db).await?;

    let items = rows
        .into_iter()
        .take(limit)
        .enumerate()
        .map(|(i, r)| TopItem {
            rank: i + 1,
            item_name: r.item_name,
            total_quantity: r.total_quantity,
        })
        .collect();

    Ok(items)
}
