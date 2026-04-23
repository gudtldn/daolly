import { invoke } from "@tauri-apps/api/core";
import type { Customer, CreateCustomer, UpdateCustomer } from "@/types";

export const customerApi = {
  list(search?: string | null): Promise<Customer[]> {
    return invoke("list_customers", {
      search: search ?? null,
    });
  },

  get(id: number): Promise<Customer> {
    return invoke("get_customer", { id });
  },

  create(data: CreateCustomer): Promise<Customer> {
    return invoke("create_customer", { data });
  },

  update(id: number, data: UpdateCustomer): Promise<Customer> {
    return invoke("update_customer", { id, data });
  },

  delete(id: number): Promise<void> {
    return invoke("delete_customer", { id });
  },
};
