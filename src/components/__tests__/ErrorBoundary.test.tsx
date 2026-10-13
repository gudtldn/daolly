import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updateApi = vi.hoisted(() => ({
  getStatus: vi.fn(),
  installNow: vi.fn(),
  onStatus: vi.fn(),
}));
vi.mock("@/bindings/updates", () => ({
  updateApi,
  isUpdateStatus: (v: unknown) => typeof v === "object" && v !== null && "state" in v,
}));

import { ErrorBoundary } from "@/components/ErrorBoundary";

// 에러를 던지는 테스트용 컴포넌트
function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Test error");
  return <div>정상 콘텐츠</div>;
}

describe("ErrorBoundary", () => {
  // React가 에러를 콘솔에 출력하는 것을 억제
  const originalConsoleError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
    vi.clearAllMocks();
    updateApi.getStatus.mockResolvedValue({ state: "upToDate" });
    updateApi.onStatus.mockResolvedValue(() => {});
    updateApi.installNow.mockResolvedValue(undefined);
  });
  afterEach(() => {
    console.error = originalConsoleError;
  });

  it("에러가 없으면 children을 렌더링한다", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("정상 콘텐츠")).toBeInTheDocument();
  });

  it("에러 발생 시 복구 UI를 표시한다", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("오류가 발생했습니다")).toBeInTheDocument();
    expect(screen.getByText(/예기치 않은 문제가 발생했습니다/)).toBeInTheDocument();
  });

  it("재시작 버튼을 표시한다", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("앱 재시작")).toBeInTheDocument();
    expect(screen.queryByText("업데이트 설치")).not.toBeInTheDocument();
  });

  it("새 버전을 받아 두었으면 오류 화면에서 바로 설치할 수 있다", async () => {
    updateApi.getStatus.mockResolvedValue({ state: "ready", version: "0.2.9", notes: null });
    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );
    await user.click(await screen.findByRole("button", { name: "업데이트 설치" }));
    expect(updateApi.installNow).toHaveBeenCalled();
  });
});
