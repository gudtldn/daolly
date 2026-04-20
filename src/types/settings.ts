export interface GeneralSettings {
  theme: "light" | "dark" | "system";
  language: "ko";
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
  },
  ui: {
    sidebarCollapsed: false,
  },
};
