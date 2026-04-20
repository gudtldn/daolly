use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// 고객 정보 테이블 (이름+전화번호로 식별)
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[sea_orm(table_name = "customers")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    /// 고객 이름
    pub name: String,
    /// 전화번호 (예: 01012345678)
    pub phone_number: Option<String>,
    /// 특이사항 메모
    pub note: Option<String>,
    /// 생성일
    pub created_at: String,
    /// 마지막 수정일
    pub last_modified_at: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::work_item::Entity")]
    WorkItems,
}

impl Related<super::work_item::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::WorkItems.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
