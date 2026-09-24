import { create } from "zustand";
import type {
  WorkItem,
  WorkItemFull,
  WorkItemStatus,
  ReceiveOrder,
  UpdateWorkItem,
} from "@/types";
import { workItemApi } from "@/bindings";

interface WorkItemState {
  workItems: WorkItem[];
  selectedItem: WorkItemFull | null;
  filterCustomerId: number | null;
  filterStatus: WorkItemStatus | null;
  isLoading: boolean;
}

interface WorkItemActions {
  load: () => Promise<void>;
  setFilter: (filter: { customerId?: number | null; status?: WorkItemStatus | null }) => Promise<void>;
  select: (id: number) => Promise<void>;
  clearSelection: () => void;
  receive: (order: ReceiveOrder) => Promise<WorkItemFull>;
  update: (id: number, data: UpdateWorkItem) => Promise<WorkItem>;
  updateStatus: (id: number, status: WorkItemStatus) => Promise<WorkItem>;
  delete: (id: number) => Promise<void>;
}

type WorkItemStore = WorkItemState & WorkItemActions;

export const useWorkItemStore = create<WorkItemStore>((set, get) => ({
  workItems: [],
  selectedItem: null,
  filterCustomerId: null,
  filterStatus: null,
  isLoading: false,

  load: async () => {
    const { filterCustomerId, filterStatus } = get();
    set({ isLoading: true });
    try {
      const workItems = await workItemApi.list(filterCustomerId, filterStatus);
      set({ workItems });
    } finally {
      set({ isLoading: false });
    }
  },

  setFilter: (filter) => {
    set((s) => ({
      filterCustomerId: filter.customerId !== undefined ? filter.customerId : s.filterCustomerId,
      filterStatus: filter.status !== undefined ? filter.status : s.filterStatus,
    }));
    return get().load();
  },

  select: async (id) => {
    const full = await workItemApi.get(id);
    set({ selectedItem: full });
  },

  clearSelection: () => set({ selectedItem: null }),

  receive: async (order) => {
    const receipt = await workItemApi.receive(order);
    const { details: _details, payments: _payments, ...item } = receipt;
    // 같은 요청을 다시 보내 이미 있는 접수가 돌아와도 목록에 두 번 넣지 않음
    set((s) => ({ workItems: [item, ...s.workItems.filter((w) => w.id !== item.id)] }));
    return receipt;
  },

  update: async (id, data) => {
    const updated = await workItemApi.update(id, data);
    set((s) => ({
      workItems: s.workItems.map((w) => (w.id === id ? updated : w)),
      selectedItem: s.selectedItem?.id === id
        ? { ...s.selectedItem, ...updated }
        : s.selectedItem,
    }));
    return updated;
  },

  updateStatus: async (id, status) => {
    const updated = await workItemApi.updateStatus(id, status);
    set((s) => ({
      workItems: s.workItems.map((w) => (w.id === id ? updated : w)),
      selectedItem: s.selectedItem?.id === id
        ? { ...s.selectedItem, ...updated }
        : s.selectedItem,
    }));
    return updated;
  },

  delete: async (id) => {
    await workItemApi.delete(id);
    set((s) => ({
      workItems: s.workItems.filter((w) => w.id !== id),
      selectedItem: s.selectedItem?.id === id ? null : s.selectedItem,
    }));
  },
}));
