import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// CustomersPage가 마운트 시 Tauri invoke를 호출하므로 mock 필요
vi.mock("@/bindings", () => ({
  customerApi: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  workItemApi: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    replaceDetails: vi.fn(),
    delete: vi.fn(),
    getUnpaidAmounts: vi.fn().mockResolvedValue({}),
  },
}));

import App from "@/App";

describe("App", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 3, 20, 14, 30, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("초기 라우트로 고객 관리 페이지를 표시한다", () => {
    render(<App />);
    // Header의 h2 제목으로 확인 (header 요소 내부)
    const header = document.querySelector("header");
    expect(header).toBeInTheDocument();
    expect(header!.querySelector("h2")).toHaveTextContent("고객 관리");
  });

  it("사이드바 메뉴 클릭 시 페이지가 전환된다", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);

    // 사이드바의 "대시보드" 링크 클릭
    const dashboardLink = screen.getByText("대시보드").closest("a")!;
    await user.click(dashboardLink);

    // Header 내부의 h2가 "대시보드"로 변경되어야 함
    const header = document.querySelector("header");
    expect(header!.querySelector("h2")).toHaveTextContent("대시보드");
  });

  it("고객 관리 메뉴가 초기 활성 상태이다", () => {
    render(<App />);
    // 사이드바 nav 내의 "고객 관리" 링크
    const nav = document.querySelector("nav")!;
    const customerLink = Array.from(nav.querySelectorAll("a")).find(
      (a) => a.textContent?.includes("고객 관리"),
    );
    expect(customerLink?.className).toContain("bg-primary-600");
  });
});
