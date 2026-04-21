use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "Text")]
pub enum WorkItemStatus {
    #[sea_orm(string_value = "Received")]
    Received,
    #[sea_orm(string_value = "Completed")]
    Completed,
    #[sea_orm(string_value = "PickedUp")]
    PickedUp,
}

/// 세탁물 접수 1건.
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[sea_orm(table_name = "work_items")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    /// 고객 FK
    pub customer_id: i32,
    pub status: WorkItemStatus,
    /// 접수 요약 (예: "와이셔츠 외 2건")
    pub description: String,
    /// 총 금액 (원)
    pub price: i64,
    /// 결제 완료 금액 (payments 합계 캐시)
    pub paid_amount: i64,
    /// 특이사항 메모
    pub note: Option<String>,
    /// 접수 일시
    pub received_at: String,
    /// 완료 일시
    pub completed_at: Option<String>,
    /// 수거 일시
    pub picked_up_at: Option<String>,
    pub created_at: String,
    pub last_modified_at: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::customer::Entity",
        from = "Column::CustomerId",
        to = "super::customer::Column::Id"
    )]
    Customer,
    #[sea_orm(has_many = "super::work_item_detail::Entity")]
    WorkItemDetails,
    #[sea_orm(has_many = "super::payment::Entity")]
    Payments,
}

impl Related<super::customer::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Customer.def()
    }
}

impl Related<super::work_item_detail::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::WorkItemDetails.def()
    }
}

impl Related<super::payment::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Payments.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
