import { invoke } from "@tauri-apps/api/core";
import type { PriceOption, CreatePriceOption, UpdatePriceOption } from "@/types";

export const priceOptionApi = {
  list(): Promise<PriceOption[]> {
    return invoke("list_price_options");
  },

  create(data: CreatePriceOption): Promise<PriceOption> {
    return invoke("create_price_option", { data });
  },

  update(id: number, data: UpdatePriceOption): Promise<PriceOption> {
    return invoke("update_price_option", { id, data });
  },

  delete(id: number): Promise<void> {
    return invoke("delete_price_option", { id });
  },
};
