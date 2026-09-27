//! 배포 전 리허설: 실제 가게 DB의 사본에 이번 버전의 마이그레이션을 적용해 봅니다.
//!
//! 사용법 (가게 PC와 같은 한국 시간대의 PC에서, 프로그램을 끈 뒤 복사한 사본으로):
//!
//! ```text
//! cd src-tauri
//! # PowerShell
//! $env:DAOLLY_REHEARSAL_DB="C:\rehearsal\daolly.db"; cargo test rehearsal -- --ignored --nocapture
//! # bash
//! DAOLLY_REHEARSAL_DB=/path/to/daolly.db cargo test rehearsal -- --ignored --nocapture
//! ```
//!
//! 지정한 파일은 다시 임시 폴더로 복사해서 쓰므로 바뀌지 않습니다.
//! 출력에는 건수·금액·날짜·번호만 있고 고객 이름·전화번호는 없어 그대로 공유해도 됩니다.

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;
use std::time::Instant;

use chrono::{DateTime, Duration, Local, NaiveDate, NaiveDateTime};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};

use crate::db::migrations::m20260924_000003_normalize_timestamps::TIMESTAMP_COLUMNS;
use crate::db::{self, DB_FILE_NAME, Violation};
use crate::services::payments::won;
use crate::services::sales;
use crate::timestamp;

/// 건수·금액처럼 마이그레이션 전후가 같아야 하는 값
#[derive(Debug, PartialEq)]
struct Totals {
    customers: i64,
    work_items: i64,
    details: i64,
    payments: i64,
    price_sum: i64,
    payment_sum: i64,
}

#[tokio::test]
#[ignore = "DAOLLY_REHEARSAL_DB로 가게 DB 사본을 지정해 직접 실행"]
async fn rehearsal() {
    let source = std::env::var("DAOLLY_REHEARSAL_DB")
        .expect("DAOLLY_REHEARSAL_DB에 가게 DB 사본(daolly.db) 경로를 지정하세요");
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(DB_FILE_NAME);
    std::fs::copy(&source, &path).expect("DB 사본을 복사하지 못했습니다");
    let journal = format!("{source}-journal");
    if Path::new(&journal).exists() {
        panic!("{journal}가 있습니다. 프로그램을 끈 상태에서 다시 복사하세요.");
    }

    println!(
        "\n==== 다올리 배포 리허설 ({}) ====",
        Local::now().format("%Y-%m-%d %H:%M")
    );
    println!("시간대: {}", Local::now().format("%:z"));

    // 1. 적용 전
    let before_db = db::connect(&path, false).await.unwrap();
    println!("\n[적용 전]");
    println!("적용된 마이그레이션: {:?}", migrations(&before_db).await);
    println!(
        "무결성 검사: {}",
        text(&before_db, "PRAGMA integrity_check").await
    );
    let before = totals(&before_db).await;
    println!("{before:?}");
    print_timestamp_formats(&before_db).await;
    print_review_items(&before_db).await;
    let orphans_before = db::foreign_key_violations(&before_db).await.unwrap();
    print_orphans(&before_db, &orphans_before).await;
    before_db.close().await.unwrap();

    // 2. 실제 기동 경로로 적용 (업데이트 전 백업 → 한 트랜잭션으로 마이그레이션)
    let started = Instant::now();
    let after_db = db::init(dir.path())
        .await
        .expect("마이그레이션 실패: 이 상태로 배포하면 프로그램이 복구 화면으로 열립니다");
    println!("\n[적용] {:.1}초 걸림", started.elapsed().as_secs_f64());
    let backups: Vec<String> = std::fs::read_dir(dir.path().join("backups"))
        .map(|entries| {
            entries
                .filter_map(|e| e.ok()?.file_name().into_string().ok())
                .collect()
        })
        .unwrap_or_default();
    println!("만든 백업: {backups:?}");

    // 3. 적용 후
    println!("\n[적용 후]");
    println!("적용된 마이그레이션: {:?}", migrations(&after_db).await);
    let integrity = text(&after_db, "PRAGMA integrity_check").await;
    println!("무결성 검사: {integrity}");
    let orphans_after = db::foreign_key_violations(&after_db).await.unwrap();
    let introduced: BTreeSet<_> = orphans_after.difference(&orphans_before).cloned().collect();
    println!(
        "부모 없는 행: {}건 (이번 업데이트로 새로 생긴 것 {}건)",
        orphans_after.len(),
        introduced.len()
    );
    let after = totals(&after_db).await;
    println!("{after:?}");
    print_timestamp_formats(&after_db).await;
    for table in ["work_items", "payments"] {
        let sql = text(
            &after_db,
            &format!("SELECT sql FROM sqlite_master WHERE name = '{table}'"),
        )
        .await;
        let checks: Vec<&str> = sql
            .lines()
            .map(str::trim)
            .filter(|l| l.starts_with("CHECK"))
            .map(|l| l.trim_end_matches(','))
            .collect();
        println!("{table} CHECK: {checks:?}");
    }
    print_daily_totals(&after_db).await;

    // 4. 판정
    println!("\n[판정]");
    let same = before == after;
    println!("건수·금액 합계 전후 동일: {}", mark(same));
    println!("무결성: {}", mark(integrity == "ok"));
    println!(
        "외래 키 (새로 끊어진 연결 없음): {}",
        mark(introduced.is_empty())
    );
    assert!(
        same && integrity == "ok" && introduced.is_empty(),
        "리허설 실패"
    );
    println!("리허설 통과\n");
}

