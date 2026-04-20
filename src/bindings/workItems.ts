import { invoke } from "@tauri-apps/api/core";
import type {
  WorkItem,
  WorkItemFull,
  WorkItemDetail,
  WorkItemStatus,
  CreateWorkItem,
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

  create(data: CreateWorkItem): Promise<WorkItem> {
    return invoke("create_work_item", { data });
  },

  update(id: number, data: UpdateWorkItem): Promise<WorkItem> {
    return invoke("update_work_item", { id, data });
  },

  updateStatus(id: number, status: WorkItemStatus): Promise<WorkItem> {
    return invoke("update_work_item_status", { id, status });
  },

  replaceDetails(
    workItemId: number,
    details: CreateWorkItem["details"],
  ): Promise<WorkItemDetail[]> {
    return invoke("replace_work_item_details", { workItemId, details });
  },

  delete(id: number): Promise<void> {
    return invoke("delete_work_item", { id });
  },
};
