use sea_orm::*;
use serde::Deserialize;
use std::collections::HashMap;

use crate::db::entities::{payment, work_item, work_item::WorkItemStatus, work_item_detail};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetailInput {
    /// 통계용 품목 FK (None = 직접 입력)
    pub price_item_id: Option<i32>,
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
    // 취소한 접수는 빼고
    let mut query = work_item::Entity::find().filter(work_item::Column::DeletedAt.is_null());

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

/// 접수 + 세부항목 + 결제 내역을 함께 조회합니다. (취소한 접수·결제는 빼고)
pub async fn get_full<C: ConnectionTrait>(
    db: &C,
    id: i32,
) -> Result<
    Option<(
        work_item::Model,
        Vec<work_item_detail::Model>,
        Vec<payment::Model>,
    )>,
    DbErr,
> {
    let item = match work_item::Entity::find_by_id(id)
        .filter(work_item::Column::DeletedAt.is_null())
        .one(db)
        .await?
    {
        Some(m) => m,
        None => return Ok(None),
    };

    let details = work_item_detail::Entity::find()
        .filter(work_item_detail::Column::WorkItemId.eq(id))
        .all(db)
        .await?;

    let payments = payment::Entity::find()
        .filter(payment::Column::WorkItemId.eq(id))
        .filter(payment::Column::VoidedAt.is_null())
        .order_by_asc(payment::Column::PaidAt)
        .all(db)
        .await?;

    Ok(Some((item, details, payments)))
}

/// details 목록에서 description 자동 생성
pub(crate) fn build_description(details: &[DetailInput]) -> String {
    if details.is_empty() {
        return "직접 입력".to_owned();
    }
    let first = details[0].item_name.trim();
    match details.len() {
        1 => {
            if details[0].quantity > 1 {
                format!("{} x{}", first, details[0].quantity)
            } else {
                first.to_owned()
            }
        }
        2 => {
            let second = details[1].item_name.trim();
            format!("{}, {}", first, second)
        }
        n => {
            format!("{} 외 {}가지", first, n - 1)
        }
    }
}

/// 테스트용: 검증 없이 접수와 세부항목만 만듭니다.
/// (화면의 접수는 결제까지 한 번에 저장하는 `orders::receive`를 사용)
#[cfg(test)]
pub async fn create(
    db: &DatabaseConnection,
    customer_id: i32,
    description: Option<String>,
    price: i64,
    note: Option<String>,
    received_at: Option<String>,
    details: Vec<DetailInput>,
) -> Result<work_item::Model, DbErr> {
    let description = description
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| build_description(&details));
    let note = note.map(|s| s.trim().to_owned()).filter(|s| !s.is_empty());

    let now = crate::timestamp::now();
    let recv = received_at.unwrap_or_else(|| now.clone());
    let tx = db.begin().await?;

    let wi = work_item::ActiveModel {
        customer_id: Set(customer_id),
        status: Set(WorkItemStatus::Received),
        description: Set(Some(description)),
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

    insert_details(&tx, inserted.id, details).await?;

    tx.commit().await?;
    Ok(inserted)
}

/// 세부항목을 추가합니다. 트랜잭션은 호출하는 쪽에서 관리합니다.
pub(crate) async fn insert_details<C: ConnectionTrait>(
    conn: &C,
    work_item_id: i32,
    details: Vec<DetailInput>,
) -> Result<(), DbErr> {
    if details.is_empty() {
        return Ok(());
    }
    let models: Vec<work_item_detail::ActiveModel> = details
        .into_iter()
        .map(|d| work_item_detail::ActiveModel {
            work_item_id: Set(work_item_id),
            price_item_id: Set(d.price_item_id),
            item_name: Set(d.item_name.trim().to_owned()),
            unit_price: Set(d.unit_price),
            quantity: Set(d.quantity),
            options_memo: Set(d
                .options_memo
                .map(|s| s.trim().to_owned())
                .filter(|s| !s.is_empty())),
            ..Default::default()
        })
        .collect();
    work_item_detail::Entity::insert_many(models)
        .exec(conn)
        .await?;
    Ok(())
}

/// 고객별 미수금 합계를 반환합니다. (취소한 접수와 삭제한 고객은 빼고)
/// 잔액이 남은 접수만 더합니다. (더 받은 접수의 음수 잔액이 다른 접수의 미수금을 가리지 않도록)
pub async fn get_all_unpaid_amounts(db: &DatabaseConnection) -> Result<HashMap<i32, i64>, DbErr> {
    let rows = db
        .query_all(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT w.customer_id, SUM(w.price - w.paid_amount)
             FROM work_items w JOIN customers c ON c.id = w.customer_id
             WHERE w.paid_amount < w.price AND w.deleted_at IS NULL AND c.deleted_at IS NULL
             GROUP BY w.customer_id",
        ))
        .await?;
    rows.into_iter()
        .map(|row| Ok((row.try_get_by_index(0)?, row.try_get_by_index(1)?)))
        .collect()
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
                price_item_id: None,
                item_name: "와이셔츠".into(),
                unit_price: 3000,
                quantity: 2,
                options_memo: None,
            },
            DetailInput {
                price_item_id: None,
                item_name: "바지".into(),
                unit_price: 4000,
                quantity: 1,
                options_memo: Some("급행".into()),
            },
        ];

        let wi = create(
            &db,
            cid,
            Some("와이셔츠, 바지".to_owned()),
            10000,
            None,
            None,
            details,
        )
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
    async fn list_filters_by_status() {
        let db = setup_test_db().await.unwrap();
        let cid = create_test_customer(&db).await;
        let wi = create(&db, cid, Some("접수".to_owned()), 1000, None, None, vec![])
            .await
            .unwrap();
        create(&db, cid, Some("접수2".to_owned()), 2000, None, None, vec![])
            .await
            .unwrap();
        let mut done: work_item::ActiveModel = wi.into();
        done.status = Set(WorkItemStatus::Completed);
        done.update(&db).await.unwrap();

        let received = list(&db, None, Some(WorkItemStatus::Received))
            .await
            .unwrap();
        assert_eq!(received.len(), 1);
        assert_eq!(received[0].description, Some("접수2".to_owned()));
    }

    #[tokio::test]
    async fn get_all_unpaid_amounts_works() {
        let db = setup_test_db().await.unwrap();
        let cid1 = create_test_customer(&db).await;
        let cid2 = create_test_customer(&db).await;

        create(
            &db,
            cid1,
            Some("미수금".to_owned()),
            1000,
            None,
            None,
            vec![],
        )
        .await
        .unwrap();

        let wi2 = create(&db, cid2, Some("완납".to_owned()), 2000, None, None, vec![])
            .await
            .unwrap();
        let mut active_wi2: work_item::ActiveModel = wi2.into();
        active_wi2.paid_amount = Set(2000);
        active_wi2.update(&db).await.unwrap();

        let unpaid = get_all_unpaid_amounts(&db).await.unwrap();
        assert_eq!(unpaid.len(), 1);
        assert_eq!(unpaid.get(&cid1), Some(&1000));
        assert_eq!(unpaid.get(&cid2), None);
    }

    /// V6: 더 받은 접수(음수 잔액)가 있어도 다른 접수의 미수금은 그대로 보임
    #[tokio::test]
    async fn overpaid_item_does_not_hide_other_debt() {
        let db = setup_test_db().await.unwrap();
        let cid = create_test_customer(&db).await;
        // 예전 버전에서 가격을 받은 금액보다 낮게 고친 접수 (잔액 -5000)
        let over = create(&db, cid, Some("과납".to_owned()), 5000, None, None, vec![])
            .await
            .unwrap();
        let mut over: work_item::ActiveModel = over.into();
        over.paid_amount = Set(10000);
        over.update(&db).await.unwrap();
        create(&db, cid, Some("미수".to_owned()), 5000, None, None, vec![])
            .await
            .unwrap();

        let unpaid = get_all_unpaid_amounts(&db).await.unwrap();
        assert_eq!(unpaid.get(&cid), Some(&5000));
    }
}
