use chrono::Utc;
use sea_orm::*;
use serde::Deserialize;
use std::collections::HashMap;

use crate::db::entities::{payment, work_item, work_item::WorkItemStatus, work_item_detail};

/// 접수 세부항목 DTO
/// NOTE: 접수 시점의 단가/수량을 스냅샷합니다.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetailInput {
    pub item_name: String,
    /// 접수 시점 단가
    pub unit_price: i64,
    pub quantity: i32,
    /// 옵션 메모
    pub options_memo: Option<String>,
}

pub async fn list(
    db: &DatabaseConnection,
    customer_id: Option<i32>,
    status: Option<WorkItemStatus>,
) -> Result<Vec<work_item::Model>, DbErr> {
    let mut query = work_item::Entity::find();

    if let Some(cid) = customer_id {
        query = query.filter(work_item::Column::CustomerId.eq(cid));
    }
    if let Some(s) = status {
        query = query.filter(work_item::Column::Status.eq(s));
    }

    query
        .order_by_desc(work_item::Column::ReceivedAt)
        .all(db)
        .await
}

/// 접수 + 세부항목 + 결제 내역을 함께 조회합니다.
pub async fn get_full(
    db: &DatabaseConnection,
    id: i32,
) -> Result<
    Option<(
        work_item::Model,
        Vec<work_item_detail::Model>,
        Vec<payment::Model>,
    )>,
    DbErr,
> {
    let item = match work_item::Entity::find_by_id(id).one(db).await? {
        Some(m) => m,
        None => return Ok(None),
    };

    let details = work_item_detail::Entity::find()
        .filter(work_item_detail::Column::WorkItemId.eq(id))
        .all(db)
        .await?;

    let payments = payment::Entity::find()
        .filter(payment::Column::WorkItemId.eq(id))
        .order_by_asc(payment::Column::PaidAt)
        .all(db)
        .await?;

    Ok(Some((item, details, payments)))
}

/// 접수와 세부항목을 트랜잭션으로 함께 생성합니다.
pub async fn create(
    db: &DatabaseConnection,
    customer_id: i32,
    description: String,
    price: i64,
    note: Option<String>,
    received_at: Option<String>,
    details: Vec<DetailInput>,
) -> Result<work_item::Model, DbErr> {
    let description = description.trim().to_owned();
    if description.is_empty() {
        return Err(DbErr::Custom("description is required".to_owned()));
    }
    let note = note.map(|s| s.trim().to_owned()).filter(|s| !s.is_empty());

    let now = Utc::now().to_rfc3339();
    let recv = received_at.unwrap_or_else(|| now.clone());
    let tx = db.begin().await?;

    let wi = work_item::ActiveModel {
        customer_id: Set(customer_id),
        status: Set(WorkItemStatus::Received),
        description: Set(description),
        price: Set(price),
        paid_amount: Set(0),
        note: Set(note),
        received_at: Set(recv),
        created_at: Set(now.clone()),
        last_modified_at: Set(now),
        ..Default::default()
    };
    let inserted = work_item::Entity::insert(wi)
        .exec_with_returning(&tx)
        .await?;

    if !details.is_empty() {
        let detail_models: Vec<work_item_detail::ActiveModel> = details
            .into_iter()
            .map(|d| work_item_detail::ActiveModel {
                work_item_id: Set(inserted.id),
                item_name: Set(d.item_name.trim().to_owned()),
                unit_price: Set(d.unit_price),
                quantity: Set(d.quantity),
                options_memo: Set(d.options_memo.map(|s| s.trim().to_owned())),
                ..Default::default()
            })
            .collect();

        work_item_detail::Entity::insert_many(detail_models)
            .exec(&tx)
            .await?;
    }

    tx.commit().await?;
    Ok(inserted)
}

