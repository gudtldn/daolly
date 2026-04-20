//! Tauri 커맨드 진입점
//! 프론트엔드의 `invoke()` 호출을 받아 Services 레이어에 위임합니다.
//! DTO 정의, 존재 확인(NotFound), 에러 변환만 담당합니다.

pub mod categories;
pub mod customers;
pub mod payments;
pub mod price_items;
pub mod work_items;

use serde::Serialize;

/// Tauri 커맨드 공통 에러 타입
/// 프론트엔드에는 문자열로 전달합니다.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// DB 에러
    #[error("{0}")]
    Db(#[from] sea_orm::DbErr),

    /// 리소스 없음
    #[error("not found: {0}")]
    NotFound(String),
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type CmdResult<T> = Result<T, AppError>;
