import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BackupInfo, BackupSettings } from "@/types";

const api = vi.hoisted(() => ({
  getDbPath: vi.fn(),
  openDbFolder: vi.fn(),
  listBackups: vi.fn(),
  backup: vi.fn(),
  restore: vi.fn(),
  getBackupSettings: vi.fn(),
  setBackupMirrorDir: vi.fn(),
  takeStartupNotices: vi.fn(),
  migrateFromLegacy: vi.fn(),
  clearAllData: vi.fn(),
}));

vi.mock("@/bindings", () => ({ databaseApi: api }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

import { DatabaseSettings } from "@/pages/settings/DatabaseSettings";
import { useDialogStore } from "@/stores/dialogStore";

const backups: BackupInfo[] = [
  { filename: "daolly_20260924_090000_daily.db", createdAt: "2026.09.24 09:00:00", sizeBytes: 2048, kind: "daily" },
  { filename: "daolly_20260923_180000_pre-migration.db", createdAt: "2026.09.23 18:00:00", sizeBytes: 2048, kind: "preMigration" },
  { filename: "daolly_20260401_120000.db", createdAt: "2026.04.01 12:00:00", sizeBytes: 1024, kind: "legacy" },
];

function mockSettings(settings: BackupSettings) {
  api.getBackupSettings.mockResolvedValue(settings);
}

describe("DatabaseSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getDbPath.mockResolvedValue("C:/data/daolly.db");
    api.listBackups.mockResolvedValue(backups);
    mockSettings({ mirrorDir: null, lastMirror: null });
  });

  it("백업 종류를 사람이 읽을 수 있는 이름으로 보여준다", async () => {
    render(<DatabaseSettings />);
    expect(await screen.findByText("2026.09.24 09:00:00")).toBeInTheDocument();
    expect(screen.getByText("자동")).toBeInTheDocument();
    expect(screen.getByText("업데이트 전")).toBeInTheDocument();
    expect(screen.getByText("이전 버전")).toBeInTheDocument();
  });

  it("추가 백업 폴더와 마지막 복사 실패를 보여준다", async () => {
    mockSettings({
      mirrorDir: "E:/USB",
      lastMirror: { at: "2026.09.24 09:00:01", ok: false, message: "폴더를 찾을 수 없습니다" },
    });
    render(<DatabaseSettings />);
    expect(await screen.findByText("E:/USB")).toBeInTheDocument();
    expect(screen.getByText(/마지막 복사 실패.*폴더를 찾을 수 없습니다/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "폴더 변경" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "해제" })).toBeInTheDocument();
  });

  it("지금 백업: 추가 폴더 복사에 실패하면 경고를 보여준다", async () => {
    const user = userEvent.setup();
    api.backup.mockResolvedValue({
      info: backups[0],
      mirror: { at: "2026.09.24 09:00:01", ok: false, message: "쓰기 권한이 없습니다" },
    });
    render(<DatabaseSettings />);
    await user.click(await screen.findByRole("button", { name: /지금 백업/ }));

    expect(await screen.findByText(/백업 완료: 2026.09.24 09:00:00/)).toBeInTheDocument();
    expect(screen.getByText(/추가 백업 폴더에 복사하지 못했습니다: 쓰기 권한이 없습니다/)).toBeInTheDocument();
  });

  it("복원: 확인하면 선택한 백업 파일로 복원을 요청한다", async () => {
    const user = userEvent.setup();
    api.restore.mockResolvedValue(undefined);
    render(<DatabaseSettings />);
    await screen.findByText("2026.09.23 18:00:00");

    const restoreButtons = screen.getAllByRole("button", { name: /복원/ });
    await user.click(restoreButtons[1]);

    await waitFor(() => expect(useDialogStore.getState().isOpen).toBe(true));
    act(() => useDialogStore.getState().close(true));

    await waitFor(() => expect(api.restore).toHaveBeenCalledWith("daolly_20260923_180000_pre-migration.db"));
  });

  it("복원: 취소하면 요청하지 않는다", async () => {
    const user = userEvent.setup();
    render(<DatabaseSettings />);
    await screen.findByText("2026.09.24 09:00:00");

    await user.click(screen.getAllByRole("button", { name: /복원/ })[0]);
    await waitFor(() => expect(useDialogStore.getState().isOpen).toBe(true));
    act(() => useDialogStore.getState().close(false));

    await waitFor(() => expect(useDialogStore.getState().isOpen).toBe(false));
    expect(api.restore).not.toHaveBeenCalled();
  });
});
