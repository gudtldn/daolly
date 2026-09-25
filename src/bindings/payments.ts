import { invoke } from "@tauri-apps/api/core";
import type { Payment, CreatePayment, UpdatePayment, CreditPayment } from "@/types";

export const paymentApi = {
  list(workItemId: number): Promise<Payment[]> {
    return invoke("list_payments", { workItemId });
  },

  create(data: CreatePayment): Promise<Payment> {
    return invoke("create_payment", { data });
  },

  update(id: number, data: UpdatePayment): Promise<Payment> {
    return invoke("update_payment", { id, data });
  },

  delete(id: number): Promise<void> {
    return invoke("delete_payment", { id });
  },

  /** 예전 버전에서 '외상'으로 등록한 결제 (데이터 점검용) */
  listCredit(): Promise<CreditPayment[]> {
    return invoke("list_credit_payments");
  },
};
