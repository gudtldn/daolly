//! 앱 기동 시 DB 준비
//!
//! 예약된 복원 파일이 있으면 현재 DB를 옆으로 옮기고 복원 파일로 교체한 뒤 열어 봅니다.
//! 열리지 않으면(손상, 마이그레이션 실패 등) 원래 DB로 되돌립니다.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use sea_orm::{DatabaseConnection, DbErr};
use serde::Serialize;

use crate::backup::PENDING_RESTORE_FILE;
use crate::db::{self, DB_FILE_NAME};

/// 복원을 적용하는 동안 원래 DB를 보관하는 이름
const BEFORE_RESTORE_FILE: &str = "daolly.db.before_restore";
/// 적용에 실패한 복원 파일을 옮겨 두는 이름 (다음 기동 때 다시 시도하지 않도록)
const FAILED_RESTORE_FILE: &str = "daolly.db.failed_restore";
/// SQLite가 DB 옆에 만드는 파일들. 교체 대상 이름에 남아 있으면 복원본에 잘못 적용될 수 있음
const SIDECAR_SUFFIXES: [&str; 3] = ["-journal", "-wal", "-shm"];

/// 기동 후 화면에 알릴 내용
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum StartupNotice {
    /// 예약된 백업으로 복원됨
    RestoreApplied,
    /// 복원에 실패해 원래 데이터로 되돌림
    RestoreFailed { reason: String },
}

/// 프론트엔드가 한 번 가져가면 비워지는 기동 알림
#[derive(Default)]
pub struct StartupNotices(Mutex<Vec<StartupNotice>>);

impl StartupNotices {
    pub fn new(notices: Vec<StartupNotice>) -> Self {
        Self(Mutex::new(notices))
    }

    pub fn take(&self) -> Vec<StartupNotice> {
        std::mem::take(&mut *self.0.lock().unwrap_or_else(|e| e.into_inner()))
    }
}

/// 예약된 복원을 적용(실패 시 원복)하고 DB를 엽니다.
pub async fn open_database(
    data_dir: &Path,
) -> (Result<DatabaseConnection, DbErr>, Vec<StartupNotice>) {
    let mut notices = Vec::new();
    let db_path = data_dir.join(DB_FILE_NAME);
    let before = data_dir.join(BEFORE_RESTORE_FILE);
    let pending = data_dir.join(PENDING_RESTORE_FILE);

    // 교체 도중 앱이 꺼져 DB가 없고 원본만 옆에 남은 경우 되돌림
    if !pending.exists()
        && !db_path.exists()
        && before.exists()
        && let Err(e) = move_with_sidecars(&before, &db_path)
    {
        log::error!("중단된 복원 되돌리기 실패: {e}");
    }

    if pending.exists() {
        match swap_in_pending_restore(data_dir) {
            Ok(()) => match db::init(data_dir).await {
                Ok(db) => {
                    let _ = remove_with_sidecars(&before);
                    log::info!("백업 복원 적용 완료");
                    notices.push(StartupNotice::RestoreApplied);
                    return (Ok(db), notices);
                }
                Err(e) => {
                    log::error!("복원한 DB를 열지 못해 원래 DB로 되돌립니다: {e}");
                    if let Err(e) = rollback_restore(data_dir) {
                        log::error!("복원 되돌리기 실패: {e}");
                    }
                    notices.push(StartupNotice::RestoreFailed {
                        reason: e.to_string(),
                    });
                }
            },
            Err(e) => {
                log::error!("복원 파일 적용 실패: {e}");
                let _ = remove_with_sidecars(&data_dir.join(FAILED_RESTORE_FILE));
                let _ = std::fs::rename(&pending, data_dir.join(FAILED_RESTORE_FILE));
                notices.push(StartupNotice::RestoreFailed {
                    reason: e.to_string(),
                });
            }
        }
    }

    (db::init(data_dir).await, notices)
}

/// 현재 DB를 `before_restore`로 옮기고 복원 파일을 DB 자리에 놓습니다.
/// 실패하면 원래 상태로 되돌린 뒤 에러를 돌려줍니다.
fn swap_in_pending_restore(data_dir: &Path) -> std::io::Result<()> {
    let db_path = data_dir.join(DB_FILE_NAME);
    let before = data_dir.join(BEFORE_RESTORE_FILE);
    let pending = data_dir.join(PENDING_RESTORE_FILE);

    let moved_current = db_path.exists();
    if moved_current {
        // 이전 복원 시도의 잔여물
        remove_with_sidecars(&before)?;
        move_with_sidecars(&db_path, &before)?;
    }
    // DB 이름으로 남은 journal이 복원본에 적용되지 않도록 제거
    remove_sidecars(&db_path)?;

    if let Err(e) = std::fs::rename(&pending, &db_path) {
        if moved_current {
            let _ = move_with_sidecars(&before, &db_path);
        }
        return Err(e);
    }
    Ok(())
}

