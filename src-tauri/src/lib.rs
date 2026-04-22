mod commands;
mod db;
mod services;

#[cfg(test)]
pub mod test_helpers;

use sea_orm::DatabaseConnection;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data directory");

            // pending restore가 있으면 DB 초기화 전에 적용
            let pending = app_data_dir.join("daolly.db.pending_restore");
            if pending.exists() {
                let db_path = app_data_dir.join("daolly.db");
                std::fs::rename(&pending, &db_path).expect("failed to apply pending restore");
            }

            // Tauri setup은 sync 클로저이므로 block_on으로 async DB 초기화 실행
            let db: DatabaseConnection = tauri::async_runtime::block_on(db::init(app_data_dir))
                .expect("failed to initialize database");

            // 커맨드에서 State<DatabaseConnection>으로 주입받아 사용
            app.manage(db);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // customers
            commands::customers::list_customers,
            commands::customers::get_customer,
            commands::customers::create_customer,
            commands::customers::update_customer,
            commands::customers::delete_customer,
            // categories
            commands::categories::list_categories,
            commands::categories::create_category,
            commands::categories::update_category,
            commands::categories::delete_category,
            // price_items
            commands::price_items::list_price_items,
            commands::price_items::create_price_item,
            commands::price_items::update_price_item,
            commands::price_items::delete_price_item,
            // work_items
            commands::work_items::list_work_items,
            commands::work_items::get_work_item,
            commands::work_items::create_work_item,
            commands::work_items::update_work_item,
            commands::work_items::update_work_item_status,
            commands::work_items::replace_work_item_details,
            commands::work_items::delete_work_item,
            commands::work_items::get_all_unpaid_amounts,
            // price_options
            commands::price_options::list_price_options,
            commands::price_options::create_price_option,
            commands::price_options::update_price_option,
            commands::price_options::delete_price_option,
            // payments
            commands::payments::list_payments,
            commands::payments::create_payment,
            commands::payments::update_payment,
            commands::payments::delete_payment,
            // database
            commands::database::open_db_folder,
            commands::database::get_db_path,
            commands::database::backup_db,
            commands::database::list_backups,
            commands::database::restore_db,
            // sales
            commands::sales::list_sales_records,
            commands::sales::list_unpaid_records,
            commands::sales::list_weekly_chart,
            commands::sales::list_top_items,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
