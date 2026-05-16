import { create } from "zustand";
import type {
  Category,
  PriceItem,
  CreateCategory,
  UpdateCategory,
  CreatePriceItem,
  UpdatePriceItem,
} from "@/types";
import { categoryApi, priceItemApi, priceSettingsApi } from "@/bindings";

interface PriceState {
  categories: Category[];
  priceItems: PriceItem[];
  selectedCategoryId: number | null;
  isLoading: boolean;
}

interface PriceActions {
  loadCategories: () => Promise<void>;
  loadPriceItems: (categoryId?: number | null) => Promise<void>;
  selectCategory: (id: number | null) => void;
  createCategory: (data: CreateCategory) => Promise<Category>;
  updateCategory: (id: number, data: UpdateCategory) => Promise<Category>;
  deleteCategory: (id: number) => Promise<void>;
  reorderCategories: (reordered: Category[]) => void;
  createPriceItem: (data: CreatePriceItem) => Promise<PriceItem>;
  updatePriceItem: (id: number, data: UpdatePriceItem) => Promise<PriceItem>;
  deletePriceItem: (id: number) => Promise<void>;
  reorderPriceItems: (categoryId: number, reordered: PriceItem[]) => void;
  exportSettings: (path: string) => Promise<void>;
  importSettings: (path: string) => Promise<void>;
}

type PriceStore = PriceState & PriceActions;

export const usePriceStore = create<PriceStore>((set, get) => ({
  categories: [],
  priceItems: [],
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

  exportSettings: async (path) => {
    await priceSettingsApi.exportToFile(path);
  },

  importSettings: async (path) => {
    set({ isLoading: true });
    try {
      await priceSettingsApi.importFromFile(path);
      await get().loadCategories();
      set({ selectedCategoryId: null, priceItems: [] });
    } finally {
      set({ isLoading: false });
    }
  },
}));
