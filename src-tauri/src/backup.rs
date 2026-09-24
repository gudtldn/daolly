//! DB 백업 엔진
//!
//! - 스냅샷은 `VACUUM INTO`로 만듭니다. 열린 DB 파일을 그대로 복사하면 쓰기 도중의
//!   불완전한 상태가 담길 수 있기 때문입니다.
//! - 파일 이름에 백업 종류를 기록하고, 종류별 보존 정책에 따라 오래된 파일을 정리합니다.
//! - 사용자가 추가 백업 폴더(USB, 클라우드 동기화 폴더 등)를 지정하면 같은 파일을 복사해 둡니다.
//! - 복원은 백업 파일을 검증하고 현재 DB를 먼저 백업한 뒤, 다음 기동 때 교체합니다
//!   (실제 교체와 실패 시 원복은 `crate::startup`).

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use std::time::Duration;

use chrono::{Datelike, Local, NaiveDate, NaiveDateTime, NaiveTime, Timelike};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, DbErr, Statement};
use sea_orm_migration::MigratorTrait;
use serde::{Deserialize, Serialize};

use crate::db::{self, migrations::Migrator};

/// app_data_dir 아래 백업 폴더
pub const BACKUPS_DIR: &str = "backups";
/// 다음 기동 때 적용할 복원 파일
pub const PENDING_RESTORE_FILE: &str = "daolly.db.pending_restore";
/// 추가 백업 폴더 설정 파일 (app_data_dir 아래)
const SETTINGS_FILE: &str = "backup_settings.json";
/// 추가 백업 폴더 안에 만드는 하위 폴더
const MIRROR_SUBDIR: &str = "daolly-backups";

/// 자동 백업 보존: 최근 N개 + 그보다 오래된 것은 월별로 1개씩 M개월
const DAILY_KEEP_RECENT: usize = 14;
const DAILY_KEEP_MONTHS: usize = 12;
/// 안전 백업(업데이트 전/복원 전/초기화 전/가져오기 전) 종류별 보존 개수
const SAFETY_KEEP: usize = 10;
/// 자동 백업 확인 주기 (앱을 며칠씩 켜 두는 경우 대비)
const DAILY_CHECK_INTERVAL: Duration = Duration::from_secs(60 * 60);

/// 백업 작업 직렬화 (파일명 충돌, 정리 도중 복사 방지)
static BACKUP_LOCK: LazyLock<tokio::sync::Mutex<()>> =
    LazyLock::new(|| tokio::sync::Mutex::new(()));

#[derive(Debug, thiserror::Error)]
pub enum BackupError {
    #[error("백업 파일을 만들지 못했습니다: {0}")]
    Snapshot(DbErr),
    #[error("파일 작업에 실패했습니다: {0}")]
    Io(#[from] std::io::Error),
    #[error("백업 파일 이름이 올바르지 않습니다")]
    InvalidName,
    #[error("백업 파일을 찾을 수 없습니다")]
    NotFound,
    #[error("백업 파일이 손상되어 복원할 수 없습니다")]
    Corrupted,
    #[error("다올리 백업 파일이 아닙니다")]
    NotDaollyBackup,
    #[error("더 새로운 버전의 다올리에서 만든 백업입니다. 앱을 먼저 업데이트해 주세요")]
    NewerVersion,
    #[error("추가 백업 폴더를 사용할 수 없습니다: {0}")]
    MirrorUnavailable(String),
}

/// 백업 종류 (파일 이름에 기록)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BackupKind {
    /// 사용자가 '지금 백업'을 누름
    Manual,
    /// 하루 1회 자동 백업
    Daily,
    /// DB 구조 변경(마이그레이션) 직전
    PreMigration,
    /// 복원 직전의 현재 데이터
    PreRestore,
    /// 전체 삭제 직전
    PreClear,
    /// 이전 버전 데이터 / 단가표 가져오기 직전
    PreImport,
    /// 종류 표기가 없는 이전 버전 파일명
    Legacy,
}

