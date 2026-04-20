import { invoke } from "@tauri-apps/api/core";
import type { Payment, CreatePayment } from "@/types";

export const paymentApi = {
  list(workItemId: number): Promise<Payment[]> {
    return invoke("list_payments", { workItemId });
  },

  create(data: CreatePayment): Promise<Payment> {
    return invoke("create_payment", { data });
  },

  delete(id: number): Promise<void> {
    return invoke("delete_payment", { id });
  },
};
