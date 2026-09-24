use sea_orm::DatabaseConnection;
use tauri::State;

use crate::commands::work_items::WorkItemFull;
use crate::commands::{CmdResult, normalize_time};
use crate::services;
use crate::services::orders::ReceiveOrder;

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