pub async fn update(
    db: &DatabaseConnection,
    existing: work_item::Model,
    description: Option<String>,
    price: Option<i64>,
    note: Option<String>,
    received_at: Option<String>,
    picked_up_at: Option<String>,
) -> Result<work_item::Model, DbErr> {
    let mut active: work_item::ActiveModel = existing.into();

    if let Some(desc) = description {
        let desc = desc.trim().to_owned();
        if desc.is_empty() {
            return Err(DbErr::Custom("description cannot be empty".to_owned()));
        }
        active.description = Set(desc);
    }
    if let Some(price) = price {
        active.price = Set(price);
    }
    if let Some(note) = note {
        let trimmed = note.trim().to_owned();
        active.note = Set(if trimmed.is_empty() { None } else { Some(trimmed) });
    }
    if let Some(recv) = received_at {
        active.received_at = Set(recv);
    }
    if let Some(pick) = picked_up_at {
        active.picked_up_at = Set(if pick.is_empty() { None } else { Some(pick) });
    }
    active.last_modified_at = Set(Utc::now().to_rfc3339());

    active.update(db).await
}

pub async fn update_status(
    db: &DatabaseConnection,
    existing: work_item::Model,
    status: WorkItemStatus,
) -> Result<work_item::Model, DbErr> {
    let now = Utc::now().to_rfc3339();
    let mut active: work_item::ActiveModel = existing.into();
    active.last_modified_at = Set(now.clone());

    match status {
        WorkItemStatus::Received => {
            active.completed_at = Set(None);
            active.picked_up_at = Set(None);
        }
        WorkItemStatus::Completed => {
            active.completed_at = Set(Some(now));
            active.picked_up_at = Set(None);
        }
        WorkItemStatus::PickedUp => {
            active.picked_up_at = Set(Some(now));
        }
    }
    active.status = Set(status);

    active.update(db).await
}

/// 기존 세부항목을 삭제하고 새 항목으로 교체합니다. (delete-all + insert 트랜잭션)
pub async fn replace_details(
    db: &DatabaseConnection,
    work_item_id: i32,
    details: Vec<DetailInput>,
) -> Result<Vec<work_item_detail::Model>, DbErr> {
    let tx = db.begin().await?;

    work_item_detail::Entity::delete_many()
        .filter(work_item_detail::Column::WorkItemId.eq(work_item_id))
        .exec(&tx)
        .await?;

    if !details.is_empty() {
        let models: Vec<work_item_detail::ActiveModel> = details
            .into_iter()
            .map(|d| work_item_detail::ActiveModel {
                work_item_id: Set(work_item_id),
                item_name: Set(d.item_name.trim().to_owned()),
                unit_price: Set(d.unit_price),
                quantity: Set(d.quantity),
                options_memo: Set(d.options_memo.map(|s| s.trim().to_owned())),
                ..Default::default()
            })
            .collect();

        work_item_detail::Entity::insert_many(models)
            .exec(&tx)
            .await?;
    }

    let result = work_item_detail::Entity::find()
        .filter(work_item_detail::Column::WorkItemId.eq(work_item_id))
        .all(&tx)
        .await?;

    tx.commit().await?;
    Ok(result)
}

pub async fn delete(db: &DatabaseConnection, id: i32) -> Result<u64, DbErr> {
    let res = work_item::Entity::delete_by_id(id).exec(db).await?;
    Ok(res.rows_affected)
}

