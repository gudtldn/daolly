//! 감사 기록
//!
//! 돈과 관련된 기록을 취소·정정하거나 고객을 삭제할 때, 무엇이 언제 어떻게 바뀌었는지
//! audit_log에 남깁니다. (나중에 "그 결제 누가 지웠지?"를 확인할 수 있도록)

use sea_orm::{ConnectionTrait, DbBackend, DbErr, Statement};
use serde_json::{Value, json};

use crate::db::entities::{customer, payment, work_item};
use crate::timestamp;

pub(crate) enum Entry<'a> {
    /// 결제 취소
    PaymentVoided { payment: &'a payment::Model },
    /// 결제 정정 (기존 결제를 취소하고 새로 기록)
    PaymentCorrected {
        before: &'a payment::Model,
        after: &'a payment::Model,
    },
    /// 접수 취소 (함께 취소한 결제 포함)
    OrderCancelled {
        order: &'a work_item::Model,
        voided: &'a [payment::Model],
    },
    /// 취소한 접수 되돌리기 (함께 되살린 결제 포함)
    OrderRestored {
        order: &'a work_item::Model,
        restored: &'a [payment::Model],
    },
    /// 접수 가격 변경
    OrderRepriced {
        order: &'a work_item::Model,
        new_price: i64,
    },
    /// 고객 삭제 (보관)
    CustomerDeleted { customer: &'a customer::Model },
    /// 삭제한 고객 되돌리기
    CustomerRestored { customer: &'a customer::Model },
}

pub(crate) async fn record<C: ConnectionTrait>(conn: &C, entry: Entry<'_>) -> Result<(), DbErr> {
    let (action, customer_id, work_item_id, payment_id, detail): (
        &str,
        Option<i32>,
        Option<i32>,
        Option<i32>,
        Value,
    ) = match entry {
        Entry::PaymentVoided { payment } => (
            "payment.void",
            None,
            Some(payment.work_item_id),
            Some(payment.id),
            json!({ "payment": payment }),
        ),
        Entry::PaymentCorrected { before, after } => (
            "payment.correct",
            None,
            Some(before.work_item_id),
            Some(before.id),
            json!({ "before": before, "after": after }),
        ),
        Entry::OrderCancelled { order, voided } => (
            "order.cancel",
            Some(order.customer_id),
            Some(order.id),
            None,
            json!({ "order": order, "voidedPayments": voided }),
        ),
        Entry::OrderRestored { order, restored } => (
            "order.restore",
            Some(order.customer_id),
            Some(order.id),
            None,
            json!({ "order": order, "restoredPayments": restored }),
        ),
        Entry::OrderRepriced { order, new_price } => (
            "order.reprice",
            Some(order.customer_id),
            Some(order.id),
            None,
            json!({ "before": order.price, "after": new_price }),
        ),
        Entry::CustomerDeleted { customer } => (
            "customer.delete",
            Some(customer.id),
            None,
            None,
            json!({ "customer": customer }),
        ),
        Entry::CustomerRestored { customer } => (
            "customer.restore",
            Some(customer.id),
            None,
            None,
            json!({ "customer": customer }),
        ),
    };

    conn.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO audit_log (at, action, customer_id, work_item_id, payment_id, detail)
         VALUES (?, ?, ?, ?, ?, ?)",
        [
            timestamp::now().into(),
            action.into(),
            customer_id.into(),
            work_item_id.into(),
            payment_id.into(),
            detail.to_string().into(),
        ],
    ))
    .await?;
    Ok(())
}

/// 테스트용: 기록된 동작 목록 (오래된 순)
#[cfg(test)]
pub(crate) async fn actions<C: ConnectionTrait>(conn: &C) -> Vec<String> {
    conn.query_all(Statement::from_string(
        DbBackend::Sqlite,
        "SELECT action FROM audit_log ORDER BY id",
    ))
    .await
    .unwrap()
    .into_iter()
    .map(|row| row.try_get_by_index(0).unwrap())
    .collect()
}
