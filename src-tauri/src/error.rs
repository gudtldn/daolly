//! 커맨드 공통 에러
//!
//! 화면에는 `{ code, message, detail }`로 전달합니다. `message`는 화면에 그대로 보여줄
//! 한국어 문장으로, 무엇이 안 됐고 왜 그런지(짐작되는 원인)와 어떻게 하면 되는지를 담습니다.
//! `detail`은 오류 원문(영문 DB 오류, 파일 오류 등)으로 화면의 '자세한 내용 (개발자용)'에만
//! 보이고, 같은 내용이 로그 파일에도 남습니다. `code`는 화면이 경우를 나눠 처리할 때 씁니다.

use std::fmt::Display;

use sea_orm::{DbErr, SqlErr};
use serde::Serialize;

use crate::backup::BackupError;

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
    /// 파일·폴더 작업 실패 (백업, 내보내기 등)
    File,
}

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// DB 오류
    #[error(transparent)]
    Db(#[from] DbErr),

    /// 대상 없음. 값은 대상 이름 ("고객", "접수" 등)
    #[error("{0} 정보를 찾을 수 없습니다. 다른 화면에서 이미 지웠을 수 있습니다.")]
    NotFound(&'static str),

    /// 입력 검증 실패. 값은 화면에 보여줄 문장
    #[error("{0}")]
    Validation(String),

    /// 파일·폴더 작업 실패. `message`는 화면용 문장, `detail`은 오류 원문
    #[error("{message}")]
    File { message: String, detail: String },
}

impl AppError {
    /// 파일·폴더 작업 실패. `message`에는 무엇이 안 됐는지와 짐작되는 원인을 씁니다.
    pub fn file(message: impl Into<String>, detail: impl Display) -> Self {
        AppError::File {
            message: message.into(),
            detail: detail.to_string(),
        }
    }

    /// 파일 오류의 원인을 붙여 `"{what} {원인}"` 문장으로 만듭니다.
    pub fn io(what: &str, e: &std::io::Error) -> Self {
        AppError::file(format!("{what} {}", io_reason(e)), e)
    }

    pub fn code(&self) -> ErrorCode {
        match self {
            AppError::Db(e) => db_error_code(e),
            AppError::NotFound(_) => ErrorCode::NotFound,
            AppError::Validation(_) => ErrorCode::Validation,
            AppError::File { .. } => ErrorCode::File,
        }
    }

    /// 화면에 보여줄 문장
    pub fn message(&self) -> String {
        let AppError::Db(e) = self else {
            return self.to_string();
        };
        match db_error_code(e) {
            ErrorCode::NotFound => {
                "찾는 정보가 없습니다. 다른 화면에서 이미 지웠을 수 있으니 목록을 다시 확인해 주세요."
            }
            ErrorCode::Conflict => {
                "저장하지 못했습니다. 같은 내용이 이미 있거나 연결된 정보가 그사이 바뀌었습니다. 화면을 다시 열고 시도해 주세요."
            }
            ErrorCode::Busy => {
                "자동 백업 같은 다른 작업이 데이터를 쓰고 있어 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."
            }
            _ => "데이터 파일을 읽거나 쓰지 못했습니다. 계속되면 프로그램을 다시 시작해 주세요.",
        }
        .to_owned()
    }

    /// 개발자용 오류 원문 (화면의 '자세한 내용'에 표시)
    pub fn detail(&self) -> Option<String> {
        match self {
            AppError::Db(e) => Some(e.to_string()),
            AppError::File { detail, .. } => Some(detail.clone()),
            AppError::NotFound(_) | AppError::Validation(_) => None,
        }
    }
}

/// 파일 오류를 사용자가 이해할 수 있는 원인 문장으로 바꿉니다.
pub fn io_reason(e: &std::io::Error) -> &'static str {
    use std::io::ErrorKind;
    // Windows: 32 = 다른 프로세스가 사용 중, 33 = 다른 프로세스가 일부를 잠금
    if matches!(e.raw_os_error(), Some(32 | 33)) {
        return "다른 프로그램(백신, 탐색기 미리 보기 등)이 파일을 쓰고 있습니다. 잠시 후 다시 시도해 주세요.";
    }
    match e.kind() {
        ErrorKind::NotFound => "파일이나 폴더가 없습니다. 옮겨졌거나 지워졌을 수 있습니다.",
        ErrorKind::PermissionDenied => {
            "접근 권한이 없거나, 다른 프로그램이 파일을 쓰고 있습니다. 잠시 후 다시 시도해 주세요."
        }
        ErrorKind::StorageFull => "디스크 공간이 부족합니다. 공간을 비운 뒤 다시 시도해 주세요.",
        ErrorKind::ReadOnlyFilesystem => "읽기 전용 위치라 쓸 수 없습니다.",
        _ => "예상하지 못한 파일 오류입니다.",
    }
}

