// 앱 업데이트 상태 (src-tauri/src/updater.rs와 1:1 매핑)

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "upToDate" }
  | { state: "downloading"; version: string; progress: number | null }
  /** 다운로드 완료. 프로그램을 끌 때 설치됨 */
  | { state: "ready"; version: string; notes: string | null }
  | { state: "failed"; message: string };
