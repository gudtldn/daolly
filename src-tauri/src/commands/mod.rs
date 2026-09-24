//! Tauri 커맨드 진입점
//! 프론트엔드의 `invoke()` 호출을 받아 Services 레이어에 위임합니다.
//! DTO 정의, 존재 확인(NotFound), 에러 변환만 담당합니다.

pub mod categories;
pub mod customers;
pub mod database;
pub mod orders;
pub mod payments;
pub mod price_items;
pub mod price_settings;
pub mod sales;
pub mod updates;
pub mod work_items;

pub use crate::error::AppError;

pub type CmdResult<T> = Result<T, AppError>;

/// 빈 문자열 검증 helper
pub fn require_non_empty(value: &str, field: &str) -> Result<(), AppError> {
    if value.trim().is_empty() {
        Err(AppError::Validation(format!(
            "{field}은(는) 비워둘 수 없습니다"
        )))
    } else {
        Ok(())
    }
}

/// 양수 검증 helper (0 이하 방지)
pub fn require_positive(value: i64, field: &str) -> Result<(), AppError> {
    if value <= 0 {
        Err(AppError::Validation(format!(
            "{field}은(는) 0보다 커야 합니다"
        )))
    } else {
        Ok(())
    }
}

/// 화면에서 받은 시각을 저장 형식(UTC)으로 정규화합니다. None은 그대로 둡니다.
/// 타임존이 없는 값은 어느 시각인지 알 수 없으므로 거부합니다.
pub fn normalize_time(value: Option<String>, field: &str) -> Result<Option<String>, AppError> {
    value
        .map(|v| {
            crate::timestamp::normalize_input(&v)
                .map_err(|_| AppError::Validation(format!("{field} 형식이 올바르지 않습니다: {v}")))
        })
        .transpose()
}

/// 음수 방지 helper (0 허용)
pub fn require_non_negative(value: i64, field: &str) -> Result<(), AppError> {
    if value < 0 {
        Err(AppError::Validation(format!(
            "{field}은(는) 0 이상이어야 합니다"
        )))
    } else {
        Ok(())
    }
}
