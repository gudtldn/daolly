//! 시각 표현 규칙
//!
//! DB에는 모든 시각을 UTC `YYYY-MM-DDTHH:MM:SS.mmmZ` 한 가지 형식으로 저장합니다.
//! 형식이 고정되어 있어 문자열 비교 결과가 시간 순서와 같으므로 기간 조회를 TEXT 비교와
//! 인덱스로 처리할 수 있습니다.
//!
//! 예전에는 UTC(`+00:00`), 타임존 없는 현지 시각, 레거시 자정 값이 섞여 저장되어
//! 일별 매출이 틀리게 집계되었습니다. 날짜 경계(오늘/어제 등)는 이 모듈에서만 계산합니다.

use chrono::{DateTime, Duration, NaiveDate, NaiveDateTime, SecondsFormat, TimeZone, Utc};

#[derive(Debug, thiserror::Error)]
#[error("시각 형식이 올바르지 않습니다: {0}")]
pub struct InvalidTimestamp(pub String);

/// 저장 형식으로 변환
pub fn format(dt: DateTime<Utc>) -> String {
    dt.to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// 현재 시각 (저장 형식)
pub fn now() -> String {
    format(Utc::now())
}

/// 화면에서 받은 시각을 저장 형식으로 바꿉니다.
/// 타임존이 없는 값은 어느 시각인지 알 수 없으므로 거부합니다.
pub fn normalize_input(value: &str) -> Result<String, InvalidTimestamp> {
    DateTime::parse_from_rfc3339(value.trim())
        .map(|dt| format(dt.with_timezone(&Utc)))
        .map_err(|_| InvalidTimestamp(value.to_owned()))
}

/// 이전 데이터 정규화용: 타임존이 있으면 그대로 변환하고, 없으면 `tz` 현지 시각으로 해석합니다.
/// 해석할 수 없으면 None.
pub fn normalize_legacy<Tz: TimeZone>(value: &str, tz: &Tz) -> Option<String> {
    let value = value.trim();
    if let Ok(dt) = DateTime::parse_from_rfc3339(value) {
        return Some(format(dt.with_timezone(&Utc)));
    }
    for fmt in [
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%dT%H:%M",
    ] {
        if let Ok(naive) = NaiveDateTime::parse_from_str(value, fmt) {
            return local_to_utc(naive, tz).map(format);
        }
    }
    let date = NaiveDate::parse_from_str(value, "%Y-%m-%d").ok()?;
    local_to_utc(date.and_hms_opt(0, 0, 0)?, tz).map(format)
}

/// 가게 날짜 구간 `[from, to]`(양끝 포함)를 저장 형식의 반개구간 `[start, end)`로 바꿉니다.
/// 한쪽이 None이면 그쪽 경계는 없습니다.
pub fn day_bounds<Tz: TimeZone>(
    from: Option<NaiveDate>,
    to: Option<NaiveDate>,
    tz: &Tz,
) -> (Option<String>, Option<String>) {
    let start = from.and_then(|d| start_of_day(d, tz));
    let end = to.and_then(|d| start_of_day(d + Duration::days(1), tz));
    (start, end)
}

/// 저장된 시각의 가게 날짜
pub fn local_date<Tz: TimeZone>(stored: &str, tz: &Tz) -> Option<NaiveDate> {
    DateTime::parse_from_rfc3339(stored)
        .ok()
        .map(|dt| dt.with_timezone(tz).date_naive())
}

/// 오늘의 가게 날짜
pub fn today<Tz: TimeZone>(tz: &Tz) -> NaiveDate {
    Utc::now().with_timezone(tz).date_naive()
}

fn start_of_day<Tz: TimeZone>(date: NaiveDate, tz: &Tz) -> Option<String> {
    local_to_utc(date.and_hms_opt(0, 0, 0)?, tz).map(format)
}

fn local_to_utc<Tz: TimeZone>(naive: NaiveDateTime, tz: &Tz) -> Option<DateTime<Utc>> {
    tz.from_local_datetime(&naive)
        .earliest()
        // 서머타임으로 없는 시각이면 1시간 뒤로 (한국은 해당 없음)
        .or_else(|| {
            tz.from_local_datetime(&(naive + Duration::hours(1)))
                .earliest()
        })
        .map(|dt| dt.with_timezone(&Utc))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::FixedOffset;

    fn kst() -> FixedOffset {
        FixedOffset::east_opt(9 * 3600).unwrap()
    }

    #[test]
    fn stored_format_is_fixed_width_utc() {
        let dt = Utc.with_ymd_and_hms(2026, 9, 24, 11, 0, 0).unwrap();
        assert_eq!(format(dt), "2026-09-24T11:00:00.000Z");
        assert_eq!(now().len(), "2026-09-24T11:00:00.000Z".len());
    }

    #[test]
    fn normalize_input_requires_timezone() {
        assert_eq!(
            normalize_input("2026-09-24T20:00:00+09:00").unwrap(),
            "2026-09-24T11:00:00.000Z"
        );
        assert_eq!(
            normalize_input("2026-09-24T11:00:00.123456Z").unwrap(),
            "2026-09-24T11:00:00.123Z"
        );
        assert!(normalize_input("2026-09-24T20:00:00").is_err());
        assert!(normalize_input("2026-09-24").is_err());
        assert!(normalize_input("").is_err());
    }

    #[test]
    fn normalize_legacy_handles_all_stored_variants() {
        let tz = kst();
        // 서버가 저장하던 UTC (자릿수 제각각)
        assert_eq!(
            normalize_legacy("2026-09-23T23:00:00.123456789+00:00", &tz).unwrap(),
            "2026-09-23T23:00:00.123Z"
        );
        // 화면이 보내던 타임존 없는 현지 시각
        assert_eq!(
            normalize_legacy("2026-09-23T23:00:00", &tz).unwrap(),
            "2026-09-23T14:00:00.000Z"
        );
        // 레거시 이관 자정 값 / 날짜만
        assert_eq!(
            normalize_legacy("2024-01-01T00:00:00", &tz).unwrap(),
            "2023-12-31T15:00:00.000Z"
        );
        assert_eq!(
            normalize_legacy("2024-01-01", &tz).unwrap(),
            "2023-12-31T15:00:00.000Z"
        );
        assert_eq!(normalize_legacy("x", &tz), None);
        // 이미 정규화된 값은 그대로
        let canonical = "2026-09-24T11:00:00.000Z";
        assert_eq!(normalize_legacy(canonical, &tz).unwrap(), canonical);
    }

    #[test]
    fn day_bounds_use_local_midnight() {
        let d = NaiveDate::from_ymd_opt(2026, 9, 24).unwrap();
        let (start, end) = day_bounds(Some(d), Some(d), &kst());
        assert_eq!(start.unwrap(), "2026-09-23T15:00:00.000Z");
        assert_eq!(end.unwrap(), "2026-09-24T15:00:00.000Z");
        assert_eq!(day_bounds(None, None, &kst()), (None, None));
    }

    #[test]
    fn local_date_of_stored_value() {
        assert_eq!(
            local_date("2026-09-23T23:00:00.000Z", &kst()),
            NaiveDate::from_ymd_opt(2026, 9, 24)
        );
    }
}
