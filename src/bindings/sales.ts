import { invoke } from "@tauri-apps/api/core";
import type { SalesRecord, UnpaidRecord, ChartDay, TopItem, RevenueSummary, PaymentRecord } from "@/types";

export const salesApi = {
  getRevenueSummary(from?: string, to?: string): Promise<RevenueSummary> {
    return invoke("get_revenue_summary", { from: from ?? null, to: to ?? null });
  },

  listPaymentRecords(from?: string, to?: string): Promise<PaymentRecord[]> {
    return invoke("list_payment_records", { from: from ?? null, to: to ?? null });
  },

  listSalesRecords(from?: string, to?: string): Promise<SalesRecord[]> {
    return invoke("list_sales_records", { from: from ?? null, to: to ?? null });
  },

  listUnpaidRecords(): Promise<UnpaidRecord[]> {
    return invoke("list_unpaid_records");
  },

  listWeeklyChart(): Promise<ChartDay[]> {
    return invoke("list_weekly_chart");
  },

  listTopItems(from?: string, to?: string): Promise<TopItem[]> {
    return invoke("list_top_items", { from: from ?? null, to: to ?? null });
  },
};
