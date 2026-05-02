import { describe, it, expect, vi, beforeEach } from "vitest";
import { usePriceStore } from "@/stores/priceStore";
import type { Category, PriceItem } from "@/types";

vi.mock("@/bindings", () => ({
  categoryApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  priceItemApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  priceOptionApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  priceSettingsApi: {
    exportToFile: vi.fn(),
    importFromFile: vi.fn(),
  },
}));

import { categoryApi, priceItemApi, priceOptionApi, priceSettingsApi } from "@/bindings";

const mockCatList = vi.mocked(categoryApi.list);
const mockCatCreate = vi.mocked(categoryApi.create);
const mockCatDelete = vi.mocked(categoryApi.delete);
const mockPriceList = vi.mocked(priceItemApi.list);
const mockPriceCreate = vi.mocked(priceItemApi.create);
const mockPriceDelete = vi.mocked(priceItemApi.delete);
const mockOptList = vi.mocked(priceOptionApi.list);
const mockExport = vi.mocked(priceSettingsApi.exportToFile);
const mockImport = vi.mocked(priceSettingsApi.importFromFile);

const cat1: Category = { id: 1, name: "상의", sortOrder: 1 };
const cat2: Category = { id: 2, name: "하의", sortOrder: 2 };
const price1: PriceItem = { id: 1, categoryId: 1, name: "와이셔츠", defaultPrice: 3000, sortOrder: 1 };

function resetStore() {
  usePriceStore.setState({
    categories: [],
    priceItems: [],
    selectedCategoryId: null,
    isLoading: false,
  });
}

describe("priceStore", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  describe("loadCategories", () => {
    it("카테고리 목록 로드", async () => {
      mockCatList.mockResolvedValue([cat1, cat2]);
      await usePriceStore.getState().loadCategories();
      expect(usePriceStore.getState().categories).toEqual([cat1, cat2]);
    });
  });

  describe("selectCategory", () => {
    it("선택 후 해당 카테고리 품목 로드", async () => {
      mockPriceList.mockResolvedValue([price1]);
      await usePriceStore.getState().selectCategory(1);
      expect(usePriceStore.getState().selectedCategoryId).toBe(1);
      expect(mockPriceList).toHaveBeenCalledWith(1);
      expect(usePriceStore.getState().priceItems).toEqual([price1]);
    });
  });

  describe("loadPriceItems", () => {
    it("API 에러 시 isLoading 복구", async () => {
      mockPriceList.mockRejectedValue(new Error("fail"));
      await expect(usePriceStore.getState().loadPriceItems(1)).rejects.toThrow();
      expect(usePriceStore.getState().isLoading).toBe(false);
    });
  });

  describe("createCategory", () => {
    it("생성 후 카테고리 목록에 추가", async () => {
      mockCatCreate.mockResolvedValue(cat1);
      usePriceStore.setState({ categories: [cat2] });

      await usePriceStore.getState().createCategory({ name: "상의", sortOrder: 1 });
      expect(usePriceStore.getState().categories).toContainEqual(cat1);
    });
  });

  describe("deleteCategory", () => {
    it("삭제된 카테고리가 선택 중이면 선택 해제", async () => {
      mockCatDelete.mockResolvedValue(undefined);
      usePriceStore.setState({ categories: [cat1, cat2], selectedCategoryId: 1 });

      await usePriceStore.getState().deleteCategory(1);
      expect(usePriceStore.getState().categories).toEqual([cat2]);
      expect(usePriceStore.getState().selectedCategoryId).toBeNull();
    });
  });

  describe("deletePriceItem", () => {
    it("삭제 후 목록에서 제거", async () => {
      mockPriceDelete.mockResolvedValue(undefined);
      const price2: PriceItem = { id: 2, categoryId: 1, name: "바지", defaultPrice: 4000, sortOrder: 2 };
      usePriceStore.setState({ priceItems: [price1, price2] });

      await usePriceStore.getState().deletePriceItem(1);
      expect(usePriceStore.getState().priceItems).toEqual([price2]);
    });
  });

  describe("createPriceItem", () => {
    it("생성 후 목록에 추가", async () => {
      mockPriceCreate.mockResolvedValue(price1);
      await usePriceStore.getState().createPriceItem({ categoryId: 1, name: "와이셔츠", defaultPrice: 3000, sortOrder: 1 });
      expect(usePriceStore.getState().priceItems).toContainEqual(price1);
    });
  });

  describe("import/export", () => {
    it("exportSettings calls API", async () => {
      mockExport.mockResolvedValue(undefined);
      await usePriceStore.getState().exportSettings("test.json");
      expect(mockExport).toHaveBeenCalledWith("test.json");
    });

    it("importSettings calls API and reloads", async () => {
      mockImport.mockResolvedValue(undefined);
      mockCatList.mockResolvedValue([cat1]);
      mockOptList.mockResolvedValue([]);

      await usePriceStore.getState().importSettings("test.json");

      expect(mockImport).toHaveBeenCalledWith("test.json");
      expect(mockCatList).toHaveBeenCalled();
      expect(mockOptList).toHaveBeenCalled();
      expect(usePriceStore.getState().selectedCategoryId).toBeNull();
    });

    it("importSettings handles error", async () => {
      mockImport.mockRejectedValue(new Error("fail"));
      await expect(usePriceStore.getState().importSettings("test.json")).rejects.toThrow();
      expect(usePriceStore.getState().isLoading).toBe(false);
    });
  });
  });
