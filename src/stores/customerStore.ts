import { create } from "zustand";
import type { Customer, CreateCustomer, UpdateCustomer } from "@/types";
import { customerApi, workItemApi } from "@/bindings";

interface CustomerState {
  customers: Customer[];
  selectedCustomer: Customer | null;
  isLoading: boolean;
  unpaidMap: Record<number, number>;
  page: number;
  hasMore: boolean;
  searchKeyword: string | null;
}

interface CustomerActions {
  load: (search?: string | null) => Promise<void>;
  loadMore: () => Promise<void>;
  select: (customer: Customer | null) => void;
  create: (data: CreateCustomer) => Promise<Customer>;
  update: (id: number, data: UpdateCustomer) => Promise<Customer>;
  delete: (id: number) => Promise<void>;
  loadUnpaid: () => Promise<void>;
}

type CustomerStore = CustomerState & CustomerActions;

export const useCustomerStore = create<CustomerStore>((set, get) => ({
  customers: [],
  selectedCustomer: null,
  isLoading: false,
  unpaidMap: {},
  page: 1,
  hasMore: true,
  searchKeyword: null,

  load: async (search) => {
    set({ isLoading: true, searchKeyword: search ?? null, page: 1, hasMore: true });
    try {
      const customers = await customerApi.list(search ?? null, 1, 50);
      set({ customers, hasMore: customers.length === 50 });
    } finally {
      set({ isLoading: false });
    }
  },

  loadMore: async () => {
    const { isLoading, hasMore, page, searchKeyword, customers } = get();
    if (isLoading || !hasMore) return;

    set({ isLoading: true });
    try {
      const nextPage = page + 1;
      const newCustomers = await customerApi.list(searchKeyword, nextPage, 50);
      set({
        customers: [...customers, ...newCustomers],
        page: nextPage,
        hasMore: newCustomers.length === 50,
      });
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
