use sea_orm_migration::prelude::*;

mod m20260423_000001_init;
mod m20260516_000002_drop_price_options;
mod m20260924_000003_normalize_timestamps;
mod m20260924_000004_work_item_request_id;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260423_000001_init::Migration),
            Box::new(m20260516_000002_drop_price_options::Migration),
            Box::new(m20260924_000003_normalize_timestamps::Migration),
            Box::new(m20260924_000004_work_item_request_id::Migration),
        ]
    }
}
