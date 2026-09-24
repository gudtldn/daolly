//! 커맨드 공통 에러
//!
//! 화면에는 `{ code, message }`로 전달합니다. `message`는 화면에 그대로 보여줄 한국어
//! 문장이고, `code`는 화면이 경우를 나눠 처리할 때 씁니다. DB 오류 원문(영문)은 화면에
//! 보여주지 않고 로그 파일에 남깁니다.

use sea_orm::{DbErr, SqlErr};
use serde::Serialize;

/// 화면이 구분하는 에러 종류
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    /// 입력값이 규칙에 맞지 않음
    Validation,
    /// 대상이 없음 (이미 삭제되었을 수 있음)
    NotFound,
    /// 다른 데이터와 충돌 (중복, 연결된 데이터가 바뀜)
    Conflict,
    /// DB가 다른 작업으로 잠겨 있음
    Busy,
    /// 그 밖의 DB 오류
    Database,
}

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// DB 오류
    #[error(transparent)]
    Db(#[from] DbErr),

    /// 대상 없음. 값은 대상 이름 ("고객", "접수" 등)
    #[error("{0} 정보를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.")]
    NotFound(&'static str),

    /// 입력 검증 실패. 값은 화면에 보여줄 문장
    #[error("{0}")]
    Validation(String),
}

impl AppError {
    pub fn code(&self) -> ErrorCode {
        match self {
            AppError::Db(e) => db_error_code(e),
            AppError::NotFound(_) => ErrorCode::NotFound,
            AppError::Validation(_) => ErrorCode::Validation,
        }
    }

    /// 화면에 보여줄 문장
    pub fn message(&self) -> String {
        let AppError::Db(e) = self else {
            return self.to_string();
        };
        match db_error_code(e) {
            ErrorCode::NotFound => "요청한 정보를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.",
            ErrorCode::Conflict => {
                "다른 데이터와 맞지 않아 저장하지 못했습니다. 화면을 새로 고친 뒤 다시 시도해 주세요."
            }
            ErrorCode::Busy => "다른 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.",
            _ => "처리 중 오류가 발생했습니다. 다시 시도해 주시고, 계속되면 프로그램을 다시 켜 주세요.",
        }
        .to_owned()
    }
}

fn db_error_code(e: &DbErr) -> ErrorCode {
    if matches!(e, DbErr::RecordNotFound(_)) {
        return ErrorCode::NotFound;
    }
    match e.sql_err() {
        Some(SqlErr::UniqueConstraintViolation(_) | SqlErr::ForeignKeyConstraintViolation(_)) => {
            ErrorCode::Conflict
        }
        _ if e.to_string().contains("database is locked") => ErrorCode::Busy,
        _ => ErrorCode::Database,
    }
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        // 화면에는 번역한 문장만 가므로 DB 오류 원문은 여기서 로그로 남김
        if let AppError::Db(e) = self {
            log::error!("DB 오류: {e}");
        }

        #[derive(Serialize)]
        struct Payload {
            code: ErrorCode,
            message: String,
        }
        Payload {
            code: self.code(),
            message: self.message(),
        }
        .serialize(serializer)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::setup_test_db;
    use sea_orm::ConnectionTrait;
    use serde_json::json;

    #[test]
    fn serializes_code_and_korean_message() {
        let e = AppError::Validation("수량은 1 이상이어야 합니다".into());
        assert_eq!(
            serde_json::to_value(&e).unwrap(),
            json!({ "code": "VALIDATION", "message": "수량은 1 이상이어야 합니다" })
        );

        let e = AppError::NotFound("고객");
        assert_eq!(
            serde_json::to_value(&e).unwrap(),
            json!({
                "code": "NOT_FOUND",
                "message": "고객 정보를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다."
            })
        );
    }

    /// DB 오류는 영문 원문 대신 종류에 맞는 한국어 문장으로 전달
    #[tokio::test]
    async fn db_errors_are_classified() {
        let db = setup_test_db().await.unwrap();
        let fk = db
            .execute_unprepared(
                "INSERT INTO work_items (customer_id, status, price, paid_amount, received_at, created_at, last_modified_at)
                 VALUES (999, 'Received', 0, 0, 'x', 'x', 'x')",
            )
            .await
            .unwrap_err();
        let e = AppError::from(fk);
        assert_eq!(e.code(), ErrorCode::Conflict);
        assert!(!e.message().contains("FOREIGN KEY"));

        let e = AppError::from(DbErr::RecordNotFound("payment 3".into()));
        assert_eq!(e.code(), ErrorCode::NotFound);

        let e = AppError::from(DbErr::Custom("boom".into()));
        assert_eq!(e.code(), ErrorCode::Database);
        assert!(!e.message().contains("boom"));
    }
}
