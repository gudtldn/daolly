import { create } from "zustand";
import type { Customer, CreateCustomer, UpdateCustomer } from "@/types";
import { customerApi, workItemApi } from "@/bindings";

interface CustomerState {
  customers: Customer[];
  selectedCustomer: Customer | null;
  isLoading: boolean;
  unpaidMap: Record<number, number>;
}

interface CustomerActions {
  load: (search?: string | null) => Promise<void>;
  select: (customer: Customer | null) => void;
  create: (data: CreateCustomer) => Promise<Customer>;
  update: (id: number, data: UpdateCustomer) => Promise<Customer>;
  delete: (id: number) => Promise<void>;
  loadUnpaid: () => Promise<void>;
}

type CustomerStore = CustomerState & CustomerActions;

export const useCustomerStore = create<CustomerStore>((set) => ({
  customers: [],
  selectedCustomer: null,
  isLoading: false,
  unpaidMap: {},

  load: async (search) => {
    set({ isLoading: true });
    try {
      const customers = await customerApi.list(search ?? null);
      set({ customers });
    } finally {
      set({ isLoading: false });
    }
  },

  select: (customer) => set({ selectedCustomer: customer }),

  create: async (data) => {
    const customer = await customerApi.create(data);
    set((s) => ({
      customers: [...s.customers, customer].sort((a, b) =>
        a.name.localeCompare(b.name, 'ko')
      ),
    }));
    return customer;
  },

  update: async (id, data) => {
    const updated = await customerApi.update(id, data);
    set((s) => ({
      customers: s.customers.map((c) => (c.id === id ? updated : c)),
      selectedCustomer: s.selectedCustomer?.id === id ? updated : s.selectedCustomer,
    }));
    return updated;
  },

  delete: async (id) => {
    await customerApi.delete(id);
    set((s) => ({
      customers: s.customers.filter((c) => c.id !== id),
      selectedCustomer: s.selectedCustomer?.id === id ? null : s.selectedCustomer,
    }));
  },

  loadUnpaid: async () => {
    const unpaidMap = await workItemApi.getAllUnpaidAmounts();
    set({ unpaidMap });
  },
}));
