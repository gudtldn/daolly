use sea_orm_migration::prelude::*;

mod m20260423_000001_init;
mod m20260516_000002_drop_price_options;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260423_000001_init::Migration),
            Box::new(m20260516_000002_drop_price_options::Migration),
        ]
    }
}