fn mark(ok: bool) -> &'static str {
    if ok { "통과" } else { "실패" }
}

async fn totals(db: &DatabaseConnection) -> Totals {
    Totals {
        customers: scalar(db, "SELECT COUNT(*) FROM customers").await,
        work_items: scalar(db, "SELECT COUNT(*) FROM work_items").await,
        details: scalar(db, "SELECT COUNT(*) FROM work_item_details").await,
        payments: scalar(db, "SELECT COUNT(*) FROM payments").await,
        price_sum: scalar(db, "SELECT COALESCE(SUM(price), 0) FROM work_items").await,
        payment_sum: scalar(db, "SELECT COALESCE(SUM(amount), 0) FROM payments").await,
    }
}

async fn migrations(db: &DatabaseConnection) -> Vec<String> {
    texts(db, "SELECT version FROM seaql_migrations ORDER BY version").await
}

/// 시각 값의 형식 분포. 적용 후에는 '저장 형식'과 '해석 불가'만 남아야 함
async fn print_timestamp_formats(db: &DatabaseConnection) {
    println!("시각 형식:");
    for (table, columns) in TIMESTAMP_COLUMNS {
        for column in columns {
            let rows = db
                .query_all(Statement::from_string(
                    DbBackend::Sqlite,
                    format!("SELECT id, {column} FROM {table} WHERE {column} IS NOT NULL"),
                ))
                .await
                .unwrap();
            let mut counts: BTreeMap<&str, usize> = BTreeMap::new();
            let mut unparseable = Vec::new();
            for row in rows {
                let id: i32 = row.try_get_by_index(0).unwrap();
                let value: String = row.try_get_by_index(1).unwrap();
                let kind = classify(&value);
                if kind == "해석 불가" {
                    unparseable.push(id);
                }
                *counts.entry(kind).or_default() += 1;
            }
            print!("  {table}.{column}: {counts:?}");
            if !unparseable.is_empty() {
                print!(
                    " 해석 불가 id: {:?}",
                    &unparseable[..unparseable.len().min(20)]
                );
            }
            println!();
        }
    }
}

fn classify(value: &str) -> &'static str {
    if timestamp::normalize_input(value).is_ok_and(|v| v == value) {
        "저장 형식"
    } else if DateTime::parse_from_rfc3339(value).is_ok() {
        "타임존 있음"
    } else if [
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%dT%H:%M",
    ]
    .iter()
    .any(|f| NaiveDateTime::parse_from_str(value, f).is_ok())
    {
        "현지 시각(타임존 없음)"
    } else if NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok() {
        "날짜만"
    } else {
        "해석 불가"
    }
}

/// 자동으로 고치지 않고 사용자가 확인할 데이터
async fn print_review_items(db: &DatabaseConnection) {
    println!("확인할 데이터:");
    let items = [
        (
            "외상으로 기록된 결제 (데이터 관리 화면에서 정리)",
            "SELECT COUNT(*), COALESCE(SUM(amount), 0) FROM payments WHERE method IN ('credit', '외상')",
        ),
        (
            "청구 금액보다 많이 받은 접수 (초과분 합계)",
            "SELECT COUNT(*), COALESCE(SUM(paid_amount - price), 0) FROM work_items WHERE paid_amount > price",
        ),
        (
            "가격이 음수인 접수",
            "SELECT COUNT(*), COALESCE(SUM(price), 0) FROM work_items WHERE price < 0",
        ),
        (
            "금액이 0 이하인 결제",
            "SELECT COUNT(*), COALESCE(SUM(amount), 0) FROM payments WHERE amount <= 0",
        ),
        (
            "단가 음수 또는 수량 1 미만인 품목",
            "SELECT COUNT(*), 0 FROM work_item_details WHERE unit_price < 0 OR quantity < 1",
        ),
        (
            "고객이 없는 접수",
            "SELECT COUNT(*), 0 FROM work_items WHERE customer_id NOT IN (SELECT id FROM customers)",
        ),
        (
            "결제 수단이 비어 있거나 알 수 없는 결제",
            "SELECT COUNT(*), COALESCE(SUM(amount), 0) FROM payments WHERE method IS NULL OR method NOT IN
             ('cash', 'card', 'transfer', 'credit', '현금', '카드', '계좌이체', '이체', '외상')",
        ),
    ];
    for (label, sql) in items {
        let row = db
            .query_one(Statement::from_string(DbBackend::Sqlite, sql))
            .await
            .unwrap()
            .unwrap();
        let count: i64 = row.try_get_by_index(0).unwrap();
        let amount: i64 = row.try_get_by_index(1).unwrap();
        println!("  {label}: {count}건 ({})", won(amount));
    }
}

