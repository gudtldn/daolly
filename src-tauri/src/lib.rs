mod commands;
mod db;
mod services;

use sea_orm::DatabaseConnection;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data directory");

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
            // payments
            commands::payments::list_payments,
            commands::payments::create_payment,
            commands::payments::delete_payment,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
