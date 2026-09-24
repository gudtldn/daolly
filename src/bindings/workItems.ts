import { invoke } from "@tauri-apps/api/core";
import type {
  WorkItem,
  WorkItemFull,
  WorkItemStatus,
  ReceiveOrder,
  AmendOrder,
} from "@/types";

export const workItemApi = {
  list(customerId?: number | null, status?: WorkItemStatus | null): Promise<WorkItem[]> {
    return invoke("list_work_items", {
      customerId: customerId ?? null,
      status: status ?? null,
    });
  },

  get(id: number): Promise<WorkItemFull> {
    return invoke("get_work_item", { id });
  },

  /** 접수 (품목, 선결제 포함)를 한 번에 저장 */
  receive(order: ReceiveOrder): Promise<WorkItemFull> {
    return invoke("receive_order", { order });
  },

  /** 상태·내용·품목을 한 번에 수정 */
  amend(id: number, amendment: AmendOrder): Promise<WorkItemFull> {
    return invoke("amend_order", { id, amendment });
  },

  updateStatus(id: number, status: WorkItemStatus): Promise<WorkItem> {
    return invoke("update_work_item_status", { id, status });
  },

  delete(id: number): Promise<void> {
    return invoke("delete_work_item", { id });
  },

  /** 삭제(취소)한 접수 되돌리기. 함께 취소한 결제도 되살림 */
  restore(id: number): Promise<void> {
    return invoke("restore_work_item", { id });
  },

  getAllUnpaidAmounts(): Promise<Record<number, number>> {
    return invoke("get_all_unpaid_amounts");
  },
};
