import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCartStore } from "@/stores/cartStore";

vi.mock("@/bindings", () => ({
  workItemApi: {
    receive: vi.fn(),
  },
}));

import { workItemApi } from "@/bindings";
import type { WorkItemFull } from "@/types";

const mockReceive = vi.mocked(workItemApi.receive);

const receipt: WorkItemFull = {
  id: 1, customerId: 1, status: "Received", description: "와이셔츠, 바지", price: 7000, paidAmount: 7000, note: "급행",
  receivedAt: "", completedAt: null, pickedUpAt: null, createdAt: "", lastModifiedAt: "", details: [], payments: [],
};

function resetStore() {
  useCartStore.setState({ customerId: null, items: [], requestId: null });
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

  describe("updateItem", () => {
    it("단가 및 메모 동시 변경", () => {
      useCartStore.getState().addItem(sampleItem);
      useCartStore.getState().updateItem(0, { unitPrice: 5000, optionsMemo: "특수" });
      const item = useCartStore.getState().items[0];
      expect(item.unitPrice).toBe(5000);
      expect(item.optionsMemo).toBe("특수");
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
    function fillCart() {
      useCartStore.setState({ customerId: 1 });
      useCartStore.getState().addItem(sampleItem);
      useCartStore.getState().addItem({ priceItemId: 2, name: "바지", unitPrice: 4000 });
    }

    it("고객 미선택 시 에러", async () => {
      useCartStore.getState().addItem(sampleItem);
      await expect(useCartStore.getState().submit("card")).rejects.toThrow("고객을 먼저 선택해 주세요.");
    });

    it("빈 카트 시 에러", async () => {
      useCartStore.setState({ customerId: 1 });
      await expect(useCartStore.getState().submit("card")).rejects.toThrow("접수할 품목이 없습니다.");
    });

    it("접수와 결제를 한 번에 요청하고 카트 초기화 (총액은 서버가 계산)", async () => {
      mockReceive.mockResolvedValue(receipt);
      fillCart();

      const result = await useCartStore.getState().submit("card", "급행");

      expect(mockReceive).toHaveBeenCalledTimes(1);
      expect(mockReceive).toHaveBeenCalledWith({
        requestId: expect.any(String),
        customerId: 1,
        note: "급행",
        lines: [
          { itemName: "와이셔츠", unitPrice: 3000, quantity: 1, priceItemId: 1, optionsMemo: null },
          { itemName: "바지", unitPrice: 4000, quantity: 1, priceItemId: 2, optionsMemo: null },
        ],
        payment: { method: "card" },
      });
      expect(result).toEqual(receipt);
      // 아이템만 초기화, 고객은 유지 (접수 후 동일 고객 연속 접수 지원)
      expect(useCartStore.getState().items).toHaveLength(0);
      expect(useCartStore.getState().customerId).toBe(1);
      expect(useCartStore.getState().requestId).toBeNull();
    });

    it("외상이면 결제 없이 접수", async () => {
      mockReceive.mockResolvedValue(receipt);
      fillCart();

      await useCartStore.getState().submit("credit");
      expect(mockReceive.mock.calls[0][0].payment).toBeNull();
    });

    it("결과를 받기 전에 다시 누르면 요청을 한 번만 보냄", async () => {
      let resolve!: (r: WorkItemFull) => void;
      mockReceive.mockReturnValue(new Promise((r) => { resolve = r; }));
      fillCart();

      const first = useCartStore.getState().submit("cash");
      const second = useCartStore.getState().submit("cash");
      resolve(receipt);

      await expect(first).resolves.toEqual(receipt);
      await expect(second).resolves.toEqual(receipt);
      expect(mockReceive).toHaveBeenCalledTimes(1);
    });

    it("실패 후 다시 보내면 같은 요청 ID를 쓰고, 장바구니가 바뀌면 새 ID를 씀", async () => {
      mockReceive.mockRejectedValueOnce({ code: "BUSY", message: "잠시 후 다시 시도해 주세요." });
      fillCart();

      await expect(useCartStore.getState().submit("cash")).rejects.toEqual(
        expect.objectContaining({ code: "BUSY" }),
      );
      mockReceive.mockRejectedValueOnce({ code: "BUSY", message: "잠시 후 다시 시도해 주세요." });
      await expect(useCartStore.getState().submit("cash")).rejects.toBeTruthy();
      const [first, retry] = mockReceive.mock.calls.map((c) => c[0].requestId);
      expect(retry).toBe(first);

      useCartStore.getState().updateQuantity(0, 2);
      mockReceive.mockResolvedValueOnce(receipt);
      await useCartStore.getState().submit("cash");
      expect(mockReceive.mock.calls[2][0].requestId).not.toBe(first);
    });
  });

  describe("clear", () => {
    it("모든 상태 초기화", () => {
      useCartStore.setState({ customerId: 5, items: [{ ...sampleItem, uid: "test-uid", quantity: 1, optionsMemo: "" }] });
      useCartStore.getState().clear();
      expect(useCartStore.getState().customerId).toBeNull();
      expect(useCartStore.getState().items).toHaveLength(0);
    });
  });

  describe("setCustomer", () => {
    it("고객 ID가 변경되면 장바구니를 비움", () => {
      useCartStore.setState({ 
        customerId: 1, 
        items: [{ ...sampleItem, uid: "test-uid", quantity: 1, optionsMemo: "" }] 
      });
      
      useCartStore.getState().setCustomer(2);
      
      expect(useCartStore.getState().customerId).toBe(2);
      expect(useCartStore.getState().items).toHaveLength(0);
    });

    it("동일한 고객 ID면 장바구니를 유지함", () => {
      const items = [{ ...sampleItem, uid: "test-uid", quantity: 1, optionsMemo: "" }];
      useCartStore.setState({ customerId: 1, items });
      
      useCartStore.getState().setCustomer(1);
      
      expect(useCartStore.getState().customerId).toBe(1);
      expect(useCartStore.getState().items).toEqual(items);
    });

    it("고객 선택 해제 시에도 장바구니를 비움", () => {
      useCartStore.setState({ 
        customerId: 1, 
        items: [{ ...sampleItem, uid: "test-uid", quantity: 1, optionsMemo: "" }] 
      });
      
      useCartStore.getState().setCustomer(null);
      
      expect(useCartStore.getState().customerId).toBeNull();
      expect(useCartStore.getState().items).toHaveLength(0);
    });
  });
});
