use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// 접수 상세 품목 테이블 (접수 시점의 단가 스냅샷)
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[sea_orm(table_name = "work_item_details")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    /// 접수 FK
    pub work_item_id: i32,
    /// 품목명 (접수 시점 스냅샷)
    pub item_name: String,
    /// 단가 (원, 접수 시점 스냅샷)
    pub unit_price: i64,
    /// 수량 (default 1)
    pub quantity: i32,
    /// 옵션 메모 (예: "특수오염제거 (+2000)")
    pub options_memo: Option<String>,
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
