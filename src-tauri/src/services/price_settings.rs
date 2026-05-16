use crate::db::entities::{category, price_item};
use sea_orm::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PriceSettingsExportData {
    pub version: i32,
    pub categories: Vec<CategoryExport>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CategoryExport {
    pub name: String,
    pub sort_order: i32,
    pub items: Vec<ItemExport>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ItemExport {
    pub name: String,
    pub default_price: i64,
    pub sort_order: i32,
}

pub async fn export_data(db: &DatabaseConnection) -> Result<PriceSettingsExportData, DbErr> {
    // 1. Fetch all data
    let categories = category::Entity::find()
        .order_by_asc(category::Column::SortOrder)
        .all(db)
        .await?;

    let items = price_item::Entity::find()
        .order_by_asc(price_item::Column::SortOrder)
        .all(db)
        .await?;

    // 2. Map and group
    let mut category_exports = Vec::new();
    for cat in categories {
        let cat_items = items
            .iter()
            .filter(|i| i.category_id == cat.id)
            .map(|i| ItemExport {
                name: i.name.clone(),
                default_price: i.default_price,
                sort_order: i.sort_order,
            })
            .collect();

        category_exports.push(CategoryExport {
            name: cat.name,
            sort_order: cat.sort_order,
            items: cat_items,
        });
    }

    Ok(PriceSettingsExportData {
        version: 1,
        categories: category_exports,
    })
}

pub async fn import_data(
    db: &DatabaseConnection,
    data: PriceSettingsExportData,
) -> Result<(), DbErr> {
    db.transaction::<_, (), DbErr>(|txn| {
        Box::pin(async move {
            // 1. Delete all existing settings
            // price_items will be deleted by CASCADE when categories are deleted
            category::Entity::delete_many().exec(txn).await?;

            // 2. Insert new settings
            for cat_data in data.categories {
                let cat = category::ActiveModel {
                    name: Set(cat_data.name),
                    sort_order: Set(cat_data.sort_order),
                    ..Default::default()
                }
                .insert(txn)
                .await?;

                if !cat_data.items.is_empty() {
                    let items_to_insert: Vec<price_item::ActiveModel> = cat_data
                        .items
                        .into_iter()
                        .map(|item_data| price_item::ActiveModel {
                            category_id: Set(cat.id),
                            name: Set(item_data.name),
                            default_price: Set(item_data.default_price),
                            sort_order: Set(item_data.sort_order),
                            ..Default::default()
                        })
                        .collect();

                    price_item::Entity::insert_many(items_to_insert)
                        .exec(txn)
                        .await?;
                }
            }

            Ok(())
        })
    })
    .await
    .map_err(|e| match e {
        sea_orm::TransactionError::Connection(e) => e,
        sea_orm::TransactionError::Transaction(e) => e,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::setup_test_db;

    #[tokio::test]
    async fn test_export_empty_db() {
        let db = setup_test_db().await.unwrap();
        let data = export_data(&db).await.unwrap();

        assert_eq!(data.version, 1);
        assert!(data.categories.is_empty());
    }

    #[tokio::test]
    async fn test_export_data() {
        let db = setup_test_db().await.unwrap();

        // Setup data
        let cat = category::ActiveModel {
            name: Set("상의".into()),
            sort_order: Set(0),
            ..Default::default()
        }
        .insert(&db)
        .await
        .unwrap();

        price_item::ActiveModel {
            category_id: Set(cat.id),
            name: Set("와이셔츠".into()),
            default_price: Set(2000),
            sort_order: Set(0),
            ..Default::default()
        }
        .insert(&db)
        .await
        .unwrap();

        let data = export_data(&db).await.unwrap();

        assert_eq!(data.categories.len(), 1);
        assert_eq!(data.categories[0].name, "상의");
        assert_eq!(data.categories[0].items.len(), 1);
        assert_eq!(data.categories[0].items[0].name, "와이셔츠");
    }

    #[tokio::test]
    async fn test_import_overwrite() {
        let db = setup_test_db().await.unwrap();

        // 1. Initial data A
        category::ActiveModel {
            name: Set("기존카테고리".into()),
            sort_order: Set(0),
            ..Default::default()
        }
        .insert(&db)
        .await
        .unwrap();

        // 2. Import data B
        let new_data = PriceSettingsExportData {
            version: 1,
            categories: vec![CategoryExport {
                name: "새카테고리".into(),
                sort_order: 0,
                items: vec![],
            }],
        };

        import_data(&db, new_data).await.unwrap();

        // 3. Verify
        let cats = category::Entity::find().all(&db).await.unwrap();
        assert_eq!(cats.len(), 1);
        assert_eq!(cats[0].name, "새카테고리");
    }

    #[tokio::test]
    async fn test_import_rollback_on_invalid_data() {
        let db = setup_test_db().await.unwrap();

        // 1. Initial data
        category::ActiveModel {
            name: Set("보존되어야함".into()),
            sort_order: Set(0),
            ..Default::default()
        }
        .insert(&db)
        .await
        .unwrap();

        // 2. Import invalid data (e.g., duplicate names in one import might fail depending on implementation,
        // or we can simulate a failure if we had more constraints)
        // Here we'll try to import something that would fail if we added a mock failure or if we had unique constraints.
        // Categories have UNIQUE name constraint.
        let invalid_data = PriceSettingsExportData {
            version: 1,
            categories: vec![
                CategoryExport {
                    name: "중복".into(),
                    sort_order: 0,
                    items: vec![],
                },
                CategoryExport {
                    name: "중복".into(),
                    sort_order: 1,
                    items: vec![],
                },
            ],
        };

        let res = import_data(&db, invalid_data).await;
        assert!(res.is_err());

        // 3. Verify rollback
        let cats = category::Entity::find().all(&db).await.unwrap();
        assert_eq!(cats.len(), 1);
        assert_eq!(cats[0].name, "보존되어야함");
    }
}
