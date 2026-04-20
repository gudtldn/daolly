import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { Sidebar } from "@/components/Sidebar";

describe("Sidebar", () => {
  it("로고와 앱 이름을 렌더링한다", () => {
    renderWithRouter(<Sidebar />);
    // 로고 영역의 h1
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sidekick");
  });

  it("메인 네비게이션 메뉴 4개를 렌더링한다", () => {
    renderWithRouter(<Sidebar />);
    expect(screen.getByText("대시보드")).toBeInTheDocument();
    expect(screen.getByText("접수 / 출고")).toBeInTheDocument();
    expect(screen.getByText("고객 관리")).toBeInTheDocument();
    expect(screen.getByText("매출 관리")).toBeInTheDocument();
  });

  it("환경 설정 메뉴를 렌더링한다", () => {
    renderWithRouter(<Sidebar />);
    expect(screen.getByText("환경 설정")).toBeInTheDocument();
  });

  it("모든 메뉴가 올바른 경로를 가진다", () => {
    renderWithRouter(<Sidebar />);
    expect(screen.getByText("대시보드").closest("a")).toHaveAttribute("href", "/dashboard");
    expect(screen.getByText("접수 / 출고").closest("a")).toHaveAttribute("href", "/pos");
    expect(screen.getByText("고객 관리").closest("a")).toHaveAttribute("href", "/customers");
    expect(screen.getByText("매출 관리").closest("a")).toHaveAttribute("href", "/sales");
    expect(screen.getByText("환경 설정").closest("a")).toHaveAttribute("href", "/settings");
  });

  it("현재 경로에 해당하는 메뉴가 활성 스타일을 가진다", () => {
    renderWithRouter(<Sidebar />, { initialEntries: ["/customers"] });
    const activeLink = screen.getByText("고객 관리").closest("a");
    expect(activeLink?.className).toContain("bg-primary-600");
  });

  it("비활성 메뉴는 기본 스타일을 가진다", () => {
    renderWithRouter(<Sidebar />, { initialEntries: ["/customers"] });
    const inactiveLink = screen.getByText("대시보드").closest("a");
    expect(inactiveLink?.className).toContain("text-secondary-400");
  });

  it("하단에 사용자 정보를 렌더링한다", () => {
    renderWithRouter(<Sidebar />);
    expect(screen.getByText("관리자")).toBeInTheDocument();
  });

  it("토글 버튼 클릭 시 사이드바가 접힌다", async () => {
    const user = userEvent.setup();
    renderWithRouter(<Sidebar />);

    await user.click(screen.getByLabelText("사이드바 접기"));

    // 접힌 상태: 라벨이 숨겨짐
    expect(screen.queryByText("대시보드")).not.toBeInTheDocument();
    // 로고 텍스트가 DOM에서 제거됨
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    // aside 너비 클래스 변경
    const aside = document.querySelector("aside");
    expect(aside?.className).toContain("w-16");
  });

  it("접힌 상태에서 토글 버튼 클릭 시 다시 펼쳐진다", async () => {
    const user = userEvent.setup();
    renderWithRouter(<Sidebar />);

    await user.click(screen.getByLabelText("사이드바 접기"));
    await user.click(screen.getByLabelText("사이드바 펼치기"));

    expect(screen.getByText("대시보드")).toBeInTheDocument();
    const aside = document.querySelector("aside");
    expect(aside?.className).toContain("w-60");
  });
});
