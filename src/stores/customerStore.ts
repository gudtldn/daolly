import { create } from "zustand";
import type { Customer, CreateCustomer, UpdateCustomer } from "@/types";
import { customerApi } from "@/bindings";

interface CustomerState {
  customers: Customer[];
  selectedCustomer: Customer | null;
  searchText: string;
  isLoading: boolean;
}

interface CustomerActions {
  load: () => Promise<void>;
  search: (keyword: string) => Promise<void>;
  select: (customer: Customer | null) => void;
  create: (data: CreateCustomer) => Promise<Customer>;
  update: (id: number, data: UpdateCustomer) => Promise<Customer>;
  delete: (id: number) => Promise<void>;
}

type CustomerStore = CustomerState & CustomerActions;

export const useCustomerStore = create<CustomerStore>((set, get) => ({
  customers: [],
  selectedCustomer: null,
  searchText: "",
  isLoading: false,

  load: async () => {
    set({ isLoading: true });
    try {
      const customers = await customerApi.list(get().searchText || null);
      set({ customers });
    } finally {
      set({ isLoading: false });
    }
  },

  search: async (keyword) => {
    set({ searchText: keyword, isLoading: true });
    try {
      const customers = await customerApi.list(keyword || null);
      set({ customers });
    } finally {
      set({ isLoading: false });
    }
  },

  select: (customer) => set({ selectedCustomer: customer }),

  create: async (data) => {
    const customer = await customerApi.create(data);
    set((s) => ({ customers: [...s.customers, customer] }));
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
}));