impl From<BackupError> for AppError {
    fn from(e: BackupError) -> Self {
        let message = match &e {
            BackupError::Io(io) => format!("백업 파일을 다루지 못했습니다. {}", io_reason(io)),
            BackupError::Snapshot(_) => {
                "백업 파일을 만들지 못했습니다. 디스크 공간이 부족하거나 데이터 파일을 읽지 못했을 수 있습니다."
                    .to_owned()
            }
            BackupError::InvalidName | BackupError::NotFound => {
                "선택한 백업 파일이 없습니다. 다른 곳으로 옮겨졌거나 지워졌을 수 있습니다.".to_owned()
            }
            BackupError::Corrupted => {
                "이 백업 파일은 손상되어 열 수 없습니다. 다른 백업을 선택해 주세요.".to_owned()
            }
            BackupError::NotDaollyBackup => {
                "다올리에서 만든 백업 파일이 아니라 복원할 수 없습니다.".to_owned()
            }
            BackupError::NewerVersion => {
                "더 새로운 버전의 다올리에서 만든 백업이라 지금 버전으로는 열 수 없습니다. 프로그램을 먼저 업데이트해 주세요."
                    .to_owned()
            }
            BackupError::MirrorUnavailable(_) => {
                "추가 백업 폴더에 쓸 수 없습니다. USB나 네트워크 드라이브가 빠졌거나 폴더가 바뀌었을 수 있습니다."
                    .to_owned()
            }
        };
        AppError::file(message, &e)
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
        // 원문은 화면의 '자세한 내용'에만 보이므로 로그에도 남김 (나중에 원인을 찾을 수 있게)
        if let Some(detail) = self.detail() {
            log::error!("{}: {detail}", self.message());
        }

        #[derive(Serialize)]
        struct Payload {
            code: ErrorCode,
            message: String,
            #[serde(skip_serializing_if = "Option::is_none")]
            detail: Option<String>,
        }
        Payload {
            code: self.code(),
            message: self.message(),
            detail: self.detail(),
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
                "message": "고객 정보를 찾을 수 없습니다. 다른 화면에서 이미 지웠을 수 있습니다."
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
        // 원문은 개발자용 detail로만
        assert_eq!(e.detail().as_deref(), Some("Custom Error: boom"));
    }

    /// 파일 오류는 원인을 문장으로 풀고, 원문은 detail로
    #[test]
    fn file_errors_explain_cause_and_keep_detail() {
        let io = std::io::Error::from(std::io::ErrorKind::NotFound);
        let e = AppError::io("파일을 읽지 못했습니다.", &io);
        assert_eq!(e.code(), ErrorCode::File);
        assert!(
            e.message()
                .starts_with("파일을 읽지 못했습니다. 파일이나 폴더가 없습니다.")
        );
        assert!(e.detail().is_some());

        let busy = std::io::Error::from_raw_os_error(32);
        assert!(io_reason(&busy).contains("다른 프로그램"));

        let e = AppError::from(BackupError::Corrupted);
        assert_eq!(e.code(), ErrorCode::File);
        assert!(e.message().contains("손상"));
        let json = serde_json::to_value(&e).unwrap();
        assert!(json.get("detail").is_some());
        // 검증 오류에는 detail이 없음
        let json = serde_json::to_value(AppError::Validation("x".into())).unwrap();
        assert!(json.get("detail").is_none());
    }
}
