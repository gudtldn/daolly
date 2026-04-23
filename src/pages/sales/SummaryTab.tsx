import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import {
  TrendingUp,
  CreditCard,
  Banknote,
  Receipt,
  Search,
  ExternalLink,
  Wallet,
  ArrowDownCircle,
  History,
} from "lucide-react";
import { DateRangePicker } from "@/pages/sales/DateRangePicker";
import { salesApi } from "@/bindings/sales";
import type { PaymentRecord, ChartDay, TopItem, RevenueSummary } from "@/types";
import { formatSmartDateTime } from "@/utils/dateUtils";
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
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PresetId>("today");
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [search, setSearch] = useState("");
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [summary, setSummary] = useState<RevenueSummary>({ totalSales: 0, actualIncome: 0 });
  const [chartData, setChartData] = useState<ChartDay[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const activeRange = useMemo(() => customRange ?? getDateRange(period), [customRange, period]);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [payments, summaryData, topItemData] = await Promise.all([
        salesApi.listPaymentRecords(activeRange.from, activeRange.to),
        salesApi.getRevenueSummary(activeRange.from, activeRange.to),
        salesApi.listTopItems(activeRange.from, activeRange.to),
      ]);
      setPaymentRecords(payments);
      setSummary(summaryData);
      setTopItems(topItemData);
    } catch (e) {
      setError("데이터를 불러오는 중 오류가 발생했습니다.");
      console.error(e);
    }
  }, [activeRange.from, activeRange.to]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void salesApi.listWeeklyChart().then(setChartData);
  }, []);

  // 수입 분석 (당일분 vs 미수분)
  const backPaymentIncome = useMemo(() => 
    paymentRecords.filter(r => r.isBackPayment).reduce((s, r) => s + r.amount, 0),
    [paymentRecords]
  );
  const currentPaymentIncome = summary.actualIncome - backPaymentIncome;

  // 카드/현금 수입 (전체)
  const cardIncome = paymentRecords.filter((r) => r.method === "card").reduce((s, r) => s + r.amount, 0);
  const cashTransferIncome = paymentRecords.filter((r) => r.method === "cash" || r.method === "transfer").reduce((s, r) => s + r.amount, 0);

  const cardPct = summary.actualIncome > 0 ? Math.round((cardIncome / summary.actualIncome) * 100) : 0;
  const cashTransferPct = summary.actualIncome > 0 ? Math.round((cashTransferIncome / summary.actualIncome) * 100) : 0;

  const periodLabel = customRange
    ? (() => {
        const from = new Date(customRange.from);
        const to = new Date(customRange.to);
        const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
        return `${fmt(from)} ~ ${fmt(to)}`;
      })()
    : (PERIODS.find((p) => p.id === period)?.label ?? "");

  const filteredPayments = paymentRecords.filter(
    (r) => r.customerName.includes(search) || (r.description ?? "").includes(search)
  );

  const handleGoToCustomer = (r: PaymentRecord) => {
    navigate("/customers", { state: { focusCustomerId: r.customerId, focusWorkItemId: r.workItemId } });
  };

  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      {error && (
        <div className="shrink-0 px-4 py-2.5 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm dark:bg-danger-950/30 dark:border-danger-900/40 dark:text-danger-400">
          {error}
        </div>
      )}

      {/* 컨트롤 바 */}
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

      {/* KPI 카드 4개 - 한눈에 들어오는 수입 구조 */}
      <div className="grid grid-cols-4 gap-4 shrink-0">
        {/* 오늘 입금된 금액 (오늘 들어온 돈 전체) */}
        <div className="bg-surface-card border border-border-default border-l-4 border-l-primary-500 p-5 rounded-xl shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <Wallet className="w-16 h-16 text-primary-600" />
          </div>
          <p className="text-sm font-bold text-on-surface-muted mb-1.5">오늘 입금된 금액</p>
          <div className="flex items-baseline gap-1">
            <h3 className="text-3xl font-extrabold text-primary-600 tracking-tight dark:text-primary-400">
              {summary.actualIncome.toLocaleString()}
            </h3>
            <span className="text-lg font-medium text-primary-600/70 dark:text-primary-400/70">원</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-on-surface-muted">당일</span>
              <span className="text-xs font-bold text-primary-600/90 dark:text-primary-400">{currentPaymentIncome.toLocaleString()}원</span>
            </div>
            <div className="w-px h-3 bg-border-default/60 self-center" />
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-on-surface-muted">미수</span>
              <span className="text-xs font-bold text-primary-600/90 dark:text-primary-400">{backPaymentIncome.toLocaleString()}원</span>
            </div>
          </div>
        </div>

        {/* 카드 수입 */}
        <div className="bg-surface-card border border-border-default p-5 rounded-lg shadow-sm">
          <div className="flex items-center gap-1.5 mb-1.5">
            <CreditCard className="w-3.5 h-3.5 text-primary-500" />
            <p className="text-xs font-bold text-on-surface-muted">카드 결제액</p>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-on-surface">{cardIncome.toLocaleString()}</span>
            <span className="text-sm text-on-surface-muted">원</span>
          </div>
          <div className="mt-3 w-full bg-secondary-100 rounded-full h-1.5 dark:bg-secondary-800">
            <div className="bg-primary-500 h-1.5 rounded-full" style={{ width: `${cardPct}%` }} />
          </div>
          <p className="text-[10px] text-on-surface-muted mt-1.5 text-right font-medium">전체 수입의 {cardPct}%</p>
        </div>

        {/* 현금 / 이체 */}
        <div className="bg-surface-card border border-border-default p-5 rounded-lg shadow-sm">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Banknote className="w-3.5 h-3.5 text-success-500" />
            <p className="text-xs font-bold text-on-surface-muted">현금 / 이체 합계</p>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-on-surface">{cashTransferIncome.toLocaleString()}</span>
            <span className="text-sm text-on-surface-muted">원</span>
          </div>
          <div className="mt-3 w-full bg-secondary-100 rounded-full h-1.5 dark:bg-secondary-800">
            <div className="bg-success-500 h-1.5 rounded-full" style={{ width: `${cashTransferPct}%` }} />
          </div>
          <p className="text-[10px] text-on-surface-muted mt-1.5 text-right font-medium">전체 수입의 {cashTransferPct}%</p>
        </div>

        {/* 총 접수 매출 (업무량) */}
        <div className="bg-surface-card border border-border-default p-5 rounded-lg shadow-sm opacity-85">
          <div className="flex items-center gap-1.5 mb-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-secondary-500" />
            <p className="text-xs font-bold text-on-surface-muted">오늘 접수한 일 (총액)</p>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-on-surface">{summary.totalSales.toLocaleString()}</span>
            <span className="text-sm text-on-surface-muted">원</span>
          </div>
          <p className="text-[10px] text-secondary-600 mt-4 dark:text-secondary-400 font-medium">
            * {paymentRecords.length}건 결제 처리됨
          </p>
        </div>
      </div>

      {/* 하단: 차트 + 결제 상세 내역 */}
      <div className="flex-1 flex gap-4 min-h-0">
        <div className="w-72 shrink-0 bg-surface-card border border-border-default rounded-lg shadow-sm flex flex-col p-4 overflow-hidden">
          <h3 className="text-sm font-bold text-on-surface mb-4 shrink-0">주간 매출 추이</h3>
          <div className="flex-1 flex items-end justify-between gap-1.5 relative min-h-0">
            {chartData.map((data, i) => {
              const isToday = i === chartData.length - 1;
              const maxTotal = Math.max(...chartData.map((d) => d.total), 1);
              const pct = Math.round((data.total / maxTotal) * 100);
              return (
                <div key={data.date} className="flex flex-col items-center w-full h-full justify-end group z-10">
                  <div className={`w-full max-w-[32px] rounded-t transition-all ${isToday ? "bg-primary-600" : "bg-primary-200 dark:bg-primary-900/50"}`} style={{ height: `${pct}%`, minHeight: pct > 0 ? "4px" : "0" }} />
                  <span className={`text-[10px] mt-2 font-medium ${isToday ? "text-primary-600 font-bold" : "text-on-surface-muted"}`}>{data.label}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-border-default shrink-0">
            <h4 className="text-[11px] font-bold text-on-surface-muted mb-2">자주 찾는 품목</h4>
            <div className="space-y-1.5">
              {topItems.length === 0 ? (
                <p className="text-xs text-on-surface-muted">데이터 없음</p>
              ) : (
                topItems.map((item) => (
                  <div key={item.rank} className="flex justify-between items-center text-sm">
                    <span className="text-on-surface font-medium">{item.rank}. {item.itemName}</span>
                    <span className="font-bold text-on-surface-muted">{item.totalQuantity}벌</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 bg-surface-card border border-border-default rounded-lg shadow-sm flex flex-col overflow-hidden">
          <div className="px-4 py-3 bg-surface-elevated border-b border-border-default flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
              <ArrowDownCircle className="w-4 h-4 text-primary-600 dark:text-primary-400" />
              <h3 className="text-sm font-bold text-on-surface">입금 상세 내역 ({periodLabel})</h3>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-secondary-400" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="고객명 검색..." className="pl-7 pr-3 py-1.5 text-sm border border-border-default rounded bg-surface-card text-on-surface placeholder:text-on-surface-muted focus:outline-none focus:border-primary-500 transition-colors" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface-elevated sticky top-0 border-b border-border-default z-10">
                <tr>
                  <th className="px-4 py-2.5 text-xs font-semibold text-on-surface-muted w-24 text-center border-r border-border-default/50">시간</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-on-surface-muted w-28">고객명</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-on-surface-muted">결제 내용</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-on-surface-muted text-center w-32">수입 구분</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-on-surface-muted text-center w-24">수단</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-on-surface-muted text-right w-28">입금액</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-on-surface-muted w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default">
                {filteredPayments.map((r) => {
                  const { time, isToday } = formatSmartDateTime(r.paidAt);
                  return (
                    <tr key={r.paymentId} className="hover:bg-surface-elevated transition-colors group">
                      <td className={`px-4 py-3 text-xs text-center border-r border-border-default/50 font-mono ${isToday ? "text-primary-600 font-bold dark:text-primary-400" : "text-on-surface-muted"}`}>{time}</td>
                      <td className="px-4 py-3 font-semibold text-on-surface">{r.customerName}</td>
                      <td className="px-4 py-3 text-on-surface truncate max-w-[200px]">{r.description ?? "-"}</td>
                      <td className="px-4 py-3 text-center">
                        {r.isBackPayment ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800/50 text-[11px] font-bold">
                            <History className="w-3 h-3" /> 미수 수납
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/50 text-[11px] font-bold">
                            <Receipt className="w-3 h-3" /> 당일 결제
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <PaymentMethodBadge method={r.method as any ?? "credit"} />
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-on-surface whitespace-nowrap">{r.amount.toLocaleString()}원</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handleGoToCustomer(r)} title="고객 관리에서 보기" className="p-1.5 rounded-md text-on-surface-muted bg-surface-elevated border border-border-default hover:bg-primary-600 hover:text-white transition-all cursor-pointer shadow-sm"><ExternalLink className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
