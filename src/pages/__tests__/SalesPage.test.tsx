import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { SalesPage } from "@/pages/SalesPage";
import { useUIStore } from "@/stores/uiStore";
import { salesApi } from "@/bindings/sales";

// salesApi calls invoke() which is not available in jsdom.
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

// Suppress unhandled promise rejection warnings from async useEffect.
beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  useUIStore.setState({
    salesPage: {
      activeTab: "summary",
      summary: {
        period: "today",
        customRange: null,
        search: "",
        rightTab: "payments",
      },
      transactions: {
        period: "today",
        customRange: null,
        search: "",
      },
    },
  });
});

describe("SalesPage", () => {
  it("기본 탭(매출 요약)이 활성화된 상태로 렌더링된다", () => {
    renderWithRouter(<SalesPage />);
    expect(screen.getByRole("button", { name: /매출 요약/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /거래 내역/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /미수금 관리/ })).toBeInTheDocument();
  });

  it("기본 탭에서 KPI 카드들이 표시된다", () => {
    renderWithRouter(<SalesPage />);
    // KPI 카드 헤더 텍스트 기준으로 확인 (selector: "p" 로 카드 제목만 지정)
    expect(screen.getByText("오늘 입금된 금액", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("카드 결제액", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("현금 / 이체 합계", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("오늘 접수한 금액", { selector: "p" })).toBeInTheDocument();
  });

  it("'거래 내역' 탭 클릭 시 해당 콘텐츠가 표시된다", async () => {
    const user = userEvent.setup();
    renderWithRouter(<SalesPage />);

    await user.click(screen.getByRole("button", { name: /거래 내역/ }));
    expect(screen.getByText("상세 결제 내역")).toBeInTheDocument();
  });

  it("'미수금 관리' 탭 클릭 시 해당 콘텐츠가 표시된다", async () => {
    const user = userEvent.setup();
    renderWithRouter(<SalesPage />);

    await user.click(screen.getByRole("button", { name: /미수금 관리/ }));
    expect(screen.getByText(/총 미수금/)).toBeInTheDocument();
  });

  it("매출 요약 탭에서 주간 차트 레이블이 표시된다", () => {
    renderWithRouter(<SalesPage />);
    expect(screen.getByText("주간 매출 추이")).toBeInTheDocument();
  });

  it("매출 요약 탭에서 자주 찾는 품목 섹션이 표시된다", () => {
    renderWithRouter(<SalesPage />);
    expect(screen.getByText(/자주 찾는 품목/)).toBeInTheDocument();
    // API mock이 빈 배열을 반환하므로 "데이터 없음" 메시지가 표시됨
    expect(screen.getByText("데이터 없음")).toBeInTheDocument();
  });

  it("매출 요약은 가게 날짜로 조회하고 서버가 집계한 결제 수단별 금액을 표시한다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 2, 2, 0, 30)); // 2026-03-02 새벽
    vi.mocked(salesApi.getRevenueSummary).mockResolvedValueOnce({
      totalSales: 50000,
      actualIncome: 30000,
      cardIncome: 12000,
      cashIncome: 9000,
      transferIncome: 6000,
      otherIncome: 3000,
      backPaymentIncome: 10000,
    });
    try {
      renderWithRouter(<SalesPage />);

      expect(await screen.findByText("12,000")).toBeInTheDocument(); // 카드
      expect(screen.getByText("15,000")).toBeInTheDocument(); // 현금 + 이체
      expect(screen.getByText("20,000원")).toBeInTheDocument(); // 당일 결제분
      expect(screen.getByText("10,000원")).toBeInTheDocument(); // 미수 수납분
      expect(salesApi.getRevenueSummary).toHaveBeenCalledWith("2026-03-02", "2026-03-02");
      expect(salesApi.listPaymentRecords).toHaveBeenCalledWith("2026-03-02", "2026-03-02");
    } finally {
      vi.useRealTimers();
    }
  });
});
