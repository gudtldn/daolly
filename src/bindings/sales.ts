import { invoke } from "@tauri-apps/api/core";
import type { SalesRecord, UnpaidRecord, ChartDay, TopItem } from "@/types";

export const salesApi = {
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
