import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCartStore } from "@/stores/cartStore";

vi.mock("@/bindings", () => ({
  workItemApi: {
    create: vi.fn(),
  },
  paymentApi: {
    create: vi.fn(),
  },
}));

import { workItemApi } from "@/bindings";

const mockCreate = vi.mocked(workItemApi.create);

function resetStore() {
  useCartStore.setState({ customerId: null, items: [] });
}

const sampleItem = { priceItemId: 1, name: "와이셔츠", unitPrice: 3000 };

describe("cartStore", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  describe("addItem", () => {
    it("새 품목을 추가하면 quantity 1로 설정", () => {
      useCartStore.getState().addItem(sampleItem);
      const items = useCartStore.getState().items;
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ ...sampleItem, quantity: 1, optionsMemo: "" });
    });

    it("동일 품목 추가 시 수량 합산", () => {
      useCartStore.getState().addItem(sampleItem);
      useCartStore.getState().addItem(sampleItem);
      const items = useCartStore.getState().items;
      expect(items).toHaveLength(1);
      expect(items[0].quantity).toBe(2);
    });

    it("다른 품목은 별도 행으로 추가", () => {
      useCartStore.getState().addItem(sampleItem);
      useCartStore.getState().addItem({ priceItemId: 2, name: "바지", unitPrice: 4000 });
      expect(useCartStore.getState().items).toHaveLength(2);
    });
  });

  describe("removeItem", () => {
    it("인덱스로 품목 제거", () => {
      useCartStore.getState().addItem(sampleItem);
      useCartStore.getState().addItem({ priceItemId: 2, name: "바지", unitPrice: 4000 });
      useCartStore.getState().removeItem(0);
      const items = useCartStore.getState().items;
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe("바지");
    });
  });

  describe("updateQuantity", () => {
    it("특정 인덱스 수량 변경", () => {
      useCartStore.getState().addItem(sampleItem);
      useCartStore.getState().updateQuantity(0, 5);
      expect(useCartStore.getState().items[0].quantity).toBe(5);
    });
  });

  describe("totalPrice", () => {
    it("단가 * 수량 합계 반환", () => {
      useCartStore.getState().addItem(sampleItem);
      useCartStore.getState().addItem({ priceItemId: 2, name: "바지", unitPrice: 4000 });
      useCartStore.getState().updateQuantity(0, 2);
      // 3000*2 + 4000*1 = 10000
      expect(useCartStore.getState().totalPrice()).toBe(10000);
    });

    it("빈 카트는 0 반환", () => {
      expect(useCartStore.getState().totalPrice()).toBe(0);
    });
  });

  describe("submit", () => {
    it("고객 미선택 시 에러", async () => {
      useCartStore.getState().addItem(sampleItem);
      await expect(useCartStore.getState().submit("card")).rejects.toThrow(
        "Customer is not selected",
      );
    });

    it("빈 카트 시 에러", async () => {
      useCartStore.setState({ customerId: 1 });
      await expect(useCartStore.getState().submit("card")).rejects.toThrow("Cart is empty");
    });

    it("성공 시 API 호출 + 카트 초기화", async () => {
      const mockWorkItem = { id: 1, customerId: 1, status: "Received" as const, description: null, price: 7000, paidAmount: 0, note: null, receivedAt: "", completedAt: null, pickedUpAt: null, createdAt: "", lastModifiedAt: "" };
      mockCreate.mockResolvedValue(mockWorkItem);

      useCartStore.setState({ customerId: 1 });
      useCartStore.getState().addItem(sampleItem);
      useCartStore.getState().addItem({ priceItemId: 2, name: "바지", unitPrice: 4000 });

      const result = await useCartStore.getState().submit("card", "급행");

      expect(mockCreate).toHaveBeenCalledWith({
        customerId: 1,
        price: 7000,
        note: "급행",
        details: [
          { itemName: "와이셔츠", unitPrice: 3000, quantity: 1, priceItemId: 1, optionsMemo: null },
          { itemName: "바지", unitPrice: 4000, quantity: 1, priceItemId: 2, optionsMemo: null },
        ],
      });
      expect(result).toEqual(mockWorkItem);
      // 카트 초기화 확인
      expect(useCartStore.getState().items).toHaveLength(0);
      expect(useCartStore.getState().customerId).toBeNull();
    });
  });

  describe("clear", () => {
    it("모든 상태 초기화", () => {
      useCartStore.setState({ customerId: 5, items: [{ ...sampleItem, quantity: 1, optionsMemo: "" }] });
      useCartStore.getState().clear();
      expect(useCartStore.getState().customerId).toBeNull();
      expect(useCartStore.getState().items).toHaveLength(0);
    });
  });
});
