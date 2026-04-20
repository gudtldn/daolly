use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// 단가표의 상위 분류 테이블 (예: 상의, 하의, 아우터)
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "categories")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    /// 카테고리 이름 (UNIQUE)
    pub name: String,
    /// UI 표시 순서
    pub sort_order: i32,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::price_item::Entity")]
    PriceItems,
}

impl Related<super::price_item::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::PriceItems.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
