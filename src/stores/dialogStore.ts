import { create } from "zustand";
import type { ReactNode } from "react";

type DialogType = "alert" | "confirm" | "custom";

interface DialogConfig {
  type: DialogType;
  title: string;
  message?: ReactNode;
  customContent?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

interface DialogState {
  isOpen: boolean;
  config: DialogConfig | null;
  resolvePromise: ((value: boolean) => void) | null;
}

interface DialogActions {
  showAlert: (config: Omit<DialogConfig, "type">) => Promise<boolean>;
  showConfirm: (config: Omit<DialogConfig, "type">) => Promise<boolean>;
  showCustom: (config: Omit<DialogConfig, "type" | "message">) => Promise<boolean>;
  close: (result: boolean) => void;
}

type DialogStore = DialogState & DialogActions;

export const useDialogStore = create<DialogStore>((set, get) => ({
  isOpen: false,
  config: null,
  resolvePromise: null,

  showAlert: (config) =>
    new Promise((resolve) => {
      // 이전 다이얼로그가 열려 있으면 false로 resolve하여 Promise leak 방지
      get().resolvePromise?.(false);
      set({ isOpen: true, config: { ...config, type: "alert" }, resolvePromise: resolve });
    }),

  showConfirm: (config) =>
    new Promise((resolve) => {
      get().resolvePromise?.(false);
      set({ isOpen: true, config: { ...config, type: "confirm" }, resolvePromise: resolve });
    }),

  showCustom: (config) =>
    new Promise((resolve) => {
      get().resolvePromise?.(false);
      set({ isOpen: true, config: { ...config, type: "custom" }, resolvePromise: resolve });
    }),

  close: (result) =>
    set((state) => {
      state.resolvePromise?.(result);
      return { isOpen: false, config: null, resolvePromise: null };
    }),
}));
