import { useState, useEffect, useCallback } from "react";
import { Receipt, Search } from "lucide-react";
import { DateRangePicker } from "@/pages/sales/DateRangePicker";
import { salesApi } from "@/bindings/sales";
import type { SalesRecord } from "@/types";
import {
  DateRange,
  PERIODS,
  PresetId,
  getDateRange,
  PaymentMethodBadge,
} from "@/pages/sales/salesUtils";

// ============================================================
// TransactionsTab
// ============================================================
export function TransactionsTab() {
  const [period, setPeriod] = useState<PresetId>("today");
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [search, setSearch] = useState("");
  const [records, setRecords] = useState<SalesRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const activeRange = customRange ?? getDateRange(period);

  const loadRecords = useCallback(async () => {
    try {
      setError(null);
      const data = await salesApi.listSalesRecords(activeRange.from, activeRange.to);
      setRecords(data);
    } catch (e) {
      setError("데이터를 불러오는 중 오류가 발생했습니다.");
      console.error(e);
    }
  }, [activeRange.from, activeRange.to]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const filtered = records.filter(
    (r) =>
      !search ||
      r.customerName.includes(search) ||
      (r.description ?? "").includes(search)
  );

  // Exclude credit items from the total amount.
  const totalAmount = filtered
    .filter((r) => r.paymentMethod !== null)
    .reduce((sum, r) => sum + r.price, 0);

  function toDateTimeStr(iso: string): { date: string; time: string } {
    try {
      const d = new Date(iso);
      return {
        date: d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\. /g, "-").replace(".", ""),
        time: d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }),
      };
    } catch {
      return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
    }
  }

  return (
    <div className="h-full flex flex-col gap-4 min-h-0">      {error && (
        <div className="shrink-0 px-4 py-2.5 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm dark:bg-danger-950/30 dark:border-danger-900/40 dark:text-danger-400">
          {error}
        </div>
      )}      {/* 컨트롤 바 */}
      <div className="flex items-center justify-between bg-surface-card border border-border-default p-3 rounded-lg shadow-sm shrink-0">
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 bg-surface-elevated p-1 rounded-md border border-border-default transition-opacity ${customRange ? "opacity-40 pointer-events-none" : ""}`}>
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-4 py-1.5 text-sm font-semibold rounded transition-colors cursor-pointer ${
                  period === p.id && !customRange
                    ? "bg-surface-card text-primary-600 border border-border-default shadow-sm dark:text-primary-400 dark:bg-surface-elevated"
                    : "text-on-surface-muted hover:text-on-surface"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-border-default mx-1" />
          <DateRangePicker
            value={customRange}
            onApply={(range) => setCustomRange(range)}
            onClear={() => setCustomRange(null)}
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-on-surface-muted">
            합계:{" "}
            <span className="text-primary-600 font-extrabold dark:text-primary-400">
              {totalAmount.toLocaleString()}원
            </span>
          </span>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-secondary-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="고객명 / 품목 검색..."
              className="pl-7 pr-3 py-1.5 text-sm border border-border-default rounded bg-surface-card text-on-surface placeholder:text-on-surface-muted focus:outline-none focus:border-primary-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* 거래 내역 테이블 */}
      <div className="flex-1 bg-surface-card border border-border-default rounded-lg shadow-sm flex flex-col overflow-hidden min-h-0">
        <div className="px-4 py-3 bg-surface-elevated border-b border-border-default shrink-0 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-on-surface-muted" />
          <h3 className="text-sm font-bold text-on-surface">상세 결제 내역</h3>
          <span className="ml-auto text-xs text-on-surface-muted">{filtered.length}건</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-surface-elevated sticky top-0 border-b border-border-default z-10">
              <tr>
                <th className="px-4 py-2.5 text-xs font-semibold text-on-surface-muted w-28">날짜</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-on-surface-muted w-14">시간</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-on-surface-muted w-28">고객명</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-on-surface-muted">결제 내용</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-on-surface-muted text-center w-24">결제 수단</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-on-surface-muted text-right w-28">금액</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-on-surface-muted text-sm">
                    거래 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const { date, time } = toDateTimeStr(r.receivedAt);
                  return (
                    <tr key={r.workItemId} className="hover:bg-surface-elevated transition-colors">
                      <td className="px-4 py-3 text-xs text-on-surface-muted">{date}</td>
                      <td className="px-4 py-3 font-mono text-xs text-on-surface-muted">{time}</td>
                      <td className="px-4 py-3 font-semibold text-on-surface">{r.customerName}</td>
                      <td className="px-4 py-3 text-on-surface">{r.description ?? "-"}</td>
                      <td className="px-4 py-3 text-center">
                        <PaymentMethodBadge method={r.paymentMethod ?? "credit"} />
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-on-surface">
                        {r.price.toLocaleString()}원
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
