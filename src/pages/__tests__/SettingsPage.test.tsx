import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { SettingsPage } from "@/pages/SettingsPage";
import { useSettingsStore } from "@/stores/settingsStore";

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn().mockResolvedValue("0.1.0"),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(""),
}));

describe("SettingsPage", () => {
  it("환경 설정 제목을 렌더링한다", () => {
    renderWithRouter(<SettingsPage />);
    expect(screen.getByText("환경 설정")).toBeInTheDocument();
  });

  it("카테고리 목록을 렌더링한다", () => {
    renderWithRouter(<SettingsPage />);
    expect(screen.getByRole("button", { name: "일반 설정" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "데이터 관리" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "앱 정보" })).toBeInTheDocument();
  });

  it("기본으로 일반 설정이 활성화된다", () => {
    renderWithRouter(<SettingsPage />);
    // 좌측 카테고리 버튼의 활성 스타일 확인
    const generalBtn = screen.getByRole("button", { name: "일반 설정" });
    expect(generalBtn.className).toContain("bg-primary-600");
    // 우측에 일반 설정 콘텐츠 표시
    expect(screen.getByText("테마")).toBeInTheDocument();
  });

  it("앱 정보 카테고리를 클릭하면 콘텐츠가 변경된다", async () => {
    const user = userEvent.setup();
    renderWithRouter(<SettingsPage />);

    await user.click(screen.getByRole("button", { name: "앱 정보" }));

    // 앱 정보 콘텐츠 표시
    expect(screen.getByText("다올리")).toBeInTheDocument();
    expect(screen.getByText("0.1.0")).toBeInTheDocument();
    // 일반 설정 콘텐츠는 사라짐
    expect(screen.queryByText("테마")).not.toBeInTheDocument();
  });

  it("카테고리 전환 후 다시 돌아올 수 있다", async () => {
    const user = userEvent.setup();
    renderWithRouter(<SettingsPage />);

    await user.click(screen.getByRole("button", { name: "앱 정보" }));
    await user.click(screen.getByRole("button", { name: "일반 설정" }));

    expect(screen.getByText("테마")).toBeInTheDocument();
    expect(screen.queryByText("0.1.0")).not.toBeInTheDocument();
  });

  it("활성 카테고리만 활성 스타일을 가진다", async () => {
    const user = userEvent.setup();
    renderWithRouter(<SettingsPage />);

    await user.click(screen.getByRole("button", { name: "앱 정보" }));

    const appInfoBtn = screen.getByRole("button", { name: "앱 정보" });
    const generalBtn = screen.getByRole("button", { name: "일반 설정" });
    expect(appInfoBtn.className).toContain("bg-primary-600");
    expect(generalBtn.className).not.toContain("bg-primary-600");
  });

  it("테마 버튼 클릭 시 스토어가 업데이트된다", async () => {
    const user = userEvent.setup();
    renderWithRouter(<SettingsPage />);

    // 기본값은 light
    expect(useSettingsStore.getState().general.theme).toBe("light");

    // 다크 테마 선택
    await user.click(screen.getByRole("button", { name: "다크" }));
    expect(useSettingsStore.getState().general.theme).toBe("dark");

    // 라이트 테마 선택
    await user.click(screen.getByRole("button", { name: "라이트" }));
    expect(useSettingsStore.getState().general.theme).toBe("light");
  });

  it("현재 테마 버튼이 활성 스타일을 가진다", () => {
    renderWithRouter(<SettingsPage />);

    // 기본 light 테마가 활성
    const lightBtn = screen.getByRole("button", { name: "라이트" });
    expect(lightBtn.className).toContain("border-primary-500");
  });
});
