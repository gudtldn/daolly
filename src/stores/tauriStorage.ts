import type { StateStorage } from "zustand/middleware";
import { load } from "@tauri-apps/plugin-store";

// Tauri Store 인스턴스를 lazy하게 초기화
let storePromise: ReturnType<typeof load> | null = null;

function getStore() {
  if (!storePromise) {
    storePromise = load("settings.json", { defaults: {}, autoSave: true });
  }
  return storePromise;
}

/**
 * Zustand persist 미들웨어용 Tauri Store 어댑터.
 * Tauri API가 비동기이므로 StateStorage의 비동기 오버로드를 사용.
 */
export const tauriStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const store = await getStore();
    return (await store.get<string>(name)) ?? null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    const store = await getStore();
    await store.set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    const store = await getStore();
    await store.delete(name);
  },
};
