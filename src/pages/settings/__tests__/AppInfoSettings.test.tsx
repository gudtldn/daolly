import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UpdateStatus } from "@/types";

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
vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn().mockResolvedValue("0.2.7"),
}));

import { AppInfoSettings } from "@/pages/settings/AppInfoSettings";

function renderWithStatus(status: UpdateStatus) {
  updateApi.getStatus.mockResolvedValue(status);
  return render(<AppInfoSettings />);
}

describe("AppInfoSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateApi.onStatus.mockResolvedValue(() => {});
  });

  it("받아 둔 새 버전이 있으면 종료 시 설치 안내와 '지금 설치' 버튼을 보여준다", async () => {
    const user = userEvent.setup();
    updateApi.installNow.mockResolvedValue(undefined);
    renderWithStatus({ state: "ready", version: "0.3.0", notes: "- 백업 기능 개선" });

    expect(await screen.findByText(/프로그램을 끄면 설치된 뒤 다시 열립니다/)).toBeInTheDocument();
    expect(screen.getByText("0.3.0")).toBeInTheDocument();
    expect(screen.getByText("- 백업 기능 개선")).toBeInTheDocument();
    // 받아 둔 상태에서는 다시 확인할 필요가 없음
    expect(screen.queryByRole("button", { name: /업데이트 확인/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /지금 설치/ }));
    expect(updateApi.installNow).toHaveBeenCalled();
  });

  it("다운로드 진행률을 보여준다", async () => {
    renderWithStatus({ state: "downloading", version: "0.3.0", progress: 42 });
    expect(await screen.findByText("새 버전 0.3.0 받는 중...")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
  });

  it("업데이트 확인: 최신 버전이면 알려준다", async () => {
    const user = userEvent.setup();
    updateApi.check.mockResolvedValue({ state: "upToDate" });
    renderWithStatus({ state: "idle" });

    await user.click(await screen.findByRole("button", { name: /업데이트 확인/ }));
    expect(await screen.findByText("최신 버전입니다.")).toBeInTheDocument();
  });

  it("확인에 실패하면 인터넷 연결 확인을 안내한다", async () => {
    renderWithStatus({ state: "failed", message: "network error" });
    expect(await screen.findByText(/인터넷 연결을 확인해 주세요/)).toBeInTheDocument();
  });

  it("백그라운드 상태 변경 이벤트를 반영한다", async () => {
    renderWithStatus({ state: "checking" });
    await screen.findByText("최신 버전을 확인하는 중...");

    const handler = updateApi.onStatus.mock.calls[0][0] as (s: UpdateStatus) => void;
    act(() => handler({ state: "ready", version: "0.3.0", notes: null }));
    expect(await screen.findByRole("button", { name: /지금 설치/ })).toBeInTheDocument();
  });
});
