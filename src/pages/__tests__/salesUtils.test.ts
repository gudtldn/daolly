import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDateRange } from "@/pages/sales/salesUtils";

describe("getDateRange", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("프리셋 기간을 이 PC 기준 날짜(YYYY-MM-DD)로 반환한다", () => {
    // 2026-09-24(목) 새벽: 한국에서는 UTC 날짜가 아직 전날인 시간대
    vi.setSystemTime(new Date(2026, 8, 24, 0, 30));

    expect(getDateRange("today")).toEqual({ from: "2026-09-24", to: "2026-09-24" });
    expect(getDateRange("yesterday")).toEqual({ from: "2026-09-23", to: "2026-09-23" });
    expect(getDateRange("week")).toEqual({ from: "2026-09-21", to: "2026-09-24" });
    expect(getDateRange("month")).toEqual({ from: "2026-09-01", to: "2026-09-24" });
    expect(getDateRange("year")).toEqual({ from: "2026-01-01", to: "2026-09-24" });
  });

  it("월초의 어제와 일요일의 이번 주를 올바르게 계산한다", () => {
    vi.setSystemTime(new Date(2026, 10, 1, 23, 59)); // 2026-11-01(일)

    expect(getDateRange("yesterday")).toEqual({ from: "2026-10-31", to: "2026-10-31" });
    expect(getDateRange("week")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
  });
});
