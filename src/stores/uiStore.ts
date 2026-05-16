import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { DateRange, PresetId } from "@/pages/sales/salesUtils";

interface UIStore {
  salesPage: {
    activeTab: "summary" | "transactions" | "unpaid";
    summary: {
      period: PresetId;
      customRange: DateRange | null;
      search: string;
      rightTab: "payments" | "receptions";
    };
    transactions: {
      period: PresetId;
      customRange: DateRange | null;
      search: string;
    };
  };
  setSalesPageTab: (tab: "summary" | "transactions" | "unpaid") => void;
  setSummaryState: (state: Partial<UIStore["salesPage"]["summary"]>) => void;
  setTransactionsState: (state: Partial<UIStore["salesPage"]["transactions"]>) => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      salesPage: {
        activeTab: "summary",
        summary: {
          period: "today",
          customRange: null,
          search: "",
          rightTab: "payments",
        },
        transactions: {
          period: "today",
          customRange: null,
          search: "",
        },
      },
      setSalesPageTab: (activeTab) =>
        set((state) => ({ salesPage: { ...state.salesPage, activeTab } })),
      setSummaryState: (summary) =>
        set((state) => ({
          salesPage: {
            ...state.salesPage,
            summary: { ...state.salesPage.summary, ...summary },
          },
        })),
      setTransactionsState: (transactions) =>
        set((state) => ({
          salesPage: {
            ...state.salesPage,
            transactions: { ...state.salesPage.transactions, ...transactions },
          },
        })),
    }),
    {
      name: "daolly-ui-state",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
