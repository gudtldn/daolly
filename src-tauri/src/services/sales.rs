//! 매출 조회
//!
//! 기간은 가게 날짜(`NaiveDate`, 양끝 포함)로 받아 `timestamp::day_bounds`로 저장 형식의
//! UTC 경계 `[start, end)`로 바꾼 뒤 비교합니다. 시각은 고정 형식 UTC로 저장되므로
//! 문자열 비교가 곧 시간 비교입니다.

use chrono::{Datelike, Duration, NaiveDate, TimeZone};
use sea_orm::prelude::Expr;
use sea_orm::sea_query::Query;
use sea_orm::*;
use serde::Serialize;
use std::collections::HashMap;

use crate::db::entities::{customer, payment, work_item, work_item_detail};
use crate::timestamp;

/// 기간 조회 경계 (저장 형식 UTC, 반개구간)
struct Bounds {
    start: Option<String>,
    end: Option<String>,
}

impl Bounds {
    fn new<Tz: TimeZone>(from: Option<NaiveDate>, to: Option<NaiveDate>, tz: &Tz) -> Self {
        let (start, end) = timestamp::day_bounds(from, to, tz);
        Self { start, end }
    }

    fn apply<Q: QueryFilter, C: ColumnTrait>(&self, mut query: Q, column: C) -> Q {
        if let Some(start) = &self.start {
            query = query.filter(column.gte(start.as_str()));
        }
        if let Some(end) = &self.end {
            query = query.filter(column.lt(end.as_str()));
        }
        query
    }

    fn values(&self) -> [Value; 2] {
        [self.start.clone().into(), self.end.clone().into()]
    }
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

/// 기간 매출 요약
#[derive(Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevenueSummary {
    /// 기간 중 접수 금액 합계 (발생주의)
    pub total_sales: i64,
    /// 기간 중 입금 합계 (현금주의)
    pub actual_income: i64,
    /// 입금 중 카드
    pub card_income: i64,
    /// 입금 중 현금
    pub cash_income: i64,
    /// 입금 중 계좌이체
    pub transfer_income: i64,
    /// 입금 중 그 밖의 수단 (예전에 '외상'으로 잘못 기록된 결제 등)
    pub other_income: i64,
    /// 입금 중 기간 이전에 접수된 건의 잔금 (미수 수납)
    pub back_payment_income: i64,
}

/// Detailed payment record for the summary view.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentRecord {
    pub payment_id: i32,
    pub work_item_id: i32,
    pub customer_id: i32,
    pub customer_name: String,
    pub description: Option<String>,
    pub amount: i64,
    pub method: Option<String>,
    pub paid_at: String,
    /// 기간 이전에 접수된 건에 대한 입금인지 (미수 수납)
    pub is_back_payment: bool,
}

