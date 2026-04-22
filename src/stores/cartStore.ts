import { create } from "zustand";
import type { WorkItem, DetailInput } from "@/types";
import { workItemApi, paymentApi } from "@/bindings";

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
}

interface CartActions {
  setCustomer: (id: number | null) => void;
  addItem: (item: Omit<CartItem, "uid" | "quantity" | "optionsMemo"> & { optionsMemo?: string }) => void;
  removeItem: (index: number) => void;
  updateQuantity: (index: number, quantity: number) => void;
  updateOptionsMemo: (index: number, memo: string) => void;
  clear: () => void;
  submit: (method: PaymentMethod, note?: string) => Promise<WorkItem>;
  totalPrice: () => number;
}

type CartStore = CartState & CartActions;

export const useCartStore = create<CartStore>((set, get) => ({
  customerId: null,
  items: [],

  setCustomer: (id) => set({ customerId: id }),

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
        return { items: updated };
      }
      return { items: [...s.items, { ...item, uid: crypto.randomUUID(), quantity: 1, optionsMemo: item.optionsMemo ?? "" }] };
    });
  },

  removeItem: (index) => {
    set((s) => ({ items: s.items.filter((_, i) => i !== index) }));
  },

  updateQuantity: (index, quantity) => {
    set((s) => {
      const updated = [...s.items];
      updated[index] = { ...updated[index], quantity };
      return { items: updated };
    });
  },

  updateOptionsMemo: (index, memo) => {
    set((s) => {
      const updated = [...s.items];
      updated[index] = { ...updated[index], optionsMemo: memo };
      return { items: updated };
    });
  },

  clear: () => set({ customerId: null, items: [] }),

  totalPrice: () => {
    return get().items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  },

  submit: async (method, note) => {
    const { customerId, items } = get();
    if (!customerId) throw new Error("Customer is not selected");
    if (items.length === 0) throw new Error("Cart is empty");

    const details: DetailInput[] = items.map((item) => ({
      priceItemId: item.priceItemId,
      itemName: item.name,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      optionsMemo: item.optionsMemo || null,
    }));

    const price = get().totalPrice();

    const workItem = await workItemApi.create({
      customerId,
      price,
      note: note || null,
      details,
    });

    // 외상(credit)이면 결제 기록 생성 안 함
    if (method !== "credit") {
      await paymentApi.create({
        workItemId: workItem.id,
        amount: price,
        method,
      });
    }

    get().clear();
    return workItem;
  },
}));
