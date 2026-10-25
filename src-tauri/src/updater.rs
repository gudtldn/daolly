//! 앱 업데이트
//!
//! 예전에는 기동할 때마다 업데이트를 받아 바로 설치해서, 가게 문을 여는 시간에
//! 다운로드가 끝날 때까지 기다려야 했습니다. 이제는 백그라운드에서 확인·다운로드해 두었다가
//! 사용자가 프로그램을 끌 때 설치합니다. (Windows MSI는 설치가 끝나면 앱을 다시 실행하며,
//! 설치가 중간에 끊기면 롤백되어 이전 버전이 유지됩니다)
//!
//! 프로그램을 켜 둔 채 Windows를 끄면 '종료 요청' 없이 바로 꺼져 설치되지 않습니다.
//! 그래서 받아 둔 버전을 파일에 적어 두고, 다음 실행에서도 아직 설치되지 않았으면
//! 시작 직후 바로 설치합니다. (같은 버전은 한 번만 시도해 설치 실패가 반복되지 않게 함)

use std::path::Path;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};

/// 업데이트 확인 요청 제한 시간
const CHECK_TIMEOUT: Duration = Duration::from_secs(30);
/// 다운로드 제한 시간 (느린 가게 인터넷 고려)
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(10 * 60);
/// 앱을 켜 둔 동안 다시 확인하는 주기
const RECHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
/// 확인·다운로드에 실패했을 때 다시 시도하는 간격 (켜자마자 인터넷이 늦게 붙는 경우)
const RETRY_INTERVAL: Duration = Duration::from_secs(10 * 60);
/// 시작 직후 설치는 이 시간 안에 받아 두었을 때만 (일하는 도중에 프로그램이 닫히지 않도록)
const EARLY_INSTALL_WINDOW: Duration = Duration::from_secs(3 * 60);
/// 받아 두고 아직 설치하지 못한 버전 기록 (앱 데이터 폴더)
const PENDING_FILE: &str = "update_pending.json";
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
    /// `message`: 왜 안 됐는지(사용자용), `detail`: 오류 원문(개발자용)
    Failed {
        message: String,
        detail: String,
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
                message: explain_failure(&e.to_string()).to_owned(),
                detail: e.to_string(),
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
    if let Ok(dir) = app.path().app_data_dir() {
        remember_downloaded(&dir, &version);
    }
    let notes = update.body.clone();
    *app.state::<UpdaterState>()
        .downloaded
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = Some((update, bytes));
    Ok(UpdateStatus::Ready { version, notes })
}

/// 업데이트 확인·다운로드 실패를 사용자가 알 수 있는 문장으로 바꿉니다.
fn explain_failure(raw: &str) -> &'static str {
    let raw = raw.to_lowercase();
    if raw.contains("signature") {
        "받은 파일이 다올리에서 만든 업데이트인지 확인되지 않아 설치하지 않았습니다. 지금 버전은 그대로 쓸 수 있습니다."
    } else if [
        "request",
        "connect",
        "dns",
        "timed out",
        "timeout",
        "network",
    ]
    .iter()
    .any(|k| raw.contains(k))
    {
        "인터넷에 연결되지 않았거나 업데이트 서버에 닿지 못했습니다. 지금 버전은 그대로 쓸 수 있고, 연결되면 다시 확인합니다."
    } else {
        "업데이트를 확인하지 못했습니다. 지금 버전은 그대로 쓸 수 있고, 잠시 뒤 다시 확인합니다."
    }
}

/// 앱을 켜 둔 동안 주기적으로 확인합니다. 받아 두었으면 더 확인하지 않습니다.
/// 지난 실행에서 받아 두고 설치하지 못한 버전이 있으면, 이번에는 받는 대로 바로 설치합니다.
/// 개발 빌드에서는 자동으로 확인하지 않습니다.
pub fn spawn_background_check<R: Runtime>(app: AppHandle<R>) {
    if cfg!(debug_assertions) {
        return;
    }
    let started = Instant::now();
    let data_dir = app.path().app_data_dir().ok();
    let install_early = data_dir
        .as_deref()
        .is_some_and(|dir| should_install_early(dir, &app.package_info().version));
    tauri::async_runtime::spawn(async move {
        loop {
            match check_and_download(&app).await {
                UpdateStatus::Ready { version, .. } => {
                    if install_early && started.elapsed() < EARLY_INSTALL_WINDOW {
                        log::info!("지난번에 설치하지 못한 새 버전 {version}을 바로 설치합니다");
                        if let Some(dir) = &data_dir {
                            mark_early_attempt(dir, &version);
                        }
                        if let Err(e) = install_now(&app) {
                            log::error!("시작 직후 업데이트 설치 실패: {e}");
                        }
                    }
                    break;
                }
                UpdateStatus::Failed { .. } => tokio::time::sleep(RETRY_INTERVAL).await,
                _ => tokio::time::sleep(RECHECK_INTERVAL).await,
            }
        }
    });
}

