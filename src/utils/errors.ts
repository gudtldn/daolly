/** 커맨드 에러 (Rust `AppError`): message는 화면에 그대로 보여줄 문장 */
export interface AppError {
  code: "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "BUSY" | "DATABASE";
  message: string;
}

export function isAppError(e: unknown): e is AppError {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as AppError).code === "string" &&
    typeof (e as AppError).message === "string"
  );
}

/** 화면에 보여줄 오류 문장 */
export function errorMessage(e: unknown): string {
  if (isAppError(e)) return e.message;
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "알 수 없는 오류가 발생했습니다.";
}
