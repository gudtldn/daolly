//! 사용 기록
//!
//! 화면을 어떻게 쓰는지(어느 화면에 얼마나 있는지, 무엇을 누르는지, 어디서 오류를 보는지)를
//! 로그 폴더의 `usage/usage-YYYY-MM-DD.jsonl`에 하루 한 파일씩 남깁니다.
//! 개발자가 한동안 손을 못 대도 나중에 무엇이 불편했는지 찾을 수 있도록 오래 보관하고,
//! 이 컴퓨터 밖으로 보내지 않습니다. 필요하면 '기록 내보내기'로 zip 파일을 만들어 전달합니다.
//!
//! 고객 이름·전화번호·금액·입력한 글자는 화면 쪽(`src/utils/usage.ts`)에서 걸러서 보냅니다.

use std::fs::{self, File, OpenOptions};
use std::io::{self, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use chrono::{Local, NaiveDate};
use flate2::Compression;
use flate2::write::GzEncoder;
use serde_json::Value;
use zip::CompressionMethod;
use zip::write::SimpleFileOptions;

pub const USAGE_DIR: &str = "usage";
const PREFIX: &str = "usage-";
const PLAIN_EXT: &str = ".jsonl";
const GZ_EXT: &str = ".jsonl.gz";

/// 사용 기록 전체 크기 상한. 넘으면 오래된 날부터 지웁니다.
/// (지난 날짜 파일은 압축해 두므로 하루 수십 KB 정도라 수년치가 들어갑니다)
const MAX_TOTAL_BYTES: u64 = 500 * 1024 * 1024;
/// 한 번에 받는 기록 수 / 기록 하나의 크기 상한 (화면 코드가 잘못돼도 디스크를 채우지 않도록)
const MAX_EVENTS_PER_CALL: usize = 500;
const MAX_EVENT_BYTES: usize = 4 * 1024;

pub struct UsageLog {
    dir: PathBuf,
    lock: Mutex<()>,
}

impl UsageLog {
    pub fn new(log_dir: &Path) -> Self {
        Self {
            dir: log_dir.join(USAGE_DIR),
            lock: Mutex::new(()),
        }
    }

    /// 오늘 파일 끝에 기록을 덧붙입니다. 너무 큰 기록은 버립니다.
    pub fn append(&self, events: &[Value]) -> io::Result<()> {
        self.append_on(Local::now().date_naive(), events)
    }

    fn append_on(&self, date: NaiveDate, events: &[Value]) -> io::Result<()> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        fs::create_dir_all(&self.dir)?;
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.dir.join(plain_name(date)))?;
        let mut out = BufWriter::new(file);
        for event in events.iter().take(MAX_EVENTS_PER_CALL) {
            let line = serde_json::to_string(event)?;
            if line.len() <= MAX_EVENT_BYTES {
                out.write_all(line.as_bytes())?;
                out.write_all(b"\n")?;
            }
        }
        out.flush()
    }

    /// 지난 날짜 파일을 압축하고, 상한을 넘으면 오래된 날부터 지웁니다. (시작할 때 한 번)
    pub fn maintain(&self) -> io::Result<()> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        maintain_dir(&self.dir, Local::now().date_naive(), MAX_TOTAL_BYTES)
    }
}

fn plain_name(date: NaiveDate) -> String {
    format!("{PREFIX}{}{PLAIN_EXT}", date.format("%Y-%m-%d"))
}

/// 파일 이름에서 날짜와 압축 여부를 읽습니다. 사용 기록 파일이 아니면 None.
fn parse_name(name: &str) -> Option<(NaiveDate, bool)> {
    let rest = name.strip_prefix(PREFIX)?;
    let (date, gz) = if let Some(d) = rest.strip_suffix(GZ_EXT) {
        (d, true)
    } else {
        (rest.strip_suffix(PLAIN_EXT)?, false)
    };
    let date = NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()?;
    Some((date, gz))
}

fn gzip_file(src: &Path, dest: &Path) -> io::Result<()> {
    let tmp = dest.with_extension("gz.tmp");
    {
        let mut input = File::open(src)?;
        let mut encoder = GzEncoder::new(File::create(&tmp)?, Compression::best());
        io::copy(&mut input, &mut encoder)?;
        encoder.finish()?.sync_all()?;
    }
    fs::rename(&tmp, dest)?;
    fs::remove_file(src)
}

fn maintain_dir(dir: &Path, today: NaiveDate, max_total: u64) -> io::Result<()> {
    if !dir.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        // 압축하다 끊긴 임시 파일
        if name.ends_with(".gz.tmp") {
            let _ = fs::remove_file(&path);
            continue;
        }
        if let Some((date, false)) = parse_name(name)
            && date < today
        {
            let dest = dir.join(format!("{PREFIX}{}{GZ_EXT}", date.format("%Y-%m-%d")));
            if let Err(e) = gzip_file(&path, &dest) {
                log::warn!("사용 기록을 압축하지 못했습니다 ({name}): {e}");
            }
        }
    }

    let mut files: Vec<(NaiveDate, PathBuf, u64)> = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name();
        if let Some((date, _)) = name.to_str().and_then(parse_name) {
            files.push((date, entry.path(), entry.metadata()?.len()));
        }
    }
    files.sort();
    let mut total: u64 = files.iter().map(|(_, _, len)| len).sum();
    // 오늘 파일은 남겨 둡니다
    for (date, path, len) in &files {
        if total <= max_total || *date >= today {
            break;
        }
        fs::remove_file(path)?;
        total -= len;
    }
    Ok(())
}

