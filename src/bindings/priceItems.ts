import { invoke } from "@tauri-apps/api/core";
import type { PriceItem, CreatePriceItem, UpdatePriceItem } from "@/types";

export const priceItemApi = {
  list(categoryId?: number | null): Promise<PriceItem[]> {
    return invoke("list_price_items", { categoryId: categoryId ?? null });
  },

  create(data: CreatePriceItem): Promise<PriceItem> {
    return invoke("create_price_item", { data });
  },

  update(id: number, data: UpdatePriceItem): Promise<PriceItem> {
    return invoke("update_price_item", { id, data });
  },

  delete(id: number): Promise<void> {
    return invoke("delete_price_item", { id });
  },
};
