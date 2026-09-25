//! 접수 요청 ID 컬럼 추가
//!
//! 접수 버튼을 두 번 누르거나 실패 후 다시 눌러도 접수가 한 번만 생기도록, 화면이 만든
//! 요청 ID를 접수에 기록하고 중복을 막습니다. (NULL은 여러 개 허용: 이전 접수)

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

const INDEX: &str = "idx_work_items_request_id";

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(WorkItems::Table)
                    .add_column(ColumnDef::new(WorkItems::RequestId).text().null())
                    .to_owned(),
            )
            .await?;
        manager
            .create_index(
                Index::create()
                    .name(INDEX)
                    .table(WorkItems::Table)
                    .col(WorkItems::RequestId)
                    .unique()
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_index(Index::drop().name(INDEX).table(WorkItems::Table).to_owned())
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(WorkItems::Table)
                    .drop_column(WorkItems::RequestId)
                    .to_owned(),
            )
            .await
    }
}

#[derive(DeriveIden)]
enum WorkItems {
    Table,
    RequestId,
}