/// 로그 폴더(오류 로그 + 사용 기록)를 zip 파일 하나로 묶습니다.
pub fn export_zip(log_dir: &Path, dest: &Path) -> io::Result<()> {
    let tmp = dest.with_extension("zip.tmp");
    let result = write_zip(log_dir, dest, &tmp).and_then(|()| fs::rename(&tmp, dest));
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

fn write_zip(log_dir: &Path, dest: &Path, tmp: &Path) -> io::Result<()> {
    let mut zip = zip::ZipWriter::new(File::create(tmp)?);
    let mut entries = Vec::new();
    collect_files(log_dir, Path::new(""), &mut entries)?;
    entries.sort();
    for (rel, path) in entries {
        // 로그 폴더 안에 저장하는 경우 자기 자신은 넣지 않음
        if path == dest || path == tmp {
            continue;
        }
        let method = if rel.ends_with(".gz") {
            CompressionMethod::Stored
        } else {
            CompressionMethod::Deflated
        };
        zip.start_file(rel, SimpleFileOptions::default().compression_method(method))?;
        io::copy(&mut File::open(&path)?, &mut zip)?;
    }
    zip.finish()?.sync_all()
}

fn collect_files(dir: &Path, rel: &Path, out: &mut Vec<(String, PathBuf)>) -> io::Result<()> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let rel = rel.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            collect_files(&path, &rel, out)?;
        } else {
            // zip 안의 경로는 OS와 관계없이 '/'로 구분
            let name = rel
                .components()
                .map(|c| c.as_os_str().to_string_lossy())
                .collect::<Vec<_>>()
                .join("/");
            out.push((name, path));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::Read;

    fn date(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    fn names(dir: &Path) -> Vec<String> {
        let mut v: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        v.sort();
        v
    }

    #[test]
    fn parses_only_usage_files() {
        assert_eq!(
            parse_name("usage-2026-10-24.jsonl"),
            Some((date("2026-10-24"), false))
        );
        assert_eq!(
            parse_name("usage-2026-10-24.jsonl.gz"),
            Some((date("2026-10-24"), true))
        );
        assert_eq!(parse_name("usage-2026-13-01.jsonl"), None);
        assert_eq!(parse_name("daolly.log"), None);
    }

    #[test]
    fn appends_lines_and_drops_oversized_events() {
        let tmp = tempfile::tempdir().unwrap();
        let log = UsageLog::new(tmp.path());
        let day = date("2026-10-24");
        log.append_on(
            day,
            &[json!({"e": "a"}), json!({"e": "x".repeat(MAX_EVENT_BYTES)})],
        )
        .unwrap();
        log.append_on(day, &[json!({"e": "b"})]).unwrap();

        let text = fs::read_to_string(tmp.path().join(USAGE_DIR).join(plain_name(day))).unwrap();
        assert_eq!(text, "{\"e\":\"a\"}\n{\"e\":\"b\"}\n");
    }

    #[test]
    fn compresses_past_days_and_prunes_oldest() {
        let tmp = tempfile::tempdir().unwrap();
        let log = UsageLog::new(tmp.path());
        let big = json!({"e": "y".repeat(3000)});
        for d in ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-24"] {
            log.append_on(date(d), &vec![big.clone(); 50]).unwrap();
        }
        let dir = tmp.path().join(USAGE_DIR);
        fs::write(dir.join("usage-2026-10-19.jsonl.gz.tmp"), b"partial").unwrap();

        maintain_dir(&dir, date("2026-10-24"), u64::MAX).unwrap();
        assert_eq!(
            names(&dir),
            [
                "usage-2026-10-20.jsonl.gz",
                "usage-2026-10-21.jsonl.gz",
                "usage-2026-10-22.jsonl.gz",
                "usage-2026-10-24.jsonl",
            ]
        );

        // 압축한 내용이 원래와 같은지
        let mut text = String::new();
        flate2::read::GzDecoder::new(File::open(dir.join("usage-2026-10-20.jsonl.gz")).unwrap())
            .read_to_string(&mut text)
            .unwrap();
        assert_eq!(text.lines().count(), 50);

        // 상한을 넘으면 오래된 날부터 지우되 오늘 파일은 남김
        let today_len = fs::metadata(dir.join("usage-2026-10-24.jsonl"))
            .unwrap()
            .len();
        maintain_dir(&dir, date("2026-10-24"), today_len + 1).unwrap();
        assert_eq!(names(&dir), ["usage-2026-10-24.jsonl"]);
        maintain_dir(&dir, date("2026-10-24"), 0).unwrap();
        assert_eq!(names(&dir), ["usage-2026-10-24.jsonl"]);
    }

    #[test]
    fn export_bundles_logs_and_usage() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("daolly.log"), "시작").unwrap();
        UsageLog::new(tmp.path())
            .append_on(date("2026-10-24"), &[json!({"e": "screen"})])
            .unwrap();

        // 로그 폴더 안에 저장해도 자기 자신은 넣지 않음
        let dest = tmp.path().join("기록.zip");
        export_zip(tmp.path(), &dest).unwrap();

        let mut zip = zip::ZipArchive::new(File::open(&dest).unwrap()).unwrap();
        let mut entries: Vec<String> = zip.file_names().map(|n| n.unwrap().into_owned()).collect();
        entries.sort();
        assert_eq!(entries, ["daolly.log", "usage/usage-2026-10-24.jsonl"]);
        let mut text = String::new();
        zip.by_name("usage/usage-2026-10-24.jsonl")
            .unwrap()
            .read_to_string(&mut text)
            .unwrap();
        assert_eq!(text, "{\"e\":\"screen\"}\n");
        assert!(!tmp.path().join("기록.zip.tmp").exists());
    }
}
