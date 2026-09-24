import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { UpdateStatus } from "@/types";

export const updateApi = {
  getStatus(): Promise<UpdateStatus> {
    return invoke("get_update_status");
  },

  /** 지금 확인하고, 새 버전이 있으면 내려받아 둡니다. */
  check(): Promise<UpdateStatus> {
    return invoke("check_for_update");
  },

  /** 받아 둔 업데이트를 지금 설치하고 다시 시작합니다. */
  installNow(): Promise<void> {
    return invoke("install_update_now");
  },

  /** 상태가 바뀔 때마다 호출됩니다. */
  onStatus(handler: (status: UpdateStatus) => void): Promise<UnlistenFn> {
    return listen<UpdateStatus>("update-status", (event) => handler(event.payload));
  },
};

/** invoke 결과가 UpdateStatus 형태인지 확인 (테스트 mock 등 예외 상황 대비) */
export function isUpdateStatus(value: unknown): value is UpdateStatus {
  return typeof value === "object" && value !== null && "state" in value;
}
