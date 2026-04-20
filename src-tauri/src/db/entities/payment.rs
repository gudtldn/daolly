use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// 결제 내역 테이블
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[sea_orm(table_name = "payments")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    /// 접수 FK
    pub work_item_id: i32,
    /// 결제 금액 (원)
    pub amount: i32,
    /// 결제 수단 (예: "현금", "카드", "계좌이체")
    pub method: Option<String>,
    /// 결제 일시
    pub paid_at: String,
    pub created_at: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::work_item::Entity",
        from = "Column::WorkItemId",
        to = "super::work_item::Column::Id"
    )]
    WorkItem,
}

impl Related<super::work_item::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::WorkItem.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
