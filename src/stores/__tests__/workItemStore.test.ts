import { describe, it, expect, vi, beforeEach } from "vitest";
import { useWorkItemStore } from "@/stores/workItemStore";
import type { WorkItem, WorkItemFull } from "@/types";

vi.mock("@/bindings", () => ({
  workItemApi: {
    list: vi.fn(),
    get: vi.fn(),
    receive: vi.fn(),
    amend: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
  },
}));

import { workItemApi } from "@/bindings";

const mockList = vi.mocked(workItemApi.list);
const mockGet = vi.mocked(workItemApi.get);
const mockReceive = vi.mocked(workItemApi.receive);
const mockAmend = vi.mocked(workItemApi.amend);
const mockUpdateStatus = vi.mocked(workItemApi.updateStatus);
const mockDelete = vi.mocked(workItemApi.delete);

const wi1: WorkItem = { id: 1, customerId: 1, status: "Received", description: "와이셔츠", price: 3000, paidAmount: 0, note: null, receivedAt: "2024-01-01", completedAt: null, pickedUpAt: null, createdAt: "2024-01-01", lastModifiedAt: "2024-01-01" };
const wi2: WorkItem = { id: 2, customerId: 2, status: "Completed", description: "바지", price: 4000, paidAmount: 4000, note: null, receivedAt: "2024-01-02", completedAt: "2024-01-03", pickedUpAt: null, createdAt: "2024-01-02", lastModifiedAt: "2024-01-03" };

const wiFull: WorkItemFull = { ...wi1, details: [], payments: [] };

function resetStore() {
  useWorkItemStore.setState({
    workItems: [],
    selectedItem: null,
    filterCustomerId: null,
    filterStatus: null,
    isLoading: false,
  });
}

describe("workItemStore", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  describe("load", () => {
    it("필터 적용하여 목록 로드", async () => {
      mockList.mockResolvedValue([wi1]);
      useWorkItemStore.setState({ filterCustomerId: 1, filterStatus: "Received" });

      await useWorkItemStore.getState().load();
      expect(mockList).toHaveBeenCalledWith(1, "Received");
      expect(useWorkItemStore.getState().workItems).toEqual([wi1]);
    });

    it("API 에러 시 isLoading 복구", async () => {
      mockList.mockRejectedValue(new Error("fail"));
      await expect(useWorkItemStore.getState().load()).rejects.toThrow();
      expect(useWorkItemStore.getState().isLoading).toBe(false);
    });
  });

  describe("setFilter", () => {
    it("필터 변경 후 자동 reload", async () => {
      mockList.mockResolvedValue([wi2]);
      await useWorkItemStore.getState().setFilter({ status: "Completed" });
      expect(useWorkItemStore.getState().filterStatus).toBe("Completed");
      expect(mockList).toHaveBeenCalled();
    });
  });

  describe("select", () => {
    it("WorkItemFull 조회", async () => {
      mockGet.mockResolvedValue(wiFull);
      await useWorkItemStore.getState().select(1);
      expect(useWorkItemStore.getState().selectedItem).toEqual(wiFull);
    });
  });

  describe("updateStatus", () => {
    it("상태 변경 후 목록 + selectedItem 갱신", async () => {
      const updated = { ...wi1, status: "Completed" as const, completedAt: "2024-01-05" };
      mockUpdateStatus.mockResolvedValue(updated);
      useWorkItemStore.setState({ workItems: [wi1, wi2], selectedItem: wiFull });

      await useWorkItemStore.getState().updateStatus(1, "Completed");
      expect(useWorkItemStore.getState().workItems[0].status).toBe("Completed");
      expect(useWorkItemStore.getState().selectedItem?.status).toBe("Completed");
    });
  });

  describe("receive", () => {
    const order = { requestId: "req-1", customerId: 1, description: "와이셔츠", lines: [] };

    it("접수 후 목록 맨 앞에 추가 (품목·결제는 목록에 넣지 않음)", async () => {
      mockReceive.mockResolvedValue(wiFull);
      useWorkItemStore.setState({ workItems: [wi2] });

      const result = await useWorkItemStore.getState().receive(order);
      expect(result).toEqual(wiFull);
      expect(useWorkItemStore.getState().workItems[0]).toEqual(wi1);
      expect(useWorkItemStore.getState().workItems).toHaveLength(2);
    });

    it("같은 요청으로 이미 있는 접수가 돌아오면 목록에 두 번 넣지 않음", async () => {
      mockReceive.mockResolvedValue(wiFull);
      useWorkItemStore.setState({ workItems: [wi1, wi2] });

      await useWorkItemStore.getState().receive(order);
      expect(useWorkItemStore.getState().workItems.map((w) => w.id)).toEqual([1, 2]);
    });
  });

  describe("amend", () => {
    it("수정 후 목록 + selectedItem 갱신", async () => {
      const updated: WorkItemFull = { ...wiFull, description: "와이셔츠 세탁", price: 5000 };
      mockAmend.mockResolvedValue(updated);
      useWorkItemStore.setState({ workItems: [wi1, wi2], selectedItem: wiFull });

      await useWorkItemStore.getState().amend(1, { description: "와이셔츠 세탁", priceOverride: 5000 });
      expect(useWorkItemStore.getState().workItems[0]).toEqual({ ...wi1, description: "와이셔츠 세탁", price: 5000 });
      expect(useWorkItemStore.getState().selectedItem).toEqual(updated);
    });
  });

  describe("delete", () => {
    it("삭제 후 목록 제거 + 선택 해제", async () => {
      mockDelete.mockResolvedValue(undefined);
      useWorkItemStore.setState({ workItems: [wi1, wi2], selectedItem: wiFull });

      await useWorkItemStore.getState().delete(1);
      expect(useWorkItemStore.getState().workItems).toEqual([wi2]);
      expect(useWorkItemStore.getState().selectedItem).toBeNull();
    });
  });
});