/// 받아 둔 업데이트를 지금 설치하고 다시 시작합니다. (Windows는 설치 프로그램이 앱을 닫고 다시 엶)
pub fn install_now<R: Runtime>(app: &AppHandle<R>) -> Result<bool, String> {
    let installed = install_downloaded(app)?;
    if installed {
        app.request_restart();
    }
    Ok(installed)
}

#[derive(Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PendingUpdate {
    version: String,
    /// 시작 직후 설치를 이미 시도했는지
    early_attempted: bool,
}

fn read_pending(dir: &Path) -> Option<PendingUpdate> {
    let text = std::fs::read_to_string(dir.join(PENDING_FILE)).ok()?;
    serde_json::from_str(&text).ok()
}

fn write_pending(dir: &Path, pending: &PendingUpdate) {
    let result = serde_json::to_string(pending)
        .map_err(std::io::Error::other)
        .and_then(|json| std::fs::write(dir.join(PENDING_FILE), json));
    if let Err(e) = result {
        log::warn!("업데이트 기록 저장 실패: {e}");
    }
}

/// 다운로드를 마친 버전을 기록합니다. (같은 버전이면 시도 기록을 그대로 둠)
fn remember_downloaded(dir: &Path, version: &str) {
    if read_pending(dir).is_some_and(|p| p.version == version) {
        return;
    }
    write_pending(
        dir,
        &PendingUpdate {
            version: version.to_owned(),
            early_attempted: false,
        },
    );
}

fn mark_early_attempt(dir: &Path, version: &str) {
    write_pending(
        dir,
        &PendingUpdate {
            version: version.to_owned(),
            early_attempted: true,
        },
    );
}

/// 지난 실행에서 받아 둔 버전이 아직 설치되지 않았고, 시작 직후 설치를 시도한 적이 없으면 true.
/// 이미 설치되었으면(지금 버전이 같거나 더 새로움) 기록을 지웁니다.
fn should_install_early(dir: &Path, current: &semver::Version) -> bool {
    let Some(pending) = read_pending(dir) else {
        return false;
    };
    match semver::Version::parse(&pending.version) {
        Ok(version) if version > *current => !pending.early_attempted,
        _ => {
            let _ = std::fs::remove_file(dir.join(PENDING_FILE));
            false
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn v(s: &str) -> semver::Version {
        semver::Version::parse(s).unwrap()
    }

    #[test]
    fn installs_early_once_per_version() {
        let dir = tempfile::tempdir().unwrap();
        let dir = dir.path();
        assert!(!should_install_early(dir, &v("0.2.8")));

        // 0.2.8에서 0.2.9를 받아 두었지만 설치하지 못하고 꺼짐
        remember_downloaded(dir, "0.2.9");
        assert!(should_install_early(dir, &v("0.2.8")));

        // 시작 직후 설치를 시도했는데 여전히 0.2.8이면 다시 시도하지 않음
        mark_early_attempt(dir, "0.2.9");
        remember_downloaded(dir, "0.2.9");
        assert!(!should_install_early(dir, &v("0.2.8")));

        // 더 새 버전을 받으면 그 버전은 다시 한 번 시도
        remember_downloaded(dir, "0.2.10");
        assert!(should_install_early(dir, &v("0.2.8")));
    }

    #[test]
    fn explains_update_failure() {
        assert!(explain_failure("error sending request for url").contains("인터넷"));
        assert!(explain_failure("Signature verification failed").contains("확인되지 않아"));
        assert!(explain_failure("??").contains("확인하지 못했습니다"));
    }

    #[test]
    fn clears_record_once_installed() {
        let dir = tempfile::tempdir().unwrap();
        let dir = dir.path();
        remember_downloaded(dir, "0.2.9");
        assert!(!should_install_early(dir, &v("0.2.9")));
        assert!(!dir.join(PENDING_FILE).exists());

        std::fs::write(dir.join(PENDING_FILE), "깨진 파일").unwrap();
        assert!(!should_install_early(dir, &v("0.2.8")));
    }
}
