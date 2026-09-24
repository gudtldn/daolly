import { error as logError } from "@tauri-apps/plugin-log";

// Tauri 환경 여부 확인 (테스트/브라우저에서는 로그 플러그인을 쓸 수 없음)
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function describe(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}\n${reason.stack ?? ""}`;
  if (typeof reason === "string") return reason;
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

/** 화면 쪽 오류를 앱 로그 파일에 남깁니다. (원격으로 문제를 파악하기 위함) */
export function reportError(context: string, reason: unknown): void {
  console.error(`[${context}]`, reason);
  if (!isTauri) return;
  void logError(`[${context}] ${describe(reason)}`).catch(() => {});
}

/** 처리되지 않은 오류/Promise 거부를 로그 파일에 남기도록 전역 핸들러를 등록합니다. */
export function installGlobalErrorLogging(): void {
  if (!isTauri) return;
  window.addEventListener("error", (event) => {
    reportError("window.error", event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportError("unhandledrejection", event.reason);
  });
}