impl BackupKind {
    fn tag(self) -> Option<&'static str> {
        match self {
            Self::Manual => Some("manual"),
            Self::Daily => Some("daily"),
            Self::PreMigration => Some("pre-migration"),
            Self::PreRestore => Some("pre-restore"),
            Self::PreClear => Some("pre-clear"),
            Self::PreImport => Some("pre-import"),
            Self::Legacy => None,
        }
    }

    fn from_tag(tag: &str) -> Option<Self> {
        [
            Self::Manual,
            Self::Daily,
            Self::PreMigration,
            Self::PreRestore,
            Self::PreClear,
            Self::PreImport,
        ]
        .into_iter()
        .find(|k| k.tag() == Some(tag))
    }
}

/// 백업 목록 항목 (화면 표시용)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub filename: String,
    /// "YYYY.MM.DD HH:MM:SS" (파일명에서 읽을 수 없으면 "알 수 없음")
    pub created_at: String,
    pub size_bytes: u64,
    pub kind: BackupKind,
}

/// 추가 백업 폴더 복사 결과
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorStatus {
    /// "YYYY.MM.DD HH:MM:SS"
    pub at: String,
    pub ok: bool,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupOutcome {
    pub info: BackupInfo,
    /// 추가 백업 폴더가 지정되지 않았으면 None
    pub mirror: Option<MirrorStatus>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSettings {
    /// 추가 백업 폴더 (USB, 클라우드 동기화 폴더 등)
    pub mirror_dir: Option<PathBuf>,
    pub last_mirror: Option<MirrorStatus>,
}

// ============================================================
// 파일 이름
// ============================================================

#[derive(Debug, Clone, Copy, PartialEq)]
struct ParsedName {
    timestamp: NaiveDateTime,
    kind: BackupKind,
}

/// `daolly_YYYYMMDD_HHMMSS[_종류[_번호]].db`
fn parse_file_name(name: &str) -> Option<ParsedName> {
    let stem = name.strip_suffix(".db")?;
    let mut parts = stem.split('_');
    if parts.next()? != "daolly" {
        return None;
    }
    let timestamp = parse_timestamp(parts.next()?, parts.next()?)?;
    let kind = match parts.next() {
        None => BackupKind::Legacy,
        Some(tag) => BackupKind::from_tag(tag)?,
    };
    if let Some(seq) = parts.next() {
        seq.parse::<u32>().ok()?;
    }
    if parts.next().is_some() {
        return None;
    }
    Some(ParsedName { timestamp, kind })
}

fn parse_timestamp(date: &str, time: &str) -> Option<NaiveDateTime> {
    let digits = |s: &str, len: usize| s.len() == len && s.bytes().all(|b| b.is_ascii_digit());
    if !digits(date, 8) || !digits(time, 6) {
        return None;
    }
    let num = |s: &str| s.parse::<u32>().ok();
    let date = NaiveDate::from_ymd_opt(
        date[0..4].parse().ok()?,
        num(&date[4..6])?,
        num(&date[6..8])?,
    )?;
    let time = NaiveTime::from_hms_opt(num(&time[0..2])?, num(&time[2..4])?, num(&time[4..6])?)?;
    Some(NaiveDateTime::new(date, time))
}

fn format_file_name(timestamp: NaiveDateTime, kind: BackupKind, seq: u32) -> String {
    let mut name = format!("daolly_{}", timestamp.format("%Y%m%d_%H%M%S"));
    if let Some(tag) = kind.tag() {
        name.push('_');
        name.push_str(tag);
    }
    if seq > 1 {
        name.push_str(&format!("_{seq}"));
    }
    name.push_str(".db");
    name
}

fn display_time(timestamp: NaiveDateTime) -> String {
    timestamp.format("%Y.%m.%d %H:%M:%S").to_string()
}

/// 현재 로컬 시각 (파일명이 초 단위이므로 나노초는 버림)
fn now_local() -> NaiveDateTime {
    let now = Local::now().naive_local();
    now.with_nanosecond(0).unwrap_or(now)
}

// ============================================================
// 목록 / 정리
// ============================================================

struct Entry {
    path: PathBuf,
    filename: String,
    parsed: Option<ParsedName>,
    size_bytes: u64,
}

impl Entry {
    fn info(&self) -> BackupInfo {
        BackupInfo {
            filename: self.filename.clone(),
            created_at: self
                .parsed
                .map(|p| display_time(p.timestamp))
                .unwrap_or_else(|| "알 수 없음".to_owned()),
            size_bytes: self.size_bytes,
            kind: self.parsed.map(|p| p.kind).unwrap_or(BackupKind::Legacy),
        }
    }
}

fn scan_dir(dir: &Path) -> std::io::Result<Vec<Entry>> {
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut entries = Vec::new();
    for item in std::fs::read_dir(dir)? {
        let Ok(item) = item else { continue };
        let path = item.path();
        if path.extension().and_then(|e| e.to_str()) != Some("db") || !path.is_file() {
            continue;
        }
        let Some(filename) = path.file_name().map(|n| n.to_string_lossy().into_owned()) else {
            continue;
        };
        let size_bytes = item.metadata().map(|m| m.len()).unwrap_or(0);
        entries.push(Entry {
            parsed: parse_file_name(&filename),
            path,
            filename,
            size_bytes,
        });
    }
    // 최신순, 파일명을 읽을 수 없는 항목은 맨 뒤
    entries.sort_by(|a, b| {
        let ta = a.parsed.map(|p| p.timestamp);
        let tb = b.parsed.map(|p| p.timestamp);
        tb.cmp(&ta).then_with(|| b.filename.cmp(&a.filename))
    });
    Ok(entries)
}

/// 백업 목록 (최신순)
pub fn list_backups(data_dir: &Path) -> std::io::Result<Vec<BackupInfo>> {
    Ok(scan_dir(&data_dir.join(BACKUPS_DIR))?
        .iter()
        .map(Entry::info)
        .collect())
}

/// 보존 정책에 따라 남길 파일을 고릅니다. `entries`는 최신순이어야 합니다.
fn retained(entries: &[Entry]) -> HashSet<PathBuf> {
    let mut keep = HashSet::new();
    let mut by_kind: HashMap<BackupKind, Vec<&Entry>> = HashMap::new();
    for e in entries {
        match e.parsed {
            // 사용자가 만든 백업, 이전 버전 파일, 이름을 읽을 수 없는 파일은 지우지 않음
            None
            | Some(ParsedName {
                kind: BackupKind::Manual | BackupKind::Legacy,
                ..
            }) => {
                keep.insert(e.path.clone());
            }
            Some(p) => by_kind.entry(p.kind).or_default().push(e),
        }
    }

    for (kind, files) in by_kind {
        if kind == BackupKind::Daily {
            let (recent, older) = files.split_at(files.len().min(DAILY_KEEP_RECENT));
            keep.extend(recent.iter().map(|e| e.path.clone()));
            let mut months = HashSet::new();
            for e in older {
                let ts = e.parsed.expect("parsed entries only").timestamp;
                if months.len() >= DAILY_KEEP_MONTHS {
                    break;
                }
                if months.insert((ts.year(), ts.month())) {
                    keep.insert(e.path.clone());
                }
            }
        } else {
            keep.extend(files.iter().take(SAFETY_KEEP).map(|e| e.path.clone()));
        }
    }
    keep
}

fn prune_dir(dir: &Path) -> std::io::Result<()> {
    let entries = scan_dir(dir)?;
    let keep = retained(&entries);
    for e in entries.iter().filter(|e| !keep.contains(&e.path)) {
        if let Err(err) = std::fs::remove_file(&e.path) {
            log::warn!("오래된 백업 삭제 실패 {}: {err}", e.path.display());
        }
    }
    Ok(())
}

/// 이전에 중단된 작업이 남긴 임시 파일 정리
fn remove_partials(dir: &Path) {
    let Ok(items) = std::fs::read_dir(dir) else {
        return;
    };
    for item in items.flatten() {
        let path = item.path();
        if path.extension().and_then(|e| e.to_str()) == Some("partial") {
            let _ = std::fs::remove_file(path);
        }
    }
}

// ============================================================
// 생성
// ============================================================

/// 백업을 만들고, 오래된 백업을 정리하고, 추가 폴더가 지정되어 있으면 복사합니다.
pub async fn create_backup(
    db: &DatabaseConnection,
    data_dir: &Path,
    kind: BackupKind,
) -> Result<BackupOutcome, BackupError> {
    let _guard = BACKUP_LOCK.lock().await;
    create_backup_locked(db, data_dir, kind).await
}

/// 오늘(로컬 날짜) 자동 백업이 없으면 만듭니다. 이미 있으면 None.
pub async fn ensure_daily_backup(
    db: &DatabaseConnection,
    data_dir: &Path,
) -> Result<Option<BackupOutcome>, BackupError> {
    let _guard = BACKUP_LOCK.lock().await;
    let today = Local::now().date_naive();
    let has_today = scan_dir(&data_dir.join(BACKUPS_DIR))?.iter().any(|e| {
        e.parsed
            .is_some_and(|p| p.kind == BackupKind::Daily && p.timestamp.date() == today)
    });
    if has_today {
        return Ok(None);
    }
    create_backup_locked(db, data_dir, BackupKind::Daily)
        .await
        .map(Some)
}

/// 앱이 켜져 있는 동안 주기적으로 자동 백업을 확인합니다.
pub fn spawn_daily_backup(db: DatabaseConnection, data_dir: PathBuf) {
    tauri::async_runtime::spawn(async move {
        loop {
            match ensure_daily_backup(&db, &data_dir).await {
                Ok(Some(outcome)) => log::info!("자동 백업 생성: {}", outcome.info.filename),
                Ok(None) => {}
                Err(e) => log::error!("자동 백업 실패: {e}"),
            }
            tokio::time::sleep(DAILY_CHECK_INTERVAL).await;
        }
    });
}

async fn create_backup_locked(
    db: &DatabaseConnection,
    data_dir: &Path,
    kind: BackupKind,
) -> Result<BackupOutcome, BackupError> {
    let dir = data_dir.join(BACKUPS_DIR);
    std::fs::create_dir_all(&dir)?;
    remove_partials(&dir);

    let timestamp = now_local();
    let (filename, path) = (1..)
        .map(|seq| {
            let name = format_file_name(timestamp, kind, seq);
            let path = dir.join(&name);
            (name, path)
        })
        .find(|(_, path)| !path.exists())
        .expect("unbounded sequence");

    // VACUUM INTO는 대상 파일이 있으면 실패하므로 임시 이름으로 만든 뒤 이름을 바꿈
    let partial = dir.join(format!("{filename}.partial"));
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "VACUUM INTO ?",
        [partial.to_string_lossy().into_owned().into()],
    ))
    .await
    .map_err(BackupError::Snapshot)?;
    std::fs::rename(&partial, &path)?;

    if let Err(e) = prune_dir(&dir) {
        log::warn!("백업 정리 실패: {e}");
    }

    let info = Entry {
        size_bytes: std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0),
        parsed: parse_file_name(&filename),
        path: path.clone(),
        filename,
    }
    .info();
    let mirror = mirror_backup(data_dir, &path);
    Ok(BackupOutcome { info, mirror })
}

