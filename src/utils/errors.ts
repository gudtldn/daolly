/** 커맨드 에러 (Rust `AppError`): message는 화면에 그대로 보여줄 문장, detail은 개발자용 원문 */
export interface AppError {
  code: "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "BUSY" | "DATABASE" | "FILE";
  message: string;
  detail?: string;
}

export function isAppError(e: unknown): e is AppError {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as AppError).code === "string" &&
    typeof (e as AppError).message === "string"
  );
}

/** 사용자에게 보여 줄 수 있는 문장인지 (영문 원문이 아닌 한국어 문장) */
const HANGUL = /[가-힣]/;

const UNEXPECTED = "프로그램 안에서 예상하지 못한 오류가 생겼습니다. 계속되면 프로그램을 다시 시작해 주세요.";

/** 화면에 보여줄 오류 문장. 영문 원문은 보여주지 않고 errorDetail로 넘깁니다. */
export function errorMessage(e: unknown): string {
  if (isAppError(e)) return e.message;
  const raw = rawText(e);
  if (raw && HANGUL.test(raw)) return raw;
  return UNEXPECTED;
}

/** '자세한 내용 (개발자용)'에 보여줄 원문. 없으면 undefined */
export function errorDetail(e: unknown): string | undefined {
  if (isAppError(e)) return e.detail ? `[${e.code}] ${e.detail}` : undefined;
  if (e instanceof Error) return e.stack ?? e.message;
  const raw = rawText(e);
  if (raw !== undefined) return HANGUL.test(raw) ? undefined : raw;
  if (e === undefined || e === null) return undefined;
  return safeJson(e);
}

/** 재시작(복원, 업데이트 설치) 때문에 앱과의 연결이 끊긴 것인지. 이 경우는 오류로 보여주지 않음 */
export function isRestartDisconnect(e: unknown): boolean {
  const raw = isAppError(e) ? e.message : (rawText(e) ?? "");
  return raw.includes("Could not connect") || raw.includes("Disconnected");
}

function rawText(e: unknown): string | undefined {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return undefined;
}

function safeJson(e: unknown): string {
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
