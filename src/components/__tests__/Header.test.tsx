import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import { Header } from "@/components/Header";

describe("Header", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-04-20 14:30:00 (월요일)
    vi.setSystemTime(new Date(2026, 3, 20, 14, 30, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("현재 경로에 맞는 페이지 제목을 표시한다 - 대시보드", () => {
    renderWithRouter(<Header />, { initialEntries: ["/dashboard"] });
    expect(screen.getByText("대시보드")).toBeInTheDocument();
  });

  it("현재 경로에 맞는 페이지 제목을 표시한다 - 고객 관리", () => {
    renderWithRouter(<Header />, { initialEntries: ["/customers"] });
    expect(screen.getByText("고객 관리")).toBeInTheDocument();
  });

  it("현재 경로에 맞는 페이지 제목을 표시한다 - 접수 / 출고", () => {
    renderWithRouter(<Header />, { initialEntries: ["/pos"] });
    expect(screen.getByText("접수 / 출고")).toBeInTheDocument();
  });

  it("현재 경로에 맞는 페이지 제목을 표시한다 - 매출 관리", () => {
    renderWithRouter(<Header />, { initialEntries: ["/sales"] });
    expect(screen.getByText("매출 관리")).toBeInTheDocument();
  });

  it("현재 경로에 맞는 페이지 제목을 표시한다 - 환경 설정", () => {
    renderWithRouter(<Header />, { initialEntries: ["/settings"] });
    expect(screen.getByText("환경 설정")).toBeInTheDocument();
  });

  it("시간을 표시한다", () => {
    renderWithRouter(<Header />, { initialEntries: ["/dashboard"] });
    expect(screen.getByText("14:30")).toBeInTheDocument();
  });

  it("날짜를 표시한다", () => {
    renderWithRouter(<Header />, { initialEntries: ["/dashboard"] });
    // ko-KR 로케일의 날짜 포맷
    expect(screen.getByText(/2026년/)).toBeInTheDocument();
    expect(screen.getByText(/4월/)).toBeInTheDocument();
    expect(screen.getByText(/20일/)).toBeInTheDocument();
  });
});
