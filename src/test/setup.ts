import { cleanup } from "@testing-library/react";
import { vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { useSettingsStore } from "@/stores/settingsStore";

// jsdom에 matchMedia가 없으므로 mock 제공
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Tauri Plugins Mock
vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn().mockResolvedValue(null),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn().mockResolvedValue("0.1.0"),
}));

afterEach(() => {
  cleanup();
  useSettingsStore.getState().resetSettings();
});
