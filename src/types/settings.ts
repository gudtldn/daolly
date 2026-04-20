export type FontSize = "small" | "medium" | "large";

export interface GeneralSettings {
  theme: "light" | "dark" | "system";
  language: "ko";
  fontSize: FontSize;
}

export interface UiSettings {
  sidebarCollapsed: boolean;
}

export interface AppSettings {
  general: GeneralSettings;
  ui: UiSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  general: {
    theme: "system",
    language: "ko",
    fontSize: "medium",
  },
  ui: {
    sidebarCollapsed: false,
  },
};