/// 열리지 않는 복원본을 `failed_restore`로 치우고 원래 DB를 되돌려 놓습니다.
fn rollback_restore(data_dir: &Path) -> std::io::Result<()> {
    let db_path = data_dir.join(DB_FILE_NAME);
    let before = data_dir.join(BEFORE_RESTORE_FILE);
    let failed = data_dir.join(FAILED_RESTORE_FILE);

    remove_with_sidecars(&failed)?;
    if db_path.exists() {
        move_with_sidecars(&db_path, &failed)?;
    }
    if before.exists() {
        move_with_sidecars(&before, &db_path)?;
    }
    Ok(())
}

fn sidecar(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(suffix);
    PathBuf::from(name)
}

fn move_with_sidecars(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::rename(from, to)?;
    for suffix in SIDECAR_SUFFIXES {
        let src = sidecar(from, suffix);
        if src.exists()
            && let Err(e) = std::fs::rename(&src, sidecar(to, suffix))
        {
            log::warn!("{} 이동 실패: {e}", src.display());
        }
    }
    Ok(())
}

fn remove_sidecars(path: &Path) -> std::io::Result<()> {
    for suffix in SIDECAR_SUFFIXES {
        let file = sidecar(path, suffix);
        if file.exists() {
            std::fs::remove_file(file)?;
        }
    }
    Ok(())
}

fn remove_with_sidecars(path: &Path) -> std::io::Result<()> {
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    remove_sidecars(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backup::{self, BackupKind};
    use crate::db::entities::customer;
    use crate::services::customers;
    use sea_orm::EntityTrait;

    async fn names(db: &DatabaseConnection) -> Vec<String> {
        customer::Entity::find()
            .all(db)
            .await
            .unwrap()
            .into_iter()
            .map(|c| c.name)
            .collect()
    }

    #[tokio::test]
    async fn opens_fresh_database_without_notices() {
        let dir = tempfile::tempdir().unwrap();
        let (db, notices) = open_database(dir.path()).await;
        assert!(db.is_ok());
        assert!(notices.is_empty());
    }

    #[tokio::test]
    async fn applies_staged_restore() {
        let dir = tempfile::tempdir().unwrap();
        let db = db::init(dir.path()).await.unwrap();
        customers::create(&db, "백업 시점 고객".into(), None, None)
            .await
            .unwrap();
        let snapshot = backup::create_backup(&db, dir.path(), BackupKind::Manual)
            .await
            .unwrap();
        customers::create(&db, "백업 이후 고객".into(), None, None)
            .await
            .unwrap();

        backup::stage_restore(&db, dir.path(), &snapshot.info.filename)
            .await
            .unwrap();
        db.close().await.unwrap();

        let (db, notices) = open_database(dir.path()).await;
        let db = db.unwrap();
        assert_eq!(notices, vec![StartupNotice::RestoreApplied]);
        assert_eq!(names(&db).await, vec!["백업 시점 고객"]);
        assert!(!dir.path().join(PENDING_RESTORE_FILE).exists());
        assert!(!dir.path().join(BEFORE_RESTORE_FILE).exists());
    }

    #[tokio::test]
    async fn broken_restore_rolls_back_to_original() {
        let dir = tempfile::tempdir().unwrap();
        let db = db::init(dir.path()).await.unwrap();
        customers::create(&db, "원래 고객".into(), None, None)
            .await
            .unwrap();
        db.close().await.unwrap();

        // 검증을 우회해 손상된 파일이 예약된 상황
        std::fs::write(dir.path().join(PENDING_RESTORE_FILE), b"broken file").unwrap();
        // 원래 DB 이름으로 남은 journal도 복원본에 적용되면 안 됨
        std::fs::write(sidecar(&dir.path().join(DB_FILE_NAME), "-journal"), b"").unwrap();

        let (db, notices) = open_database(dir.path()).await;
        let db = db.unwrap();
        assert!(matches!(
            notices.as_slice(),
            [StartupNotice::RestoreFailed { .. }]
        ));
        assert_eq!(names(&db).await, vec!["원래 고객"]);
        assert!(dir.path().join(FAILED_RESTORE_FILE).exists());
        assert!(!dir.path().join(PENDING_RESTORE_FILE).exists());

        // 다음 기동에서는 다시 시도하지 않음
        db.close().await.unwrap();
        let (db, notices) = open_database(dir.path()).await;
        assert!(notices.is_empty());
        assert_eq!(names(&db.unwrap()).await, vec!["원래 고객"]);
    }

    #[tokio::test]
    async fn recovers_interrupted_swap() {
        let dir = tempfile::tempdir().unwrap();
        let db = db::init(dir.path()).await.unwrap();
        customers::create(&db, "원래 고객".into(), None, None)
            .await
            .unwrap();
        db.close().await.unwrap();

        // DB를 옆으로 옮긴 직후 전원이 꺼진 상황
        std::fs::rename(
            dir.path().join(DB_FILE_NAME),
            dir.path().join(BEFORE_RESTORE_FILE),
        )
        .unwrap();

        let (db, _) = open_database(dir.path()).await;
        assert_eq!(names(&db.unwrap()).await, vec!["원래 고객"]);
    }
}
