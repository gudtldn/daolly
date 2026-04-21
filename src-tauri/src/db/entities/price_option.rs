use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// 전역 추가 옵션 (예: 특수 오염제거, 풀먹임)
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[sea_orm(table_name = "price_options")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub name: String,
    /// 추가 금액 (원)
    pub price: i64,
    /// UI 표시 순서
    pub sort_order: i32,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
