import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { useSettingsStore } from "@/stores/settingsStore";

afterEach(() => {
  cleanup();
  // 각 테스트 후 Zustand 스토어 초기화
  useSettingsStore.getState().resetSettings();
});
