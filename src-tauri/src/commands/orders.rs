use sea_orm::DatabaseConnection;
use tauri::State;

use crate::commands::work_items::WorkItemFull;
use crate::commands::{CmdResult, normalize_time};
use crate::services;
use crate::services::orders::{AmendOrder, ReceiveOrder};

/// 접수 (품목, 선결제 포함)를 한 번에 저장합니다.
#[tauri::command]
pub async fn receive_order(
    db: State<'_, DatabaseConnection>,
    mut order: ReceiveOrder,
) -> CmdResult<WorkItemFull> {
    order.received_at = normalize_time(order.received_at.take(), "접수 일시")?;
    order.picked_up_at = normalize_time(order.picked_up_at.take(), "수령 일시")?;

    let (work_item, details, payments) = services::orders::receive(db.inner(), order).await?;
    Ok(WorkItemFull {
        work_item,
        details,
        payments,
    })
}

/// 출고: 수령 처리와 남은 금액 받기를 한 번에 합니다. method가 없으면 미수금으로 둡니다.
#[tauri::command]
pub async fn pickup_order(
    db: State<'_, DatabaseConnection>,
    id: i32,
    method: Option<String>,
) -> CmdResult<WorkItemFull> {
    let (work_item, details, payments) = services::orders::pickup(db.inner(), id, method).await?;
    Ok(WorkItemFull {
        work_item,
        details,
        payments,
    })
}

/// 접수의 상태·내용·품목을 한 번에 고칩니다.
#[tauri::command]
pub async fn amend_order(
    db: State<'_, DatabaseConnection>,
    id: i32,
    mut amendment: AmendOrder,
) -> CmdResult<WorkItemFull> {
    amendment.received_at = normalize_time(amendment.received_at.take(), "접수 일시")?;
    // 빈 문자열은 '수령 일시를 따로 정하지 않음' (상태에 따라 정해짐)
    let picked_up_at = amendment.picked_up_at.take().filter(|s| !s.is_empty());
    amendment.picked_up_at = normalize_time(picked_up_at, "수령 일시")?;

    let (work_item, details, payments) = services::orders::amend(db.inner(), id, amendment).await?;
    Ok(WorkItemFull {
        work_item,
        details,
        payments,
    })
}
