import { create } from "zustand";
import type { WorkItemFull, DetailInput } from "@/types";
import { workItemApi } from "@/bindings";

export type PaymentMethod = "card" | "cash" | "transfer" | "credit";

export interface CartItem {
  /** Stable unique id for React key - not persisted to DB */
  uid: string;
  /** null = 직접 입력 */
  priceItemId: number | null;
  name: string;
  unitPrice: number;
  quantity: number;
  optionsMemo: string;
}

interface CartState {
  customerId: number | null;
  items: CartItem[];
  /**
   * 지금 장바구니 내용의 접수 요청 ID. 같은 내용을 다시 보내면(두 번 누름, 실패 후 재시도)
   * 서버가 새로 접수하지 않고 처음 결과를 돌려줍니다. 내용이 바뀌면 null로 비웁니다.
   */
  requestId: string | null;
}

interface CartActions {
  setCustomer: (id: number | null) => void;
  addItem: (item: Omit<CartItem, "uid" | "quantity" | "optionsMemo"> & { optionsMemo?: string }) => void;
  removeItem: (index: number) => void;
  updateQuantity: (index: number, quantity: number) => void;
  updateOptionsMemo: (index: number, memo: string) => void;
  updateItem: (index: number, updates: Partial<CartItem>) => void;
  clear: () => void;
  clearItems: () => void;
  submit: (method: PaymentMethod, note?: string) => Promise<WorkItemFull>;
  totalPrice: () => number;
}

type CartStore = CartState & CartActions;

// 진행 중인 접수. 결과가 오기 전에 다시 누르면 같은 요청을 기다림
let pendingSubmit: Promise<WorkItemFull> | null = null;

export const useCartStore = create<CartStore>((set, get) => ({
  customerId: null,
  items: [],
  requestId: null,

  setCustomer: (id) => set((s) => {
    if (s.customerId !== id) {
      return { customerId: id, items: [], requestId: null };
    }
    return { customerId: id };
  }),

  addItem: (item) => {
    set((s) => {
      // 직접 입력(null)이면 항상 새 항목. 동일 priceItemId + optionsMemo면 수량 +1
      const existing =
        item.priceItemId !== null
          ? s.items.findIndex(
              (i) => i.priceItemId === item.priceItemId && i.optionsMemo === (item.optionsMemo ?? ""),
            )
          : -1;
      if (existing >= 0) {
        const updated = [...s.items];
        updated[existing] = { ...updated[existing], quantity: updated[existing].quantity + 1 };
        return { items: updated, requestId: null };
      }
      return {
        items: [...s.items, { ...item, uid: crypto.randomUUID(), quantity: 1, optionsMemo: item.optionsMemo ?? "" }],
        requestId: null,
      };
    });
  },

  removeItem: (index) => {
    set((s) => ({ items: s.items.filter((_, i) => i !== index), requestId: null }));
  },

  updateQuantity: (index, quantity) => {
    set((s) => {
      const updated = [...s.items];
      updated[index] = { ...updated[index], quantity };
      return { items: updated, requestId: null };
    });
  },

  updateOptionsMemo: (index, memo) => {
    set((s) => {
      const updated = [...s.items];
      updated[index] = { ...updated[index], optionsMemo: memo };
      return { items: updated, requestId: null };
    });
  },

  updateItem: (index, updates) => {
    set((s) => {
      const updated = [...s.items];
      updated[index] = { ...updated[index], ...updates };
      return { items: updated, requestId: null };
    });
  },

  clear: () => set({ customerId: null, items: [], requestId: null }),
  clearItems: () => set({ items: [], requestId: null }),

  totalPrice: () => {
    return get().items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  },

  submit: (method, note) => {
    if (pendingSubmit) return pendingSubmit;

    const { customerId, items } = get();
    if (!customerId) return Promise.reject(new Error("고객을 먼저 선택해 주세요."));
    if (items.length === 0) return Promise.reject(new Error("접수할 품목이 없습니다."));

    const requestId = get().requestId ?? crypto.randomUUID();
    set({ requestId });

    const lines: DetailInput[] = items.map((item) => ({
      priceItemId: item.priceItemId,
      itemName: item.name,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      optionsMemo: item.optionsMemo || null,
    }));

    // 접수와 결제를 한 번에 저장 (총액은 서버가 품목으로 계산). 외상이면 결제 없음
    pendingSubmit = workItemApi
      .receive({
        requestId,
        customerId,
        note: note || null,
        lines,
        payment: method === "credit" ? null : { method },
      })
      .then((receipt) => {
        get().clearItems();
        return receipt;
      })
      .finally(() => {
        pendingSubmit = null;
      });
    return pendingSubmit;
  },
}));
