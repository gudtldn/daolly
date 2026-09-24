// 백업/복원 관련 타입 (src-tauri/src/backup.rs, startup.rs와 1:1 매핑)

export type BackupKind =
  | "manual"
  | "daily"
  | "preMigration"
  | "preRestore"
  | "preClear"
  | "preImport"
  | "legacy";

export interface BackupInfo {
  filename: string;
  /** "YYYY.MM.DD HH:MM:SS" (파일명에서 읽을 수 없으면 "알 수 없음") */
  createdAt: string;
  sizeBytes: number;
  kind: BackupKind;
}

/** 추가 백업 폴더 복사 결과 */
export interface MirrorStatus {
  /** "YYYY.MM.DD HH:MM:SS" */
  at: string;
  ok: boolean;
  message: string | null;
}

export interface BackupOutcome {
  info: BackupInfo;
  /** 추가 백업 폴더가 지정되지 않았으면 null */
  mirror: MirrorStatus | null;
}

export interface BackupSettings {
  mirrorDir: string | null;
  lastMirror: MirrorStatus | null;
}

/** 기동 중 발생한 알림 */
export type StartupNotice =
  | { type: "restoreApplied" }
  | { type: "restoreFailed"; reason: string };

/** 기동 결과. failed이면 DB를 열지 못해 복구 화면을 보여줍니다. */
export type StartupStatus =
  | { state: "ready" }
  | { state: "failed"; message: string };
