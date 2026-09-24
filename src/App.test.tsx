import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Tauri API 및 플러그인 mock
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    show: vi.fn().mockResolvedValue(undefined),
  }),
}));

// 업데이트 상태 이벤트: 테스트에서 핸들러를 직접 호출
const updateApi = vi.hoisted(() => ({
  getStatus: vi.fn(),
  check: vi.fn(),
  installNow: vi.fn(),
  onStatus: vi.fn(),
}));
vi.mock("@/bindings/updates", () => ({
  updateApi,
  isUpdateStatus: (v: unknown) => typeof v === "object" && v !== null && "state" in v,
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
    getRevenueSummary: vi.fn().mockResolvedValue({
      totalSales: 0,
      actualIncome: 0,
      cardIncome: 0,
      cashIncome: 0,
      transferIncome: 0,
      otherIncome: 0,
      backPaymentIncome: 0,
    }),
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
    updateApi.getStatus.mockResolvedValue({ state: "idle" });
    updateApi.onStatus.mockResolvedValue(() => {});
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

  it("새 버전을 받아 두면 종료 시 설치된다고 알려준다", async () => {
    render(<App />);
    await screen.findByRole("banner");
    await waitFor(() => expect(updateApi.onStatus).toHaveBeenCalled());

    const handler = updateApi.onStatus.mock.calls[0][0] as (s: unknown) => void;
    act(() => handler({ state: "ready", version: "0.3.0", notes: null }));

    expect(await screen.findByText("새 버전(0.3.0)을 받아 두었습니다.")).toBeInTheDocument();
    expect(screen.getByText("프로그램을 끄면 설치된 뒤 다시 열립니다.")).toBeInTheDocument();
  });

  it("복구 화면에서 준비된 업데이트를 바로 설치할 수 있다", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    databaseApi.getStartupStatus.mockResolvedValue({ state: "failed", message: "migration failed" });
    updateApi.getStatus.mockResolvedValue({ state: "ready", version: "0.3.1", notes: null });
    updateApi.installNow.mockResolvedValue(undefined);
    render(<App />);

    const button = await screen.findByRole("button", { name: /업데이트 설치/ });
    expect(screen.getByText(/새 버전\(0\.3\.1\)이 준비되어 있습니다/)).toBeInTheDocument();
    await user.click(button);
    expect(updateApi.installNow).toHaveBeenCalled();
  });
});
