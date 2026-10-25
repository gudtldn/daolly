import { describe, it, expect } from "vitest";
import { errorDetail, errorMessage, isAppError, isRestartDisconnect } from "@/utils/errors";

describe("errorMessage", () => {
  it("커맨드 에러는 message를 그대로 보여준다", () => {
    const e = { code: "VALIDATION", message: "'와이셔츠'의 수량은 1 이상이어야 합니다." };
    expect(isAppError(e)).toBe(true);
    expect(errorMessage(e)).toBe("'와이셔츠'의 수량은 1 이상이어야 합니다.");
  });

  it("한국어 문장인 Error와 문자열은 그대로 보여준다", () => {
    expect(errorMessage(new Error("백업 폴더에 쓸 수 없습니다"))).toBe("백업 폴더에 쓸 수 없습니다");
    expect(errorMessage("복원할 백업 파일이 없습니다")).toBe("복원할 백업 파일이 없습니다");
    expect(isAppError(null)).toBe(false);
  });

  it("영문 원문은 보여주지 않고 안내 문장으로 바꾼다", () => {
    expect(errorMessage(new Error("Cannot read properties of undefined"))).toContain("예상하지 못한 오류");
    expect(errorMessage({ foo: 1 })).toContain("예상하지 못한 오류");
  });
});

describe("errorDetail", () => {
  it("커맨드 에러의 원문을 종류와 함께 돌려준다", () => {
    const e = { code: "FILE", message: "백업 파일을 만들지 못했습니다.", detail: "os error 112" };
    expect(errorDetail(e)).toBe("[FILE] os error 112");
    expect(errorDetail({ code: "VALIDATION", message: "x" })).toBeUndefined();
  });

  it("영문 원문만 개발자용으로 넘기고, 한국어 문장은 넘기지 않는다", () => {
    expect(errorDetail("database is locked")).toBe("database is locked");
    expect(errorDetail("복원할 백업 파일이 없습니다")).toBeUndefined();
    expect(errorDetail(new Error("boom"))).toContain("boom");
    expect(errorDetail({ foo: 1 })).toBe('{"foo":1}');
  });

  it("재시작으로 연결이 끊긴 것을 알아본다", () => {
    expect(isRestartDisconnect(new Error("Could not connect: refused"))).toBe(true);
    expect(isRestartDisconnect("Disconnected")).toBe(true);
    expect(isRestartDisconnect(new Error("boom"))).toBe(false);
  });
});
