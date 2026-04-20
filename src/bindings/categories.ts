import { invoke } from "@tauri-apps/api/core";
import type { Category, CreateCategory, UpdateCategory } from "@/types";

export const categoryApi = {
  list(): Promise<Category[]> {
    return invoke("list_categories");
  },

  create(data: CreateCategory): Promise<Category> {
    return invoke("create_category", { data });
  },

  update(id: number, data: UpdateCategory): Promise<Category> {
    return invoke("update_category", { id, data });
  },

  delete(id: number): Promise<void> {
    return invoke("delete_category", { id });
  },
};
