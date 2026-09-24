import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Tauri API 및 플러그인 mock
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    show: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn().mockResolvedValue({ available: false }),
}));

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
    getAllUnpaidAmounts: vi.fn().mockResolvedValue({}),
  },
}));

// App이 기동 상태/알림을 조회하므로 mock 필요
const databaseApi = vi.hoisted(() => ({
  getStartupStatus: vi.fn(),
  takeStartupNotices: vi.fn(),
  listBackups: vi.fn(),
  restore: vi.fn(),
  openLogFolder: vi.fn(),
}));
vi.mock("@/bindings/database", () => ({ databaseApi }));

// 매출 관리 페이지는 salesApi를 직접 import하므로 별도 mock 필요
vi.mock("@/bindings/sales", () => ({
  salesApi: {
    listSalesRecords: vi.fn().mockResolvedValue([]),
    listPaymentRecords: vi.fn().mockResolvedValue([]),
    getRevenueSummary: vi.fn().mockResolvedValue({ totalSales: 0, actualIncome: 0 }),
    listUnpaidRecords: vi.fn().mockResolvedValue([]),
    listWeeklyChart: vi.fn().mockResolvedValue([]),
    listTopItems: vi.fn().mockResolvedValue([]),
  },
}));

import App from "@/App";

describe("App", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 3, 20, 14, 30, 0));
    databaseApi.getStartupStatus.mockResolvedValue({ state: "ready" });
    databaseApi.takeStartupNotices.mockResolvedValue([]);
    databaseApi.listBackups.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("초기 라우트로 고객 관리 페이지를 표시한다", async () => {
    render(<App />);
    // 업데이트 스플래시 화면이 사라지고 본문이 나타날 때까지 대기
    const header = await screen.findByRole("banner"); // <header>
    expect(header).toBeInTheDocument();
    expect(header.querySelector("h2")).toHaveTextContent("고객 관리");
  });

  it("사이드바 메뉴 클릭 시 페이지가 전환된다", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);

    // 업데이트 스플래시 이후 본문 노출 대기
    await screen.findByRole("banner");

    // 사이드바의 "매출 관리" 링크 클릭
    const salesLink = screen.getByText("매출 관리").closest("a")!;
    await user.click(salesLink);

    // Header 내부의 h2가 "매출 관리"로 변경되어야 함
    const header = document.querySelector("header");
    expect(header!.querySelector("h2")).toHaveTextContent("매출 관리");
  });

  it("고객 관리 메뉴가 초기 활성 상태이다", async () => {
    render(<App />);
    await screen.findByRole("banner");

    // 사이드바 nav 내의 "고객 관리" 링크
    const nav = document.querySelector("nav")!;
    const customerLink = Array.from(nav.querySelectorAll("a")).find(
      (a) => a.textContent?.includes("고객 관리"),
    );
    expect(customerLink?.className).toContain("bg-primary-600");
  });

  it("DB를 열지 못하면 복구 화면과 백업 목록을 보여준다", async () => {
    databaseApi.getStartupStatus.mockResolvedValue({ state: "failed", message: "file is not a database" });
    databaseApi.listBackups.mockResolvedValue([
      { filename: "daolly_20260420_090000_daily.db", createdAt: "2026.04.20 09:00:00", sizeBytes: 1024, kind: "daily" },
    ]);
    render(<App />);

    expect(await screen.findByText("데이터를 열지 못했습니다")).toBeInTheDocument();
    expect(await screen.findByText("2026.04.20 09:00:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /이 백업으로 복원/ })).toBeInTheDocument();
    expect(screen.getByText("file is not a database")).toBeInTheDocument();
    // 일반 화면(사이드바/헤더)은 그리지 않음
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });

  it("백업 복원이 적용되었으면 알려준다", async () => {
    databaseApi.takeStartupNotices.mockResolvedValue([{ type: "restoreApplied" }]);
    render(<App />);
    expect(await screen.findByText("백업에서 데이터를 복원했습니다.")).toBeInTheDocument();
  });

  it("백업 복원에 실패해 되돌렸으면 사유와 함께 알려준다", async () => {
    databaseApi.takeStartupNotices.mockResolvedValue([{ type: "restoreFailed", reason: "file is not a database" }]);
    render(<App />);
    expect(await screen.findByText("복원하지 못했습니다")).toBeInTheDocument();
    expect(screen.getByText(/사유: file is not a database/)).toBeInTheDocument();
  });
});
