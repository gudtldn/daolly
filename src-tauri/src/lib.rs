mod backup;
mod commands;
mod db;
mod error;
mod services;
mod startup;
mod timestamp;
mod updater;

#[cfg(test)]
pub mod test_helpers;

use tauri::{Manager, RunEvent};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

/// 로그 파일 설정: 앱 로그 폴더에 daolly.log (1MB씩 최근 5개 보관)
fn log_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_log::Builder::new()
        .clear_targets()
        .target(Target::new(TargetKind::LogDir {
            file_name: Some("daolly".into()),
        }))
        .target(Target::new(TargetKind::Stdout))
        .level(log::LevelFilter::Info)
        .timezone_strategy(TimezoneStrategy::UseLocal)
        .rotation_strategy(RotationStrategy::KeepSome(5))
        .max_file_size(1_000_000)
        .build()
}

/// panic 내용을 로그 파일에 남깁니다. (Windows 릴리스는 콘솔이 없어 그대로는 흔적이 남지 않음)
fn install_panic_logger() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log::error!(
            "비정상 종료(panic): {info}\n{}",
            std::backtrace::Backtrace::force_capture()
        );
        default_hook(info);
    }));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 다른 플러그인의 로그도 남도록 가장 먼저 등록
        .plugin(log_plugin())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            install_panic_logger();
            log::info!("다올리 {} 시작", app.package_info().version);

            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data directory");

            // 예약된 복원 적용(실패 시 원복) 후 DB 초기화.
            // Tauri setup은 sync 클로저이므로 block_on으로 실행
            let (db, notices) =
                tauri::async_runtime::block_on(startup::open_database(&app_data_dir));
            app.manage(startup::StartupNotices::new(notices));

            // 업데이트는 백그라운드에서 확인·다운로드하고 종료 시 설치 (DB 상태와 무관하게 동작)
            app.manage(updater::UpdaterState::default());
            updater::spawn_background_check(app.handle().clone());

            match db {
                Ok(db) => {
                    // 하루 1회 자동 백업 (앱을 켜 둔 동안 주기적으로 확인)
                    backup::spawn_daily_backup(db.clone(), app_data_dir);
                    // 커맨드에서 State<DatabaseConnection>으로 주입받아 사용
                    app.manage(db);
                    app.manage(startup::StartupStatus::Ready);
                }
                Err(e) => {
                    // 종료하지 않고 복구 화면으로 시작 (백업 복원, 로그 확인, 업데이트 가능)
                    log::error!("DB를 열지 못해 복구 모드로 시작합니다: {e}");
                    app.manage(startup::StartupStatus::Failed {
                        message: e.to_string(),
                    });
                }
            }

            // DPI 및 모니터 크기 대응 (Safe Capping)
            if let (Some(window), Ok(Some(monitor))) = (
                app.get_webview_window("main"),
                app.get_webview_window("main")
                    .map(|w| w.current_monitor())
                    .unwrap_or(Ok(None)),
            ) {
                let monitor_size = monitor.size();
                let scale_factor = monitor.scale_factor();
                let logical_monitor_size = monitor_size.to_logical::<f64>(scale_factor);

                // 현재 창의 실제 크기 (플러그인에 의해 복구되었을 수 있음)
                let current_size = window
                    .outer_size()
                    .unwrap_or(*monitor_size)
                    .to_logical::<f64>(scale_factor);

                // 모니터 가용 영역의 안전 한계치
                let max_w = logical_monitor_size.width * 0.98;
                let max_h = logical_monitor_size.height * 0.92;

                let mut new_w = current_size.width;
                let mut new_h = current_size.height;
                let mut need_resize = false;

                // 현재 크기가 모니터보다 클 때만 줄임 (캡핑 로직)
                if new_w > max_w {
                    new_w = max_w;
                    need_resize = true;
                }
                if new_h > max_h {
                    new_h = max_h;
                    need_resize = true;
                }

                if need_resize {
                    let _ = window.set_size(tauri::LogicalSize::new(new_w, new_h));
                    let _ = window.center();
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // customers
            commands::customers::list_customers,
            commands::customers::get_customer,
            commands::customers::create_customer,
            commands::customers::update_customer,
            commands::customers::delete_customer,
            commands::customers::restore_customer,
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
            commands::work_items::update_work_item_status,
            commands::work_items::delete_work_item,
            commands::work_items::restore_work_item,
            commands::work_items::get_all_unpaid_amounts,
            // orders
            commands::orders::receive_order,
            commands::orders::amend_order,
            // price_settings
            commands::price_settings::export_price_settings_to_file,
            commands::price_settings::import_price_settings_from_file,
            // payments
            commands::payments::list_payments,
            commands::payments::create_payment,
            commands::payments::update_payment,
            commands::payments::delete_payment,
            commands::payments::list_credit_payments,
            // database
            commands::database::open_db_folder,
            commands::database::get_db_path,
            commands::database::backup_db,
            commands::database::list_backups,
            commands::database::restore_db,
            commands::database::get_backup_settings,
            commands::database::set_backup_mirror_dir,
            commands::database::take_startup_notices,
            commands::database::get_startup_status,
            commands::database::open_log_folder,
            commands::database::migrate_from_legacy,
            commands::database::clear_all_data,
            // sales
            commands::sales::list_sales_records,
            commands::sales::list_unpaid_records,
            commands::sales::list_weekly_chart,
            commands::sales::list_top_items,
            commands::sales::get_revenue_summary,
            commands::sales::list_payment_records,
            // updates
            commands::updates::get_update_status,
            commands::updates::check_for_update,
            commands::updates::install_update_now,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            RunEvent::ExitRequested { code, .. } => updater::on_exit_requested(app, code),
            RunEvent::Exit => updater::on_exit(app),
            _ => {}
        });
}
