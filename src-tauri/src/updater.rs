//! 앱 업데이트
//!
//! 예전에는 기동할 때마다 업데이트를 받아 바로 설치해서, 가게 문을 여는 시간에
//! 다운로드가 끝날 때까지 기다려야 했습니다. 이제는 백그라운드에서 확인·다운로드해 두었다가
//! 사용자가 프로그램을 끌 때 설치합니다. (Windows MSI는 설치가 끝나면 앱을 다시 실행하며,
//! 설치가 중간에 끊기면 롤백되어 이전 버전이 유지됩니다)

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};

/// 업데이트 확인 요청 제한 시간
const CHECK_TIMEOUT: Duration = Duration::from_secs(30);
/// 다운로드 제한 시간 (느린 가게 인터넷 고려)
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(10 * 60);
/// 앱을 켜 둔 동안 다시 확인하는 주기
const RECHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
/// 상태가 바뀔 때 프론트엔드로 보내는 이벤트
pub const STATUS_EVENT: &str = "update-status";

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum UpdateStatus {
    /// 아직 확인하지 않음 (개발 빌드는 자동 확인하지 않음)
    #[default]
    Idle,
    Checking,
    UpToDate,
    Downloading {
        version: String,
        /// 전체 크기를 모르면 None
        progress: Option<u8>,
    },
    /// 다운로드 완료. 프로그램을 끌 때 설치됨
    Ready {
        version: String,
        notes: Option<String>,
    },
    Failed {
        message: String,
    },
}

#[derive(Default)]
pub struct UpdaterState {
    status: Mutex<UpdateStatus>,
    downloaded: Mutex<Option<(Update, Vec<u8>)>>,
    /// 확인/다운로드 중복 실행 방지
    busy: tokio::sync::Mutex<()>,
    /// 사용자가 창을 닫아 종료하는 중인지 (재시작/프로그램 종료 요청은 제외)
    install_on_exit: AtomicBool,
}

impl UpdaterState {
    pub fn status(&self) -> UpdateStatus {
        self.status
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
}

fn set_status<R: Runtime>(app: &AppHandle<R>, status: UpdateStatus) {
    let state = app.state::<UpdaterState>();
    *state.status.lock().unwrap_or_else(|e| e.into_inner()) = status.clone();
    let _ = app.emit(STATUS_EVENT, status);
}

/// 업데이트를 확인하고, 있으면 내려받아 둡니다. 이미 받아 둔 업데이트가 있으면 그대로 둡니다.
pub async fn check_and_download<R: Runtime>(app: &AppHandle<R>) -> UpdateStatus {
    let state = app.state::<UpdaterState>();
    let Ok(_busy) = state.busy.try_lock() else {
        // 이미 확인/다운로드 중
        return state.status();
    };
    if matches!(state.status(), UpdateStatus::Ready { .. }) {
        return state.status();
    }

    set_status(app, UpdateStatus::Checking);
    let status = match fetch(app).await {
        Ok(status) => status,
        Err(e) => {
            log::warn!("업데이트 확인/다운로드 실패: {e}");
            UpdateStatus::Failed {
                message: e.to_string(),
            }
        }
    };
    set_status(app, status.clone());
    status
}

async fn fetch<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<UpdateStatus, tauri_plugin_updater::Error> {
    let updater = app.updater_builder().timeout(CHECK_TIMEOUT).build()?;
    let Some(mut update) = updater.check().await? else {
        return Ok(UpdateStatus::UpToDate);
    };
    update.timeout = Some(DOWNLOAD_TIMEOUT);

    let version = update.version.clone();
    log::info!("새 버전 {version} 다운로드 시작");
    set_status(
        app,
        UpdateStatus::Downloading {
            version: version.clone(),
            progress: None,
        },
    );

    let mut received: u64 = 0;
    let mut last_progress: Option<u8> = None;
    let bytes = update
        .download(
            |chunk, total| {
                received += chunk as u64;
                let progress = total
                    .filter(|t| *t > 0)
                    .map(|t| (received.saturating_mul(100) / t).min(100) as u8);
                if progress != last_progress {
                    last_progress = progress;
                    set_status(
                        app,
                        UpdateStatus::Downloading {
                            version: version.clone(),
                            progress,
                        },
                    );
                }
            },
            || {},
        )
        .await?;

    log::info!("새 버전 {version} 다운로드 완료 (프로그램을 끌 때 설치)");
    let notes = update.body.clone();
    *app.state::<UpdaterState>()
        .downloaded
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = Some((update, bytes));
    Ok(UpdateStatus::Ready { version, notes })
}

/// 앱을 켜 둔 동안 주기적으로 확인합니다. 받아 두었으면 더 확인하지 않습니다.
/// 개발 빌드에서는 자동으로 확인하지 않습니다.
pub fn spawn_background_check<R: Runtime>(app: AppHandle<R>) {
    if cfg!(debug_assertions) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        loop {
            if matches!(check_and_download(&app).await, UpdateStatus::Ready { .. }) {
                break;
            }
            tokio::time::sleep(RECHECK_INTERVAL).await;
        }
    });
}

/// 받아 둔 업데이트를 설치합니다. 받아 둔 것이 없으면 Ok(false).
///
/// Windows에서는 설치 프로그램을 실행한 뒤 이 프로세스가 종료되므로 반환하지 않습니다.
pub fn install_downloaded<R: Runtime>(app: &AppHandle<R>) -> Result<bool, String> {
    let pending = app
        .state::<UpdaterState>()
        .downloaded
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .take();
    let Some((update, bytes)) = pending else {
        return Ok(false);
    };
    log::info!(
        "업데이트 설치: {} → {}",
        update.current_version,
        update.version
    );
    update.install(bytes).map_err(|e| e.to_string())?;
    Ok(true)
}

/// `RunEvent::ExitRequested`: 사용자가 창을 닫아 종료할 때(code = None)만 설치 대상으로 표시합니다.
/// 복원/초기화 후 재시작 같은 프로그램 요청 종료에서는 설치하지 않습니다.
pub fn on_exit_requested<R: Runtime>(app: &AppHandle<R>, code: Option<i32>) {
    if let Some(state) = app.try_state::<UpdaterState>() {
        state
            .install_on_exit
            .store(code.is_none(), Ordering::SeqCst);
    }
}

/// `RunEvent::Exit`: 받아 둔 업데이트가 있으면 설치합니다.
pub fn on_exit<R: Runtime>(app: &AppHandle<R>) {
    let Some(state) = app.try_state::<UpdaterState>() else {
        return;
    };
    if !state.install_on_exit.load(Ordering::SeqCst) {
        return;
    }
    if let Err(e) = install_downloaded(app) {
        log::error!("종료 시 업데이트 설치 실패: {e}");
    }
}
