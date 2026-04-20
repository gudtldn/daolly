import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { tauriStorage } from "@/stores/tauriStorage";
import type { AppSettings, FontSize } from "@/types/settings";
import { DEFAULT_SETTINGS } from "@/types/settings";

interface SettingsActions {
  setTheme: (theme: AppSettings["general"]["theme"]) => void;
  setFontSize: (fontSize: FontSize) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  resetSettings: () => void;
}

type SettingsState = AppSettings & SettingsActions;

// Tauri 환경 여부 확인 (테스트에서는 Tauri API 사용 불가)
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      setTheme: (theme) =>
        set((state) => ({ general: { ...state.general, theme } })),

      setFontSize: (fontSize) =>
        set((state) => ({ general: { ...state.general, fontSize } })),

      toggleSidebar: () =>
        set((state) => ({
          ui: { ...state.ui, sidebarCollapsed: !state.ui.sidebarCollapsed },
        })),

      setSidebarCollapsed: (collapsed) =>
        set((state) => ({
          ui: { ...state.ui, sidebarCollapsed: collapsed },
        })),

      resetSettings: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: "app-settings",
      storage: createJSONStorage(() =>
        isTauri ? tauriStorage : localStorage
      ),
    }
  )
);
