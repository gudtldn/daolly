import { invoke } from "@tauri-apps/api/core";

export const priceSettingsApi = {
  exportToFile: (path: string) =>
    invoke<void>("export_price_settings_to_file", { path }),
  importFromFile: (path: string) =>
    invoke<void>("import_price_settings_from_file", { path }),
};
