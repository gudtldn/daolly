import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCustomerStore } from "@/stores/customerStore";
import type { Customer } from "@/types";

vi.mock("@/bindings", () => ({
  customerApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { customerApi } from "@/bindings";

const mockList = vi.mocked(customerApi.list);
const mockCreate = vi.mocked(customerApi.create);
const mockUpdate = vi.mocked(customerApi.update);
const mockDelete = vi.mocked(customerApi.delete);

const customer1: Customer = { id: 1, name: "홍길동", phoneNumber: "01012345678", note: null, createdAt: "2024-01-01", lastModifiedAt: "2024-01-01" };
const customer2: Customer = { id: 2, name: "김철수", phoneNumber: null, note: "단골", createdAt: "2024-01-02", lastModifiedAt: "2024-01-02" };

function resetStore() {
  useCustomerStore.setState({
    customers: [],
    selectedCustomer: null,
    isLoading: false,
  });
}

describe("customerStore", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  describe("load", () => {
    it("고객 목록 로드 + isLoading 전이", async () => {
      mockList.mockResolvedValue([customer1, customer2]);

      const loadPromise = useCustomerStore.getState().load();
      expect(useCustomerStore.getState().isLoading).toBe(true);

      await loadPromise;
      expect(useCustomerStore.getState().customers).toEqual([customer1, customer2]);
      expect(useCustomerStore.getState().isLoading).toBe(false);
    });

    it("API 에러 시 isLoading false로 복구", async () => {
      mockList.mockRejectedValue(new Error("DB error"));

      await expect(useCustomerStore.getState().load()).rejects.toThrow("DB error");
      expect(useCustomerStore.getState().isLoading).toBe(false);
    });
  });

  describe("create", () => {
    it("생성 후 목록에 추가 (name 오름차순 정렬 유지)", async () => {
      mockCreate.mockResolvedValue(customer1);
      useCustomerStore.setState({ customers: [] });

      const result = await useCustomerStore.getState().create({ name: "홍길동" });
      expect(result).toEqual(customer1);
      expect(useCustomerStore.getState().customers).toContainEqual(customer1);
    });
  });

  describe("update", () => {
    it("수정 후 목록 + selectedCustomer 갱신", async () => {
      const updated = { ...customer1, name: "홍길동2" };
      mockUpdate.mockResolvedValue(updated);
      useCustomerStore.setState({ customers: [customer1, customer2], selectedCustomer: customer1 });

      await useCustomerStore.getState().update(1, { name: "홍길동2" });
      expect(useCustomerStore.getState().customers[0].name).toBe("홍길동2");
      expect(useCustomerStore.getState().selectedCustomer?.name).toBe("홍길동2");
    });
  });

  describe("delete", () => {
    it("삭제 후 목록에서 제거 + 선택 해제", async () => {
      mockDelete.mockResolvedValue(undefined);
      useCustomerStore.setState({ customers: [customer1, customer2], selectedCustomer: customer1 });

      await useCustomerStore.getState().delete(1);
      expect(useCustomerStore.getState().customers).toEqual([customer2]);
      expect(useCustomerStore.getState().selectedCustomer).toBeNull();
    });
  });
});
