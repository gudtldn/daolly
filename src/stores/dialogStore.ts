import { create } from "zustand";
import type { ReactNode } from "react";
import { maskText, trackDialog } from "@/utils/usage";

type DialogType = "alert" | "confirm" | "custom";

interface DialogConfig {
  type: DialogType;
  title: string;
  message?: ReactNode;
  /** 접어 두는 '자세한 내용 (개발자용)' (오류 원문) */
  detail?: string;
  customContent?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  /** custom type 전용: true이면 다이얼로그 하단 footer(취소/확인 버튼)를 숨깁니다. */
  hideFooter?: boolean;
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
      trackDialog("open", { type: "alert", title: maskText(config.title) });
    }),

  showConfirm: (config) =>
    new Promise((resolve) => {
      get().resolvePromise?.(false);
      set({ isOpen: true, config: { ...config, type: "confirm" }, resolvePromise: resolve });
      trackDialog("open", { type: "confirm", title: maskText(config.title) });
    }),

  showCustom: (config) =>
    new Promise((resolve) => {
      get().resolvePromise?.(false);
      set({ isOpen: true, config: { ...config, type: "custom" }, resolvePromise: resolve });
      trackDialog("open", { type: "custom", title: maskText(config.title) });
    }),

  close: (result) =>
    set((state) => {
      if (state.config) trackDialog("close", { title: maskText(state.config.title), result });
      state.resolvePromise?.(result);
      return { isOpen: false, config: null, resolvePromise: null };
    }),
}));