/// 고객 ID 목록에 대해 미수금(price - paid_amount) 합계를 반환합니다.
pub async fn get_unpaid_by_customers(
    db: &DatabaseConnection,
    customer_ids: Vec<i32>,
) -> Result<HashMap<i32, i64>, DbErr> {
    if customer_ids.is_empty() {
        return Ok(HashMap::new());
    }

    use sea_orm::{FromQueryResult, prelude::Expr, sea_query::{Func, SimpleExpr}};

    #[derive(FromQueryResult)]
    struct UnpaidRow {
        customer_id: i32,
        unpaid: Option<i64>,
    }

    let rows = work_item::Entity::find()
        .select_only()
        .column(work_item::Column::CustomerId)
        .column_as(
            SimpleExpr::from(Func::sum(
                Expr::col(work_item::Column::Price)
                    .sub(Expr::col(work_item::Column::PaidAmount)),
            )),
            "unpaid",
        )
        .filter(work_item::Column::CustomerId.is_in(customer_ids))
        .group_by(work_item::Column::CustomerId)
        .into_model::<UnpaidRow>()
        .all(db)
        .await?;

    let map = rows
        .into_iter()
        .filter_map(|r| {
            let unpaid = r.unpaid.unwrap_or(0);
            if unpaid > 0 { Some((r.customer_id, unpaid)) } else { None }
        })
        .collect();

    Ok(map)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::customers;
    use crate::test_helpers::setup_test_db;

    async fn create_test_customer(db: &DatabaseConnection) -> i32 {
        let c = customers::create(db, "테스트".into(), None, None)
            .await
            .unwrap();
        c.id
    }

    #[tokio::test]
    async fn create_work_item_with_details() {
        let db = setup_test_db().await.unwrap();
        let cid = create_test_customer(&db).await;

        let details = vec![
            DetailInput {
                item_name: "와이셔츠".into(),
                unit_price: 3000,
                quantity: 2,
                options_memo: None,
            },
            DetailInput {
                item_name: "바지".into(),
                unit_price: 4000,
                quantity: 1,
                options_memo: Some("급행".into()),
            },
        ];

        let wi = create(&db, cid, "와이셔츠 외 1건".into(), 10000, None, None, details)
            .await
            .unwrap();

        assert_eq!(wi.customer_id, cid);
        assert_eq!(wi.status, WorkItemStatus::Received);
        assert_eq!(wi.price, 10000);

        // 세부항목 확인
        let (_, dets, _) = get_full(&db, wi.id).await.unwrap().unwrap();
        assert_eq!(dets.len(), 2);
    }

    #[tokio::test]
    async fn create_work_item_empty_description_error() {
        let db = setup_test_db().await.unwrap();
        let cid = create_test_customer(&db).await;
        let err = create(&db, cid, "  ".into(), 0, None, None, vec![])
            .await
            .unwrap_err();
        assert!(err.to_string().contains("description is required"));
    }

    #[tokio::test]
    async fn update_status_sets_completed_at() {
        let db = setup_test_db().await.unwrap();
        let cid = create_test_customer(&db).await;
        let wi = create(&db, cid, "테스트".into(), 1000, None, None, vec![])
            .await
            .unwrap();

        let updated = update_status(&db, wi, WorkItemStatus::Completed)
            .await
            .unwrap();
        assert_eq!(updated.status, WorkItemStatus::Completed);
        assert!(updated.completed_at.is_some());
    }

    #[tokio::test]
    async fn replace_details_replaces_all() {
        let db = setup_test_db().await.unwrap();
        let cid = create_test_customer(&db).await;
        let details = vec![DetailInput {
            item_name: "A".into(),
            unit_price: 1000,
            quantity: 1,
            options_memo: None,
        }];
        let wi = create(&db, cid, "테스트".into(), 1000, None, None, details)
            .await
            .unwrap();

        // 기존 1개 -> 새로 2개로 교체
        let new_details = vec![
            DetailInput {
                item_name: "B".into(),
                unit_price: 2000,
                quantity: 1,
                options_memo: None,
            },
            DetailInput {
                item_name: "C".into(),
                unit_price: 3000,
                quantity: 1,
                options_memo: None,
            },
        ];
        let replaced = replace_details(&db, wi.id, new_details).await.unwrap();
        assert_eq!(replaced.len(), 2);
        assert_eq!(replaced[0].item_name, "B");
    }

    #[tokio::test]
    async fn list_filters_by_status() {
        let db = setup_test_db().await.unwrap();
        let cid = create_test_customer(&db).await;
        let wi = create(&db, cid, "접수".into(), 1000, None, None, vec![])
            .await
            .unwrap();
        create(&db, cid, "접수2".into(), 2000, None, None, vec![])
            .await
            .unwrap();
        update_status(&db, wi, WorkItemStatus::Completed)
            .await
            .unwrap();

        let received = list(&db, None, Some(WorkItemStatus::Received))
            .await
            .unwrap();
        assert_eq!(received.len(), 1);
        assert_eq!(received[0].description, "접수2");
    }
}
