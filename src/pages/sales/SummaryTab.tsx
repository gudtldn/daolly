import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  CreditCard,
  Banknote,
  Clock,
  Receipt,
  Search,
} from "lucide-react";
import { DateRangePicker } from "@/pages/sales/DateRangePicker";
import { salesApi } from "@/bindings/sales";
import type { SalesRecord, ChartDay, TopItem } from "@/types";
import {
  DateRange,
  PERIODS,
  PresetId,
  getDateRange,
  PaymentMethodBadge,
} from "@/pages/sales/salesUtils";

// ============================================================
// SummaryTab
// ============================================================
export function SummaryTab() {
  const [period, setPeriod] = useState<PresetId>("today");
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [search, setSearch] = useState("");
  const [records, setRecords] = useState<SalesRecord[]>([]);
  const [chartData, setChartData] = useState<ChartDay[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Determine the active date range from preset or custom picker.
  const activeRange = customRange ?? getDateRange(period);

  const loadRecords = useCallback(async () => {
    try {
      setError(null);
      const data = await salesApi.listSalesRecords(activeRange.from, activeRange.to);
      setRecords(data);
      salesApi
        .listTopItems(activeRange.from, activeRange.to)
        .then(setTopItems)
        .catch(console.error);
    } catch (e) {
      setError("데이터를 불러오는 중 오류가 발생했습니다.");
      console.error(e);
    }
  }, [activeRange.from, activeRange.to]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  // Weekly chart always shows the last 7 days, independent of period selection.
  useEffect(() => {
    void salesApi.listWeeklyChart().then(setChartData);
  }, []);

  // KPI derived from fetched records.
  const totalSales = records.reduce((s, r) => s + r.price, 0);
  const cardSales = records
    .filter((r) => r.paymentMethod === "card")
    .reduce((s, r) => s + r.price, 0);
  const cashTransferSales = records
    .filter((r) => r.paymentMethod === "cash" || r.paymentMethod === "transfer")
    .reduce((s, r) => s + r.price, 0);
  const unpaidSales = records
    .filter((r) => r.paymentMethod === null)
    .reduce((s, r) => s + r.price, 0);

  const cardPct = totalSales > 0 ? Math.round((cardSales / totalSales) * 100) : 0;
  const cashTransferPct = totalSales > 0 ? Math.round((cashTransferSales / totalSales) * 100) : 0;

  // Filter today's transactions for the table (search applied).
  const filteredTransactions = records.filter(
    (r) =>
      r.customerName.includes(search) ||
      (r.description ?? "").includes(search)
  );

  // Helpers for time display from ISO received_at.
  function toTimeStr(iso: string): string {
    try {
      return new Date(iso).toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      return iso.slice(11, 16);
    }
  }

  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      {error && (
        <div className="shrink-0 px-4 py-2.5 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm dark:bg-danger-950/30 dark:border-danger-900/40 dark:text-danger-400">
          {error}
        </div>
      )}
      {/* 기간 선택 바 */}
      <div className="flex items-center gap-2 bg-surface-card border border-border-default p-3 rounded-lg shadow-sm shrink-0">
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

      {/* KPI 카드 4개 */}
      <div className="grid grid-cols-4 gap-4 shrink-0">
        {/* 총 매출 */}
        <div className="bg-surface-card border border-border-default p-5 rounded-lg shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <TrendingUp className="w-14 h-14 text-primary-600" />
          </div>
          <p className="text-xs font-bold text-on-surface-muted mb-1.5">총 매출</p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-extrabold text-on-surface tracking-tight">
              {totalSales.toLocaleString()}
            </span>
            <span className="text-sm text-on-surface-muted">원</span>
          </div>
          <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-on-surface-muted">
            {records.length}건
          </div>
        </div>

        {/* 카드 */}
        <div className="bg-surface-card border border-border-default p-5 rounded-lg shadow-sm">
          <div className="flex items-center gap-1.5 mb-1.5">
            <CreditCard className="w-3.5 h-3.5 text-primary-500" />
            <p className="text-xs font-bold text-on-surface-muted">카드</p>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-on-surface">{cardSales.toLocaleString()}</span>
            <span className="text-sm text-on-surface-muted">원</span>
          </div>
          <div className="mt-3 w-full bg-secondary-100 rounded-full h-1.5 dark:bg-secondary-800">
            <div className="bg-primary-500 h-1.5 rounded-full" style={{ width: `${cardPct}%` }} />
          </div>
          <p className="text-[11px] text-on-surface-muted mt-1 text-right">전체 대비 {cardPct}%</p>
        </div>

        {/* 현금 / 이체 */}
        <div className="bg-surface-card border border-border-default p-5 rounded-lg shadow-sm">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Banknote className="w-3.5 h-3.5 text-success-500" />
            <p className="text-xs font-bold text-on-surface-muted">현금 / 이체</p>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-on-surface">{cashTransferSales.toLocaleString()}</span>
            <span className="text-sm text-on-surface-muted">원</span>
          </div>
          <div className="mt-3 w-full bg-secondary-100 rounded-full h-1.5 dark:bg-secondary-800">
            <div className="bg-success-500 h-1.5 rounded-full" style={{ width: `${cashTransferPct}%` }} />
          </div>
          <p className="text-[11px] text-on-surface-muted mt-1 text-right">전체 대비 {cashTransferPct}%</p>
        </div>

        {/* 외상 발생 */}
        <div className="bg-warning-50 border border-warning-200 p-5 rounded-lg shadow-sm dark:bg-warning-950/20 dark:border-warning-900/40">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Clock className="w-3.5 h-3.5 text-warning-600 dark:text-warning-400" />
            <p className="text-xs font-bold text-warning-700 dark:text-warning-400">외상 발생</p>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-warning-700 dark:text-warning-400">
              {unpaidSales.toLocaleString()}
            </span>
            <span className="text-sm text-warning-600/70 dark:text-warning-400/70">원</span>
          </div>
          <p className="text-[11px] text-warning-600 mt-3 dark:text-warning-400">
            * 수금 시 매출에 합산됩니다.
          </p>
        </div>
      </div>

      {/* 하단: 차트 + 거래 목록 */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* 좌측: 주간 차트 + 인기 품목 */}
        <div className="w-72 shrink-0 bg-surface-card border border-border-default rounded-lg shadow-sm flex flex-col p-4 overflow-hidden">
          <div className="flex justify-between items-center mb-4 shrink-0">
            <h3 className="text-sm font-bold text-on-surface">주간 매출 추이</h3>
            <span className="text-[11px] text-on-surface-muted bg-surface-elevated px-2 py-0.5 rounded border border-border-default">
              최근 7일
            </span>
          </div>

          {/* 막대 그래프 */}
          <div className="flex-1 flex items-end justify-between gap-1.5 relative min-h-0">
            {/* 가이드라인 */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="border-t border-border-default w-full opacity-40" />
              ))}
            </div>
            {(() => {
              const maxTotal = Math.max(...chartData.map((d) => d.total), 1);
              return chartData.map((data, i) => {
                const isToday = i === chartData.length - 1;
                const pct = Math.round((data.total / maxTotal) * 100);
                return (
                  <div key={data.date} className="flex flex-col items-center w-full h-full justify-end group z-10">
                    <div
                      className={`w-full max-w-[32px] rounded-t transition-all duration-500 ${
                        isToday
                          ? "bg-primary-600"
                          : "bg-primary-200 dark:bg-primary-900/50 hover:bg-primary-300"
                      }`}
                      style={{ height: `${pct}%`, minHeight: pct > 0 ? "4px" : "0" }}
                    />
                    <span
                      className={`text-[10px] mt-2 font-medium ${
                        isToday ? "text-primary-600 font-bold" : "text-on-surface-muted"
                      }`}
                    >
                      {data.label}
                    </span>
                  </div>
                );
              });
            })()}
          </div>

          {/* 인기 품목 */}
          <div className="mt-4 pt-3 border-t border-border-default shrink-0">
            <h4 className="text-[11px] font-bold text-on-surface-muted mb-2">많이 접수된 품목</h4>
            <div className="space-y-1.5">
              {topItems.length === 0 ? (
                <p className="text-xs text-on-surface-muted">데이터 없음</p>
              ) : (
                topItems.map((item) => (
                  <div key={item.rank} className="flex justify-between items-center text-sm">
                    <span className="text-on-surface font-medium">
                      {item.rank}. {item.itemName}
                    </span>
                    <span className="font-bold text-on-surface-muted">{item.totalQuantity}벌</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 우측: 오늘의 거래 내역 */}
        <div className="flex-1 bg-surface-card border border-border-default rounded-lg shadow-sm flex flex-col overflow-hidden">
          <div className="px-4 py-3 bg-surface-elevated border-b border-border-default flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-on-surface-muted" />
              <h3 className="text-sm font-bold text-on-surface">오늘의 거래 내역</h3>
            </div>
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

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface-elevated sticky top-0 border-b border-border-default z-10">
                <tr>
                  <th className="px-4 py-2.5 text-xs font-semibold text-on-surface-muted w-16">시간</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-on-surface-muted w-28">고객명</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-on-surface-muted">결제 내용</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-on-surface-muted text-center w-24">결제 수단</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-on-surface-muted text-right w-28">금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-on-surface-muted text-sm">
                      거래 내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((r) => (
                    <tr
                      key={r.workItemId}
                      className="hover:bg-surface-elevated transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-on-surface-muted">
                        {toTimeStr(r.receivedAt)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-on-surface">{r.customerName}</td>
                      <td className="px-4 py-3 text-on-surface">{r.description ?? "-"}</td>
                      <td className="px-4 py-3 text-center">
                        <PaymentMethodBadge method={r.paymentMethod ?? "credit"} />
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-on-surface">
                        {r.price.toLocaleString()}원
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