// ============================================================
// 추가 백업 폴더
// ============================================================

pub fn load_settings(data_dir: &Path) -> BackupSettings {
    std::fs::read_to_string(data_dir.join(SETTINGS_FILE))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_settings(data_dir: &Path, settings: &BackupSettings) -> std::io::Result<()> {
    let json = serde_json::to_string_pretty(settings).map_err(std::io::Error::other)?;
    let path = data_dir.join(SETTINGS_FILE);
    let partial = data_dir.join(format!("{SETTINGS_FILE}.partial"));
    std::fs::write(&partial, json)?;
    std::fs::rename(partial, path)
}

/// 추가 백업 폴더를 지정하거나(Some) 해제합니다(None). 지정할 때는 쓰기 가능한지 확인합니다.
pub async fn set_mirror_dir(data_dir: &Path, dir: Option<PathBuf>) -> Result<(), BackupError> {
    let _guard = BACKUP_LOCK.lock().await;
    if let Some(dir) = &dir {
        check_mirror_writable(dir)?;
    }
    let mut settings = load_settings(data_dir);
    if settings.mirror_dir != dir {
        settings.last_mirror = None;
    }
    settings.mirror_dir = dir;
    save_settings(data_dir, &settings)?;
    Ok(())
}

fn check_mirror_writable(root: &Path) -> Result<(), BackupError> {
    let unavailable = |msg: String| BackupError::MirrorUnavailable(msg);
    if !root.is_dir() {
        return Err(unavailable("폴더를 찾을 수 없습니다".to_owned()));
    }
    let dir = root.join(MIRROR_SUBDIR);
    std::fs::create_dir_all(&dir).map_err(|e| unavailable(e.to_string()))?;
    let probe = dir.join(".write-test");
    std::fs::write(&probe, b"ok").map_err(|e| unavailable(e.to_string()))?;
    let _ = std::fs::remove_file(probe);
    Ok(())
}

/// 추가 폴더가 지정되어 있으면 백업 파일을 복사하고 결과를 설정 파일에 기록합니다.
fn mirror_backup(data_dir: &Path, file: &Path) -> Option<MirrorStatus> {
    let mut settings = load_settings(data_dir);
    let root = settings.mirror_dir.clone()?;

    let status = match copy_to_mirror(&root, file) {
        Ok(()) => MirrorStatus {
            at: display_time(now_local()),
            ok: true,
            message: None,
        },
        Err(e) => {
            log::warn!("추가 백업 폴더 복사 실패 ({}): {e}", root.display());
            MirrorStatus {
                at: display_time(now_local()),
                ok: false,
                message: Some(e.to_string()),
            }
        }
    };

    settings.last_mirror = Some(status.clone());
    if let Err(e) = save_settings(data_dir, &settings) {
        log::warn!("백업 설정 저장 실패: {e}");
    }
    Some(status)
}

fn copy_to_mirror(root: &Path, file: &Path) -> Result<(), BackupError> {
    check_mirror_writable(root)?;
    let dir = root.join(MIRROR_SUBDIR);
    let filename = file.file_name().ok_or(BackupError::InvalidName)?;
    let partial = dir.join(format!("{}.partial", filename.to_string_lossy()));
    std::fs::copy(file, &partial)?;
    std::fs::rename(&partial, dir.join(filename))?;
    prune_dir(&dir)?;
    Ok(())
}

// ============================================================
// 복원
// ============================================================

/// 복원에 쓸 수 있는 파일인지 확인합니다: 무결성 검사 + 이 앱이 아는 마이그레이션만 적용된 DB.
pub async fn validate_backup(path: &Path) -> Result<(), BackupError> {
    let conn = db::connect(path, true)
        .await
        .map_err(|_| BackupError::Corrupted)?;
    let result = validate_connection(&conn).await;
    let _ = conn.close_by_ref().await;
    result
}

async fn validate_connection(conn: &DatabaseConnection) -> Result<(), BackupError> {
    let rows = conn
        .query_all(Statement::from_string(
            DbBackend::Sqlite,
            "PRAGMA integrity_check",
        ))
        .await
        .map_err(|_| BackupError::Corrupted)?;
    let ok = rows.len() == 1
        && rows[0]
            .try_get_by_index::<String>(0)
            .is_ok_and(|s| s == "ok");
    if !ok {
        return Err(BackupError::Corrupted);
    }

    let rows = conn
        .query_all(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT version FROM seaql_migrations",
        ))
        .await
        .map_err(|_| BackupError::NotDaollyBackup)?;
    let known: HashSet<String> = Migrator::migrations()
        .iter()
        .map(|m| m.name().to_owned())
        .collect();
    for row in rows {
        let version: String = row
            .try_get_by_index(0)
            .map_err(|_| BackupError::NotDaollyBackup)?;
        if !known.contains(&version) {
            return Err(BackupError::NewerVersion);
        }
    }
    Ok(())
}