/// 기간 중 접수된 건 (고객명, 결제 수단 포함). 결제가 없으면 payment_method = None.
pub async fn list_sales_records<Tz: TimeZone>(
    db: &DatabaseConnection,
    from: Option<NaiveDate>,
    to: Option<NaiveDate>,
    tz: &Tz,
) -> Result<Vec<SalesRecord>, DbErr> {
    let bounds = Bounds::new(from, to, tz);
    let query = work_item::Entity::find()
        .join(JoinType::LeftJoin, work_item::Relation::Customer.def())
        .select_also(customer::Entity);
    let results: Vec<(work_item::Model, Option<customer::Model>)> = bounds
        .apply(query, work_item::Column::ReceivedAt)
        .order_by_desc(work_item::Column::ReceivedAt)
        .all(db)
        .await?;

    if results.is_empty() {
        return Ok(vec![]);
    }

    // 결제 수단 표시용. 접수 id 목록을 IN (?, ?, ...)로 넘기면 3만여 건부터 SQLite 변수 한도를
    // 넘어 실패하므로 같은 기간 조건의 서브쿼리로 조회
    let mut in_range = Query::select();
    in_range
        .column(work_item::Column::Id)
        .from(work_item::Entity);
    if let Some(start) = &bounds.start {
        in_range.and_where(Expr::col(work_item::Column::ReceivedAt).gte(start.as_str()));
    }
    if let Some(end) = &bounds.end {
        in_range.and_where(Expr::col(work_item::Column::ReceivedAt).lt(end.as_str()));
    }
    let payments = payment::Entity::find()
        .filter(payment::Column::WorkItemId.in_subquery(in_range.to_owned()))
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

/// 오늘을 포함한 최근 7일의 날짜별 접수 금액 (오래된 날부터)
pub async fn list_weekly_chart<Tz: TimeZone>(
    db: &DatabaseConnection,
    tz: &Tz,
) -> Result<Vec<ChartDay>, DbErr> {
    let today = timestamp::today(tz);
    let first = today - Duration::days(6);
    let bounds = Bounds::new(Some(first), Some(today), tz);
    let items = bounds
        .apply(work_item::Entity::find(), work_item::Column::ReceivedAt)
        .all(db)
        .await?;

    let mut totals: HashMap<NaiveDate, i64> = HashMap::new();
    for item in items {
        if let Some(date) = timestamp::local_date(&item.received_at, tz) {
            *totals.entry(date).or_insert(0) += item.price;
        }
    }

    let weekday_labels = ["월", "화", "수", "목", "금", "토", "일"];
    let mut days: Vec<ChartDay> = (0..7)
        .map(|i| {
            let date = first + Duration::days(i);
            let wd = date.weekday().num_days_from_monday() as usize;
            ChartDay {
                date: date.format("%Y-%m-%d").to_string(),
                label: weekday_labels[wd].to_string(),
                total: totals.get(&date).copied().unwrap_or(0),
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

/// 기간 중 접수된 품목을 수량 순으로 `limit`개
pub async fn list_top_items<Tz: TimeZone>(
    db: &DatabaseConnection,
    from: Option<NaiveDate>,
    to: Option<NaiveDate>,
    tz: &Tz,
    limit: usize,
) -> Result<Vec<TopItem>, DbErr> {
    let bounds = Bounds::new(from, to, tz);
    let query = work_item_detail::Entity::find()
        .select_only()
        .column(work_item_detail::Column::ItemName)
        .column_as(
            Expr::col(work_item_detail::Column::Quantity).sum(),
            "total_quantity",
        )
        .join_rev(
            JoinType::InnerJoin,
            work_item::Entity::belongs_to(work_item_detail::Entity)
                .from(work_item::Column::Id)
                .to(work_item_detail::Column::WorkItemId)
                .into(),
        )
        .group_by(work_item_detail::Column::ItemName)
        .order_by_desc(Expr::cust("total_quantity"))
        .limit(limit as u64);

    #[derive(FromQueryResult)]
    struct TopItemRow {
        item_name: String,
        total_quantity: i64,
    }

    let rows = bounds
        .apply(query, work_item::Column::ReceivedAt)
        .into_model::<TopItemRow>()
        .all(db)
        .await?;

    Ok(rows
        .into_iter()
        .enumerate()
        .map(|(i, r)| TopItem {
            rank: i + 1,
            item_name: r.item_name,
            total_quantity: r.total_quantity,
        })
        .collect())
}

/// 기간 매출 요약: 접수 금액, 입금 합계와 수단별·미수 수납 내역
pub async fn get_revenue_summary<Tz: TimeZone>(
    db: &DatabaseConnection,
    from: Option<NaiveDate>,
    to: Option<NaiveDate>,
    tz: &Tz,
) -> Result<RevenueSummary, DbErr> {
    let bounds = Bounds::new(from, to, tz);

    let sales = db
        .query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT COALESCE(SUM(price), 0) FROM work_items
             WHERE (?1 IS NULL OR received_at >= ?1) AND (?2 IS NULL OR received_at < ?2)",
            bounds.values(),
        ))
        .await?;
    let total_sales: i64 = match sales {
        Some(row) => row.try_get_by_index(0)?,
        None => 0,
    };

    // 결제 수단 값은 영문 코드가 기준이고, 예전 버전의 한글 값도 함께 집계
    let income = db
        .query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT
                COALESCE(SUM(p.amount), 0),
                COALESCE(SUM(CASE WHEN p.method IN ('card', '카드') THEN p.amount END), 0),
                COALESCE(SUM(CASE WHEN p.method IN ('cash', '현금') THEN p.amount END), 0),
                COALESCE(SUM(CASE WHEN p.method IN ('transfer', '계좌이체', '이체') THEN p.amount END), 0),
                COALESCE(SUM(CASE WHEN w.received_at < ?1 THEN p.amount END), 0)
             FROM payments p JOIN work_items w ON w.id = p.work_item_id
             WHERE (?1 IS NULL OR p.paid_at >= ?1) AND (?2 IS NULL OR p.paid_at < ?2)",
            bounds.values(),
        ))
        .await?;

    let mut summary = RevenueSummary {
        total_sales,
        ..Default::default()
    };
    if let Some(row) = income {
        summary.actual_income = row.try_get_by_index(0)?;
        summary.card_income = row.try_get_by_index(1)?;
        summary.cash_income = row.try_get_by_index(2)?;
        summary.transfer_income = row.try_get_by_index(3)?;
        summary.back_payment_income = row.try_get_by_index(4)?;
    }
    summary.other_income =
        summary.actual_income - summary.card_income - summary.cash_income - summary.transfer_income;
    Ok(summary)
}

/// 기간 중 입금 내역 (고객명, 접수 내용 포함)
pub async fn list_payment_records<Tz: TimeZone>(
    db: &DatabaseConnection,
    from: Option<NaiveDate>,
    to: Option<NaiveDate>,
    tz: &Tz,
) -> Result<Vec<PaymentRecord>, DbErr> {
    let bounds = Bounds::new(from, to, tz);
    let query = payment::Entity::find()
        .join(JoinType::InnerJoin, payment::Relation::WorkItem.def())
        .join(JoinType::InnerJoin, work_item::Relation::Customer.def())
        .select_also(work_item::Entity)
        .select_also(customer::Entity);

    let results: Vec<(
        payment::Model,
        Option<work_item::Model>,
        Option<customer::Model>,
    )> = bounds
        .apply(query, payment::Column::PaidAt)
        .order_by_desc(payment::Column::PaidAt)
        .all(db)
        .await?;

    let records = results
        .into_iter()
        .map(|(p, wi, cust)| {
            let customer_name = cust.map(|c| c.name).unwrap_or_default();
            let customer_id = wi.as_ref().map(|w| w.customer_id).unwrap_or(0);
            let description = wi.as_ref().and_then(|w| w.description.clone());
            // 기간 시작 전에 접수된 건에 대한 입금이면 미수 수납
            let is_back_payment = match (&bounds.start, &wi) {
                (Some(start), Some(w)) => w.received_at.as_str() < start.as_str(),
                _ => false,
            };

            PaymentRecord {
                payment_id: p.id,
                work_item_id: p.work_item_id,
                customer_id,
                customer_name,
                description,
                amount: p.amount,
                method: p.method,
                paid_at: p.paid_at,
                is_back_payment,
            }
        })
        .collect();

    Ok(records)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::{customers, payments, work_items};
    use crate::test_helpers::setup_test_db;
    use chrono::FixedOffset;

    fn kst() -> FixedOffset {
        FixedOffset::east_opt(9 * 3600).unwrap()
    }

    fn day(d: u32) -> Option<NaiveDate> {
        NaiveDate::from_ymd_opt(2026, 9, d)
    }

    /// 한국 시각 "9/d HH:MM"을 저장 형식으로
    fn kst_at(d: u32, h: u32, m: u32) -> String {
        let local = day(d).unwrap().and_hms_opt(h, m, 0).unwrap();
        timestamp::format(
            kst()
                .from_local_datetime(&local)
                .unwrap()
                .with_timezone(&chrono::Utc),
        )
    }

    async fn item(db: &DatabaseConnection, cid: i32, price: i64, received_at: String) -> i32 {
        work_items::create(
            db,
            cid,
            Some("접수".into()),
            price,
            None,
            Some(received_at),
            vec![],
        )
        .await
        .unwrap()
        .id
    }

    /// V1~V3: 이른 아침/늦은 밤 접수도 가게 날짜에 정확히 집계되고, 프리셋과 사용자 지정 기간이 같음
    #[tokio::test]
    async fn daily_totals_follow_local_calendar_day() {
        let db = setup_test_db().await.unwrap();
        let cid = customers::create(&db, "고객".into(), None, None)
            .await
            .unwrap()
            .id;
        item(&db, cid, 1000, kst_at(24, 8, 0)).await; // 9/24 오전 8시
        item(&db, cid, 2000, kst_at(24, 20, 0)).await; // 9/24 오후 8시
        item(&db, cid, 4000, kst_at(23, 23, 0)).await; // 9/23 밤 11시
        item(&db, cid, 8000, kst_at(23, 14, 0)).await; // 9/23 오후 2시

        let s24 = get_revenue_summary(&db, day(24), day(24), &kst())
            .await
            .unwrap();
        let s23 = get_revenue_summary(&db, day(23), day(23), &kst())
            .await
            .unwrap();
        assert_eq!(s24.total_sales, 3000);
        assert_eq!(s23.total_sales, 12000);

        let week = get_revenue_summary(&db, day(21), day(27), &kst())
            .await
            .unwrap();
        assert_eq!(week.total_sales, 15000);
        assert_eq!(
            list_sales_records(&db, day(24), day(24), &kst())
                .await
                .unwrap()
                .len(),
            2
        );
    }

    /// V4: 저녁에 결제관리 탭에서 받은 잔금은 그날 하루에만 잡힘 + 미수 수납/수단별 합계
    #[tokio::test]
    async fn evening_payment_counted_once_with_breakdown() {
        let db = setup_test_db().await.unwrap();
        let cid = customers::create(&db, "고객".into(), None, None)
            .await
            .unwrap()
            .id;
        let old = item(&db, cid, 15000, kst_at(20, 10, 0)).await;
        payments::create(
            &db,
            old,
            15000,
            Some("cash".into()),
            Some(kst_at(23, 20, 0)),
        )
        .await
        .unwrap();
        let new = item(&db, cid, 7000, kst_at(23, 9, 0)).await;
        payments::create(&db, new, 5000, Some("card".into()), Some(kst_at(23, 9, 5)))
            .await
            .unwrap();
        payments::create(
            &db,
            new,
            2000,
            Some("계좌이체".into()),
            Some(kst_at(23, 18, 0)),
        )
        .await
        .unwrap();

        let s23 = get_revenue_summary(&db, day(23), day(23), &kst())
            .await
            .unwrap();
        let s24 = get_revenue_summary(&db, day(24), day(24), &kst())
            .await
            .unwrap();
        assert_eq!(
            s23,
            RevenueSummary {
                total_sales: 7000,
                actual_income: 22000,
                card_income: 5000,
                cash_income: 15000,
                transfer_income: 2000,
                other_income: 0,
                back_payment_income: 15000,
            }
        );
        assert_eq!(s24.actual_income, 0);

        let records = list_payment_records(&db, day(23), day(23), &kst())
            .await
            .unwrap();
        assert_eq!(records.len(), 3);
        assert_eq!(records.iter().filter(|r| r.is_back_payment).count(), 1);
    }

    /// V10: 기간 안의 접수가 3만 건을 넘어도 조회됨 (IN 절 변수 한도)
    #[tokio::test]
    async fn sales_records_beyond_sqlite_variable_limit() {
        let db = setup_test_db().await.unwrap();
        let cid = customers::create(&db, "고객".into(), None, None)
            .await
            .unwrap()
            .id;
        let received = kst_at(10, 12, 0);
        db.execute_unprepared(&format!(
            "INSERT INTO work_items (customer_id, status, description, price, paid_amount, received_at, created_at, last_modified_at)
             WITH RECURSIVE seq(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM seq WHERE x < 40000)
             SELECT {cid}, 'Received', 'x', 1000, 0, '{received}', '{received}', '{received}' FROM seq"
        ))
        .await
        .unwrap();

        let records = list_sales_records(&db, day(1), day(30), &kst())
            .await
            .unwrap();
        assert_eq!(records.len(), 40000);
    }

    #[tokio::test]
    async fn weekly_chart_has_seven_days_ending_today() {
        let db = setup_test_db().await.unwrap();
        let days = list_weekly_chart(&db, &kst()).await.unwrap();
        assert_eq!(days.len(), 7);
        assert_eq!(days[6].label, "오늘");
        assert_eq!(
            days[6].date,
            timestamp::today(&kst()).format("%Y-%m-%d").to_string()
        );
    }
}
