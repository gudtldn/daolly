mod db;

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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
