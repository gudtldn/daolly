// 앱 업데이트 상태 (src-tauri/src/updater.rs와 1:1 매핑)

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "upToDate" }
  | { state: "downloading"; version: string; progress: number | null }
  /** 다운로드 완료. 프로그램을 끌 때 설치됨 */
  | { state: "ready"; version: string; notes: string | null }
  /** message: 왜 안 됐는지(사용자용), detail: 오류 원문(개발자용) */
  | { state: "failed"; message: string; detail?: string };