/// 복원을 예약합니다: 검증 → 현재 데이터 백업 → 다음 기동 때 적용할 파일 배치.
///
/// `db`가 None이면(DB를 열지 못한 복구 모드) 현재 DB 파일을 그대로 복사해 보관합니다.
pub async fn stage_restore(
    db: Option<&DatabaseConnection>,
    data_dir: &Path,
    filename: &str,
) -> Result<(), BackupError> {
    if filename.contains(['/', '\\']) || filename.contains("..") || !filename.ends_with(".db") {
        return Err(BackupError::InvalidName);
    }
    let source = data_dir.join(BACKUPS_DIR).join(filename);
    if !source.is_file() {
        return Err(BackupError::NotFound);
    }
    validate_backup(&source).await?;

    let _guard = BACKUP_LOCK.lock().await;
    match db {
        Some(db) => {
            create_backup_locked(db, data_dir, BackupKind::PreRestore).await?;
        }
        None => preserve_current_file(data_dir)?,
    }

    let pending = data_dir.join(PENDING_RESTORE_FILE);
    let partial = data_dir.join(format!("{PENDING_RESTORE_FILE}.partial"));
    std::fs::copy(&source, &partial)?;
    std::fs::rename(&partial, &pending)?;
    Ok(())
}

/// 열 수 없는 현재 DB 파일을 '복원 전' 백업으로 그대로 복사해 둡니다.
/// (DB 연결이 없어 VACUUM INTO를 쓸 수 없고, 연결이 없으니 파일 복사도 안전함)
fn preserve_current_file(data_dir: &Path) -> Result<(), BackupError> {
    let current = data_dir.join(db::DB_FILE_NAME);
    if !current.is_file() {
        return Ok(());
    }
    let dir = data_dir.join(BACKUPS_DIR);
    std::fs::create_dir_all(&dir)?;
    let timestamp = now_local();
    let path = (1..)
        .map(|seq| dir.join(format_file_name(timestamp, BackupKind::PreRestore, seq)))
        .find(|path| !path.exists())
        .expect("unbounded sequence");
    let partial = path.with_extension("db.partial");
    std::fs::copy(&current, &partial)?;
    std::fs::rename(&partial, &path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::customers;
    use sea_orm::EntityTrait;

    async fn setup() -> (tempfile::TempDir, DatabaseConnection) {
        let dir = tempfile::tempdir().unwrap();
        let db = db::init(dir.path()).await.unwrap();
        (dir, db)
    }

    fn touch(dir: &Path, name: &str) {
        std::fs::create_dir_all(dir).unwrap();
        std::fs::write(dir.join(name), b"x").unwrap();
    }

    fn names(dir: &Path) -> Vec<String> {
        let mut v: Vec<String> = scan_dir(dir)
            .unwrap()
            .into_iter()
            .map(|e| e.filename)
            .collect();
        v.sort();
        v
    }

    #[test]
    fn file_name_roundtrip() {
        let ts = NaiveDateTime::parse_from_str("2026-09-24 10:15:00", "%Y-%m-%d %H:%M:%S").unwrap();
        for kind in [
            BackupKind::Manual,
            BackupKind::Daily,
            BackupKind::PreMigration,
            BackupKind::PreRestore,
            BackupKind::PreClear,
            BackupKind::PreImport,
        ] {
            for seq in [1, 2] {
                let name = format_file_name(ts, kind, seq);
                assert_eq!(
                    parse_file_name(&name),
                    Some(ParsedName {
                        timestamp: ts,
                        kind
                    }),
                    "{name}"
                );
            }
        }
        assert_eq!(
            format_file_name(ts, BackupKind::Daily, 1),
            "daolly_20260924_101500_daily.db"
        );
    }

    #[test]
    fn parses_legacy_and_rejects_foreign_names() {
        let p = parse_file_name("daolly_20260424_235959.db").unwrap();
        assert_eq!(p.kind, BackupKind::Legacy);
        assert_eq!(display_time(p.timestamp), "2026.04.24 23:59:59");
        for bad in [
            "other.db",
            "daolly_2026_1015.db",
            "daolly_20260924_101500_weird.db",
            "daolly_20261324_101500.db",
        ] {
            assert_eq!(parse_file_name(bad), None, "{bad}");
        }
    }

    #[tokio::test]
    async fn backup_is_consistent_snapshot() {
        let (dir, db) = setup().await;
        customers::create(&db, "홍길동".into(), Some("01012345678".into()), None)
            .await
            .unwrap();

        let outcome = create_backup(&db, dir.path(), BackupKind::Manual)
            .await
            .unwrap();
        assert_eq!(outcome.info.kind, BackupKind::Manual);
        assert!(outcome.mirror.is_none());

        let path = dir.path().join(BACKUPS_DIR).join(&outcome.info.filename);
        validate_backup(&path).await.unwrap();
        let snap = db::connect(&path, true).await.unwrap();
        assert_eq!(
            crate::db::entities::customer::Entity::find()
                .all(&snap)
                .await
                .unwrap()
                .len(),
            1
        );
    }

    #[tokio::test]
    async fn same_second_backups_do_not_collide() {
        let (dir, db) = setup().await;
        let a = create_backup(&db, dir.path(), BackupKind::Manual)
            .await
            .unwrap();
        let b = create_backup(&db, dir.path(), BackupKind::Manual)
            .await
            .unwrap();
        assert_ne!(a.info.filename, b.info.filename);
        assert_eq!(list_backups(dir.path()).unwrap().len(), 2);
    }

    #[tokio::test]
    async fn daily_backup_once_per_day() {
        let (dir, db) = setup().await;
        assert!(
            ensure_daily_backup(&db, dir.path())
                .await
                .unwrap()
                .is_some()
        );
        assert!(
            ensure_daily_backup(&db, dir.path())
                .await
                .unwrap()
                .is_none()
        );
        let list = list_backups(dir.path()).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].kind, BackupKind::Daily);
    }

    #[test]
    fn retention_policy() {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        // 2025-01-01부터 400일치 자동 백업
        let start = NaiveDate::from_ymd_opt(2025, 1, 1).unwrap();
        for i in 0..400 {
            let ts = (start + chrono::Duration::days(i))
                .and_hms_opt(9, 0, 0)
                .unwrap();
            touch(d, &format_file_name(ts, BackupKind::Daily, 1));
        }
        // 안전 백업 12개, 수동 3개, 이전 버전 파일 1개
        for i in 0..12 {
            let ts = (start + chrono::Duration::days(i))
                .and_hms_opt(8, 0, 0)
                .unwrap();
            touch(d, &format_file_name(ts, BackupKind::PreMigration, 1));
        }
        for i in 0..3 {
            let ts = (start + chrono::Duration::days(i))
                .and_hms_opt(7, 0, 0)
                .unwrap();
            touch(d, &format_file_name(ts, BackupKind::Manual, 1));
        }
        touch(d, "daolly_20240101_000000.db");

        prune_dir(d).unwrap();
        let entries = scan_dir(d).unwrap();
        let count = |k: BackupKind| {
            entries
                .iter()
                .filter(|e| e.parsed.map(|p| p.kind) == Some(k))
                .count()
        };
        assert_eq!(
            count(BackupKind::Daily),
            DAILY_KEEP_RECENT + DAILY_KEEP_MONTHS
        );
        assert_eq!(count(BackupKind::PreMigration), SAFETY_KEEP);
        assert_eq!(count(BackupKind::Manual), 3);
        assert_eq!(count(BackupKind::Legacy), 1);

        // 가장 최근 자동 백업은 반드시 남음
        let newest = (start + chrono::Duration::days(399))
            .and_hms_opt(9, 0, 0)
            .unwrap();
        assert!(names(d).contains(&format_file_name(newest, BackupKind::Daily, 1)));
    }

    #[tokio::test]
    async fn mirror_copy_and_failure_status() {
        let (dir, db) = setup().await;
        let mirror = tempfile::tempdir().unwrap();

        set_mirror_dir(dir.path(), Some(mirror.path().to_path_buf()))
            .await
            .unwrap();
        let outcome = create_backup(&db, dir.path(), BackupKind::Manual)
            .await
            .unwrap();
        let status = outcome.mirror.unwrap();
        assert!(status.ok);
        assert!(
            mirror
                .path()
                .join(MIRROR_SUBDIR)
                .join(&outcome.info.filename)
                .is_file()
        );
        assert_eq!(load_settings(dir.path()).last_mirror, Some(status));

        // USB를 뽑은 경우: 백업은 성공하고 복사 실패만 기록
        let gone = mirror.path().to_path_buf();
        drop(mirror);
        let outcome = create_backup(&db, dir.path(), BackupKind::Manual)
            .await
            .unwrap();
        let status = outcome.mirror.unwrap();
        assert!(!status.ok);
        assert!(
            dir.path()
                .join(BACKUPS_DIR)
                .join(&outcome.info.filename)
                .is_file()
        );
        assert_eq!(load_settings(dir.path()).mirror_dir, Some(gone));

        // 존재하지 않는 폴더는 지정할 수 없음
        let missing = dir.path().join("no-such-dir");
        assert!(matches!(
            set_mirror_dir(dir.path(), Some(missing)).await,
            Err(BackupError::MirrorUnavailable(_))
        ));
        set_mirror_dir(dir.path(), None).await.unwrap();
        assert_eq!(load_settings(dir.path()), BackupSettings::default());
    }

    #[tokio::test]
    async fn validate_rejects_bad_files() {
        let dir = tempfile::tempdir().unwrap();

        let garbage = dir.path().join("garbage.db");
        std::fs::write(&garbage, b"this is not a sqlite database at all, just text").unwrap();
        assert!(matches!(
            validate_backup(&garbage).await,
            Err(BackupError::Corrupted)
        ));

        let foreign = dir.path().join("foreign.db");
        let conn = db::connect(&foreign, false).await.unwrap();
        conn.execute_unprepared("CREATE TABLE t (x INTEGER)")
            .await
            .unwrap();
        conn.close().await.unwrap();
        assert!(matches!(
            validate_backup(&foreign).await,
            Err(BackupError::NotDaollyBackup)
        ));

        let (data, db) = setup().await;
        db.execute_unprepared(
            "INSERT INTO seaql_migrations (version, applied_at) VALUES ('m20991231_000001_future', 0)",
        )
        .await
        .unwrap();
        let outcome = create_backup(&db, data.path(), BackupKind::Manual)
            .await
            .unwrap();
        let newer = data.path().join(BACKUPS_DIR).join(outcome.info.filename);
        assert!(matches!(
            validate_backup(&newer).await,
            Err(BackupError::NewerVersion)
        ));
    }

    #[tokio::test]
    async fn stage_restore_backs_up_current_data_first() {
        let (dir, db) = setup().await;
        let target = create_backup(&db, dir.path(), BackupKind::Manual)
            .await
            .unwrap();

        stage_restore(Some(&db), dir.path(), &target.info.filename)
            .await
            .unwrap();

        assert!(dir.path().join(PENDING_RESTORE_FILE).is_file());
        let kinds: Vec<BackupKind> = list_backups(dir.path())
            .unwrap()
            .iter()
            .map(|b| b.kind)
            .collect();
        assert!(kinds.contains(&BackupKind::PreRestore));

        for bad in ["../daolly.db", "a/b.db", "missing.db", "daolly.txt"] {
            assert!(
                stage_restore(Some(&db), dir.path(), bad).await.is_err(),
                "{bad}"
            );
        }
    }

    /// 복구 모드(DB를 열지 못함)에서도 현재 파일을 보관한 뒤 복원을 예약
    #[tokio::test]
    async fn stage_restore_without_connection_preserves_current_file() {
        let (dir, db) = setup().await;
        let target = create_backup(&db, dir.path(), BackupKind::Manual)
            .await
            .unwrap();
        db.close().await.unwrap();
        std::fs::write(dir.path().join(db::DB_FILE_NAME), b"damaged").unwrap();

        stage_restore(None, dir.path(), &target.info.filename)
            .await
            .unwrap();

        assert!(dir.path().join(PENDING_RESTORE_FILE).is_file());
        let preserved = list_backups(dir.path())
            .unwrap()
            .into_iter()
            .find(|b| b.kind == BackupKind::PreRestore)
            .expect("현재 파일 보관");
        let bytes = std::fs::read(dir.path().join(BACKUPS_DIR).join(preserved.filename)).unwrap();
        assert_eq!(bytes, b"damaged");
    }
}
