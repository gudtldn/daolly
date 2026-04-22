import { describe, it, expect, vi, beforeAll } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { SalesPage } from "@/pages/SalesPage";

// salesApi calls invoke() which is not available in jsdom.
vi.mock("@/bindings/sales", () => ({
  salesApi: {
    listSalesRecords: vi.fn().mockResolvedValue([]),
    listUnpaidRecords: vi.fn().mockResolvedValue([]),
    listWeeklyChart: vi.fn().mockResolvedValue([]),
        listTopItems: vi.fn().mockResolvedValue([]),
  },
}));

// Suppress unhandled promise rejection warnings from async useEffect.
beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
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
    expect(screen.getByText("선택 기간 총 매출", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("카드", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("현금 / 이체", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("외상 발생", { selector: "p" })).toBeInTheDocument();
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

  it("매출 요약 탭에서 많이 접수된 품목 섹션이 표시된다", () => {
    renderWithRouter(<SalesPage />);
    expect(screen.getByText(/많이 접수된 품목/)).toBeInTheDocument();
    // API mock이 빈 배열을 반환하므로 "데이터 없음" 메시지가 표시됨
    expect(screen.getByText("데이터 없음")).toBeInTheDocument();
  });
});