/// 부모 행이 없는 행(고아 데이터). 업데이트는 그대로 두고 진행하지만, 새 버전의 매출·미수금
/// 화면에서는 빠지거나 고객 이름 없이 보일 수 있어 개수와 금액, 기록된 날짜를 확인합니다.
async fn print_orphans(db: &DatabaseConnection, violations: &BTreeSet<Violation>) {
    println!("부모 없는 행 (예전부터 있던 것, 업데이트해도 그대로 둠):");
    if violations.is_empty() {
        println!("  없음");
        return;
    }
    let mut groups: BTreeMap<(&str, &str), Vec<i64>> = BTreeMap::new();
    for (table, rowid, parent) in violations {
        groups
            .entry((table, parent))
            .or_default()
            .extend(rowid.iter().copied());
    }
    for ((table, parent), ids) in groups {
        let list = ids.iter().map(i64::to_string).collect::<Vec<_>>().join(",");
        // (금액, 기록 날짜, 부모를 가리키는 컬럼, 새 버전에서 어떻게 보이는지)
        let (amount, date, parent_column, effect) = match table {
            "payments" => (
                "amount",
                "paid_at",
                "work_item_id",
                "새 버전 입금 합계에서 빠짐 (0.2.7은 포함)",
            ),
            "work_items" => (
                "price",
                "received_at",
                "customer_id",
                "접수 합계에 포함. 고객 화면에는 안 보이고 매출 내역·미수금 목록에는 고객 이름 없이 보임",
            ),
            "work_item_details" => (
                "unit_price * quantity",
                "NULL",
                "work_item_id",
                "화면·합계에 쓰이지 않음",
            ),
            "price_items" => ("default_price", "NULL", "category_id", "단가표에 안 보임"),
            _ => ("0", "NULL", "NULL", ""),
        };
        let row = db
            .query_one(Statement::from_string(
                DbBackend::Sqlite,
                format!(
                    "SELECT COUNT(*), COALESCE(SUM({amount}), 0),
                            COALESCE(MIN({date}), ''), COALESCE(MAX({date}), ''),
                            COALESCE(GROUP_CONCAT(DISTINCT {parent_column}), '')
                     FROM {table} WHERE id IN ({list})"
                ),
            ))
            .await
            .unwrap()
            .unwrap();
        let count: i64 = row.try_get_by_index(0).unwrap();
        let sum: i64 = row.try_get_by_index(1).unwrap();
        let first: String = row.try_get_by_index(2).unwrap();
        let last: String = row.try_get_by_index(3).unwrap();
        let missing: String = row.try_get_by_index(4).unwrap();
        print!("  {table} → 없는 {parent}: {count}건 ({})", won(sum));
        if !first.is_empty() {
            let day = |v: &str| v.chars().take(10).collect::<String>();
            print!(" 기록 날짜 {}~{}", day(&first), day(&last));
        }
        println!();
        println!("    {effect}");
        println!("    행 번호: {:?}", &ids[..ids.len().min(20)]);
        if !missing.is_empty() {
            println!("    없는 {parent} 번호: {missing}");
        }
    }
}

/// 최근 14일 가게 날짜별 합계 (새 집계 기준). 가게 장부와 맞는지 확인
async fn print_daily_totals(db: &DatabaseConnection) {
    println!("최근 14일 (접수 / 입금: 카드·현금·이체·기타):");
    let today = timestamp::today(&Local);
    for offset in (0..14).rev() {
        let day = today - Duration::days(offset);
        let s = sales::get_revenue_summary(db, Some(day), Some(day), &Local)
            .await
            .unwrap();
        println!(
            "  {day}: 접수 {} / 입금 {} (카드 {}, 현금 {}, 이체 {}, 기타 {})",
            won(s.total_sales),
            won(s.actual_income),
            won(s.card_income),
            won(s.cash_income),
            won(s.transfer_income),
            won(s.other_income)
        );
    }
}

async fn scalar(db: &DatabaseConnection, sql: &str) -> i64 {
    db.query_one(Statement::from_string(DbBackend::Sqlite, sql))
        .await
        .unwrap()
        .unwrap()
        .try_get_by_index(0)
        .unwrap()
}

async fn text(db: &DatabaseConnection, sql: &str) -> String {
    texts(db, sql).await.join(", ")
}

async fn texts(db: &DatabaseConnection, sql: &str) -> Vec<String> {
    db.query_all(Statement::from_string(DbBackend::Sqlite, sql))
        .await
        .unwrap()
        .into_iter()
        .map(|r| r.try_get_by_index(0).unwrap())
        .collect()
}
