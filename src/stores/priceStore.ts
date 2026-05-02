import { create } from "zustand";
import type {
  Category,
  PriceItem,
  PriceOption,
  CreateCategory,
  UpdateCategory,
  CreatePriceItem,
  UpdatePriceItem,
  CreatePriceOption,
  UpdatePriceOption,
} from "@/types";
import { categoryApi, priceItemApi, priceOptionApi, priceSettingsApi } from "@/bindings";

interface PriceState {
  categories: Category[];
  priceItems: PriceItem[];
  priceOptions: PriceOption[];
  selectedCategoryId: number | null;
  isLoading: boolean;
}

interface PriceActions {
  loadCategories: () => Promise<void>;
  loadPriceItems: (categoryId?: number | null) => Promise<void>;
  loadPriceOptions: () => Promise<void>;
  selectCategory: (id: number | null) => void;
  createCategory: (data: CreateCategory) => Promise<Category>;
  updateCategory: (id: number, data: UpdateCategory) => Promise<Category>;
  deleteCategory: (id: number) => Promise<void>;
  reorderCategories: (reordered: Category[]) => void;
  createPriceItem: (data: CreatePriceItem) => Promise<PriceItem>;
  updatePriceItem: (id: number, data: UpdatePriceItem) => Promise<PriceItem>;
  deletePriceItem: (id: number) => Promise<void>;
  reorderPriceItems: (categoryId: number, reordered: PriceItem[]) => void;
  createPriceOption: (data: CreatePriceOption) => Promise<PriceOption>;
  updatePriceOption: (id: number, data: UpdatePriceOption) => Promise<PriceOption>;
  deletePriceOption: (id: number) => Promise<void>;
  reorderPriceOptions: (reordered: PriceOption[]) => void;
  exportSettings: (path: string) => Promise<void>;
  importSettings: (path: string) => Promise<void>;
}

type PriceStore = PriceState & PriceActions;

export const usePriceStore = create<PriceStore>((set, get) => ({
  categories: [],
  priceItems: [],
  priceOptions: [],
  selectedCategoryId: null,
  isLoading: false,

  loadCategories: async () => {
    const categories = await categoryApi.list();
    set({ categories });
  },

  loadPriceItems: async (categoryId) => {
    const id = categoryId !== undefined ? categoryId : get().selectedCategoryId;
    set({ isLoading: true });
    try {
      const priceItems = await priceItemApi.list(id);
      set({ priceItems });
    } finally {
      set({ isLoading: false });
    }
  },

  loadPriceOptions: async () => {
    const priceOptions = await priceOptionApi.list();
    set({ priceOptions });
  },

  selectCategory: (id) => {
    set({ selectedCategoryId: id });
    get().loadPriceItems(id);
  },

  createCategory: async (data) => {
    const cat = await categoryApi.create(data);
    set((s) => ({ categories: [...s.categories, cat] }));
    return cat;
  },

  updateCategory: async (id, data) => {
    const updated = await categoryApi.update(id, data);
    set((s) => ({
      categories: s.categories.map((c) => (c.id === id ? updated : c)),
    }));
    return updated;
  },

  deleteCategory: async (id) => {
    await categoryApi.delete(id);
    set((s) => ({
      categories: s.categories.filter((c) => c.id !== id),
      selectedCategoryId: s.selectedCategoryId === id ? null : s.selectedCategoryId,
    }));
  },

  reorderCategories: (reordered) => {
    set({ categories: reordered });
  },

  createPriceItem: async (data) => {
    const item = await priceItemApi.create(data);
    set((s) => ({ priceItems: [...s.priceItems, item] }));
    return item;
  },

  updatePriceItem: async (id, data) => {
    const updated = await priceItemApi.update(id, data);
    set((s) => ({
      priceItems: s.priceItems.map((p) => (p.id === id ? updated : p)),
    }));
    return updated;
  },

  deletePriceItem: async (id) => {
    await priceItemApi.delete(id);
    set((s) => ({
      priceItems: s.priceItems.filter((p) => p.id !== id),
    }));
  },

  reorderPriceItems: (categoryId, reordered) => {
    set((s) => ({
      priceItems: [
        ...s.priceItems.filter((p) => p.categoryId !== categoryId),
        ...reordered,
      ],
    }));
  },

  createPriceOption: async (data) => {
    const opt = await priceOptionApi.create(data);
    set((s) => ({ priceOptions: [...s.priceOptions, opt] }));
    return opt;
  },

  updatePriceOption: async (id, data) => {
    const updated = await priceOptionApi.update(id, data);
    set((s) => ({
      priceOptions: s.priceOptions.map((o) => (o.id === id ? updated : o)),
    }));
    return updated;
  },

  deletePriceOption: async (id) => {
    await priceOptionApi.delete(id);
    set((s) => ({
      priceOptions: s.priceOptions.filter((o) => o.id !== id),
    }));
  },

  reorderPriceOptions: (reordered) => {
    set({ priceOptions: reordered });
  },

  exportSettings: async (path) => {
    await priceSettingsApi.exportToFile(path);
  },

  importSettings: async (path) => {
    set({ isLoading: true });
    try {
      await priceSettingsApi.importFromFile(path);
      await Promise.all([get().loadCategories(), get().loadPriceOptions()]);
      set({ selectedCategoryId: null, priceItems: [] });
    } finally {
      set({ isLoading: false });
    }
  },
}));
