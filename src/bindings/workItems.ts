import { invoke } from "@tauri-apps/api/core";
import type {
  WorkItem,
  WorkItemFull,
  WorkItemDetail,
  WorkItemStatus,
  DetailInput,
  ReceiveOrder,
  UpdateWorkItem,
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

  update(id: number, data: UpdateWorkItem): Promise<WorkItem> {
    return invoke("update_work_item", { id, data });
  },

  updateStatus(id: number, status: WorkItemStatus): Promise<WorkItem> {
    return invoke("update_work_item_status", { id, status });
  },

  replaceDetails(
    workItemId: number,
    details: DetailInput[],
  ): Promise<WorkItemDetail[]> {
    return invoke("replace_work_item_details", { workItemId, details });
  },

  delete(id: number): Promise<void> {
    return invoke("delete_work_item", { id });
  },

  getAllUnpaidAmounts(): Promise<Record<number, number>> {
    return invoke("get_all_unpaid_amounts");
  },
};
