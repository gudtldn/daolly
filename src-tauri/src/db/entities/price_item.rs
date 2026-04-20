use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// 카테고리에 속하는 세탁 품목과 기본 단가 테이블
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "price_items")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    /// 소속 카테고리 FK
    pub category_id: i32,
    /// 품목명 (카테고리 내 UNIQUE)
    pub name: String,
    /// 기본 단가 (원)
    pub default_price: i32,
    /// UI 표시 순서
    pub sort_order: i32,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::category::Entity",
        from = "Column::CategoryId",
        to = "super::category::Column::Id"
    )]
    Category,
}

impl Related<super::category::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Category.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
