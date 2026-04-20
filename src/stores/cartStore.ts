import { create } from "zustand";
import type { WorkItem, DetailInput } from "@/types";
import { workItemApi } from "@/bindings";

export interface CartItem {
  priceItemId: number;
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
  addItem: (item: Omit<CartItem, "quantity" | "optionsMemo">) => void;
  removeItem: (index: number) => void;
  updateQuantity: (index: number, quantity: number) => void;
  updateOptionsMemo: (index: number, memo: string) => void;
  clear: () => void;
  submit: (description: string, note?: string) => Promise<WorkItem>;
  totalPrice: () => number;
}

type CartStore = CartState & CartActions;

export const useCartStore = create<CartStore>((set, get) => ({
  customerId: null,
  items: [],

  setCustomer: (id) => set({ customerId: id }),

  addItem: (item) => {
    set((s) => {
      // 동일 품목이면 수량 +1
      const existing = s.items.findIndex((i) => i.priceItemId === item.priceItemId);
      if (existing >= 0) {
        const updated = [...s.items];
        updated[existing] = { ...updated[existing], quantity: updated[existing].quantity + 1 };
        return { items: updated };
      }
      return { items: [...s.items, { ...item, quantity: 1, optionsMemo: "" }] };
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

  submit: async (description, note) => {
    const { customerId, items } = get();
    if (!customerId) throw new Error("Customer is not selected");
    if (items.length === 0) throw new Error("Cart is empty");

    const details: DetailInput[] = items.map((item) => ({
      itemName: item.name,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      optionsMemo: item.optionsMemo || null,
    }));

    const price = get().totalPrice();

    const workItem = await workItemApi.create({
      customerId,
      description,
      price,
      note: note || null,
      details,
    });

    get().clear();
    return workItem;
  },
}));
