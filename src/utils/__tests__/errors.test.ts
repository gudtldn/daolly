import { describe, it, expect } from "vitest";
import { errorMessage, isAppError } from "@/utils/errors";

describe("errorMessage", () => {
  it("커맨드 에러는 message를 그대로 보여준다", () => {
    const e = { code: "VALIDATION", message: "'와이셔츠'의 수량은 1 이상이어야 합니다." };
    expect(isAppError(e)).toBe(true);
    expect(errorMessage(e)).toBe("'와이셔츠'의 수량은 1 이상이어야 합니다.");
  });

  it("Error, 문자열, 그 밖의 값도 문장으로 바꾼다", () => {
    expect(errorMessage(new Error("백업 폴더에 쓸 수 없습니다"))).toBe("백업 폴더에 쓸 수 없습니다");
    expect(errorMessage("복원할 백업 파일이 없습니다")).toBe("복원할 백업 파일이 없습니다");
    expect(errorMessage({ foo: 1 })).toBe("알 수 없는 오류가 발생했습니다.");
    expect(isAppError(null)).toBe(false);
  });
});
