use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let sql = include_str!("001_init.sql");
        let db = manager.get_connection();

        for stmt in sql.split(';') {
            let trimmed = stmt.trim();
            if trimmed.is_empty() {
                continue;
            }
            db.execute_unprepared(trimmed).await?;
        }

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();

        let tables = [
            "payments",
            "work_item_details",
            "work_items",
            "customers",
            "price_options",
            "price_items",
            "categories",
        ];

        for table in tables {
            db.execute_unprepared(&format!("DROP TABLE IF EXISTS {}", table))
                .await?;
        }

        Ok(())
    }
}
