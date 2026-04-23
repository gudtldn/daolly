use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // 1. Categories
        manager
            .create_table(
                Table::create()
                    .table(Categories::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Categories::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Categories::Name).string().not_null())
                    .col(
                        ColumnDef::new(Categories::SortOrder)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .to_owned(),
            )
            .await?;
        manager
            .create_index(
                Index::create()
                    .name("idx_categories_name")
                    .table(Categories::Table)
                    .col(Categories::Name)
                    .unique()
                    .to_owned(),
            )
            .await?;

        // 2. PriceItems
        manager
            .create_table(
                Table::create()
                    .table(PriceItems::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(PriceItems::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(PriceItems::CategoryId).integer().not_null())
                    .col(ColumnDef::new(PriceItems::Name).string().not_null())
                    .col(
                        ColumnDef::new(PriceItems::DefaultPrice)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(PriceItems::SortOrder)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_price_items_category")
                            .from(PriceItems::Table, PriceItems::CategoryId)
                            .to(Categories::Table, Categories::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // 3. PriceOptions
        manager
            .create_table(
                Table::create()
                    .table(PriceOptions::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(PriceOptions::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(PriceOptions::Name).string().not_null())
                    .col(
                        ColumnDef::new(PriceOptions::Price)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(PriceOptions::SortOrder)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .to_owned(),
            )
            .await?;

        // 4. Customers
        manager
            .create_table(
                Table::create()
                    .table(Customers::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Customers::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Customers::Name).string().not_null())
                    .col(ColumnDef::new(Customers::PhoneNumber).string())
                    .col(ColumnDef::new(Customers::Note).string())
                    .col(ColumnDef::new(Customers::CreatedAt).string().not_null())
                    .col(
                        ColumnDef::new(Customers::LastModifiedAt)
                            .string()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await?;

        // 5. WorkItems
        manager
            .create_table(
                Table::create()
                    .table(WorkItems::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(WorkItems::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(WorkItems::CustomerId).integer().not_null())
                    .col(
                        ColumnDef::new(WorkItems::Status)
                            .string()
                            .not_null()
                            .default("Received"),
                    )
                    .col(ColumnDef::new(WorkItems::Description).string())
                    .col(
                        ColumnDef::new(WorkItems::Price)
                            .big_integer()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(WorkItems::PaidAmount)
                            .big_integer()
                            .not_null()
                            .default(0),
                    )
                    .col(ColumnDef::new(WorkItems::Note).string())
                    .col(ColumnDef::new(WorkItems::ReceivedAt).string().not_null())
                    .col(ColumnDef::new(WorkItems::CompletedAt).string())
                    .col(ColumnDef::new(WorkItems::PickedUpAt).string())
                    .col(ColumnDef::new(WorkItems::CreatedAt).string().not_null())
                    .col(
                        ColumnDef::new(WorkItems::LastModifiedAt)
                            .string()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_work_items_customer")
                            .from(WorkItems::Table, WorkItems::CustomerId)
                            .to(Customers::Table, Customers::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // 6. WorkItemDetails
        manager
            .create_table(
                Table::create()
                    .table(WorkItemDetails::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(WorkItemDetails::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(WorkItemDetails::WorkItemId)
                            .integer()
                            .not_null(),
                    )
                    .col(ColumnDef::new(WorkItemDetails::PriceItemId).integer())
                    .col(
                        ColumnDef::new(WorkItemDetails::ItemName)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(WorkItemDetails::UnitPrice)
                            .integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(WorkItemDetails::Quantity)
                            .integer()
                            .not_null()
                            .default(1),
                    )
                    .col(ColumnDef::new(WorkItemDetails::OptionsMemo).string())
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_work_item_details_work_item")
                            .from(WorkItemDetails::Table, WorkItemDetails::WorkItemId)
                            .to(WorkItems::Table, WorkItems::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // 7. Payments
        manager
            .create_table(
                Table::create()
                    .table(Payments::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Payments::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Payments::WorkItemId).integer().not_null())
                    .col(ColumnDef::new(Payments::Amount).big_integer().not_null())
                    .col(ColumnDef::new(Payments::Method).string())
                    .col(ColumnDef::new(Payments::PaidAt).string().not_null())
                    .col(ColumnDef::new(Payments::CreatedAt).string().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_payments_work_item")
                            .from(Payments::Table, Payments::WorkItemId)
                            .to(WorkItems::Table, WorkItems::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Payments::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(WorkItemDetails::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(WorkItems::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Customers::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(PriceOptions::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(PriceItems::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Categories::Table).to_owned())
            .await?;
        Ok(())
    }
}

#[derive(DeriveIden)]
enum Categories {
    Table,
    Id,
    Name,
    SortOrder,
}

#[derive(DeriveIden)]
enum PriceItems {
    Table,
    Id,
    CategoryId,
    Name,
    DefaultPrice,
    SortOrder,
}

#[derive(DeriveIden)]
enum PriceOptions {
    Table,
    Id,
    Name,
    Price,
    SortOrder,
}

#[derive(DeriveIden)]
enum Customers {
    Table,
    Id,
    Name,
    PhoneNumber,
    Note,
    CreatedAt,
    LastModifiedAt,
}

#[derive(DeriveIden)]
enum WorkItems {
    Table,
    Id,
    CustomerId,
    Status,
    Description,
    Price,
    PaidAmount,
    Note,
    ReceivedAt,
    CompletedAt,
    PickedUpAt,
    CreatedAt,
    LastModifiedAt,
}

#[derive(DeriveIden)]
enum WorkItemDetails {
    Table,
    Id,
    WorkItemId,
    PriceItemId,
    ItemName,
    UnitPrice,
    Quantity,
    OptionsMemo,
}

#[derive(DeriveIden)]
enum Payments {
    Table,
    Id,
    WorkItemId,
    Amount,
    Method,
    PaidAt,
    CreatedAt,
}
