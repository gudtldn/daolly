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
  LayoutList,
} from "lucide-react";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { DateRangePicker } from "@/pages/sales/DateRangePicker";
import { salesApi } from "@/bindings/sales";
import type { PaymentRecord, SalesRecord, ChartDay, TopItem, RevenueSummary } from "@/types";
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
/**
 * 요약(Summary) 탭 컴포넌트입니다.
 * 
 * 기간별 매출 요약, 인기 품목, 주간 접수액 현황 및 상세 입금/접수 내역을 표시합니다.
 */
export function SummaryTab() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PresetId>("today");
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [search, setSearch] = useState("");
  const [rightTab, setRightTab] = useState<"payments" | "receptions">("payments");
  
  // 데이터 상태
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [salesRecords, setSalesRecords] = useState<SalesRecord[]>([]);
  const [summary, setSummary] = useState<RevenueSummary>({ totalSales: 0, actualIncome: 0 });
  const [chartData, setChartData] = useState<ChartDay[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const activeRange = useMemo(() => customRange ?? getDateRange(period), [customRange, period]);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [payments, sales, summaryData, topItemData] = await Promise.all([
        salesApi.listPaymentRecords(activeRange.from, activeRange.to),
        salesApi.listSalesRecords(activeRange.from, activeRange.to),
        salesApi.getRevenueSummary(activeRange.from, activeRange.to),
        salesApi.listTopItems(activeRange.from, activeRange.to),
      ]);
      setPaymentRecords(payments);
      setSalesRecords(sales);
      setSummary(summaryData);
      setTopItems(topItemData);
    } catch (e) {
      setError("데이터를 불러오는 중 오류가 발생했습니다.");
      console.error(e);
    } finally {
      setIsLoading(false);
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
        const from = new Date(activeRange.from);
        const to = new Date(activeRange.to);
        const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
        return `${fmt(from)} ~ ${fmt(to)}`;
      })()
    : (PERIODS.find((p) => p.id === period)?.label ?? "");

  // 검색 필터링
  const filteredPayments = paymentRecords.filter(
    (r) => r.customerName.includes(search) || (r.description ?? "").includes(search)
  );
  const filteredSales = salesRecords.filter(
    (r) => r.customerName.includes(search) || (r.description ?? "").includes(search)
  );

  const handleGoToCustomer = (customerId: number, workItemId: number) => {
    navigate("/customers", { state: { focusCustomerId: customerId, focusWorkItemId: workItemId } });
  };

  return (
    <div className="h-full flex flex-col gap-4 min-h-0 relative">
      <LoadingOverlay isLoading={isLoading} />
      {error && (
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm dark:bg-danger-950/30 dark:border-danger-900/40 dark:text-danger-400">
          <span>{error}</span>
          <button
            onClick={loadData}
            className="shrink-0 px-2.5 py-1 text-sm font-medium bg-danger-100 dark:bg-danger-900/40 border border-danger-300 dark:border-danger-700 rounded-lg hover:bg-danger-200 dark:hover:bg-danger-900/60 transition-colors cursor-pointer"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* 컨트롤 바 */}
      <div className="flex items-center gap-2 bg-surface-card border border-border-default p-3 rounded-lg shadow-sm shrink-0">
        <div className={`flex items-center gap-1 bg-surface-elevated p-1 rounded-md border border-border-default transition-opacity ${customRange ? "opacity-40 pointer-events-none" : ""}`}>
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
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
        {/* 오늘 입금된 금액 */}
        <div className="bg-surface-card border border-border-default border-l-4 border-l-primary-500 p-5 rounded-xl shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <Wallet className="w-16 h-16 text-primary-600" />
          </div>
          <p className="text-sm font-bold text-on-surface-muted mb-1.5">{periodLabel} 입금된 금액</p>
          <div className="flex items-baseline gap-1">
            <h3 className="text-3xl font-extrabold text-primary-600 tracking-tight dark:text-primary-400">
              {summary.actualIncome.toLocaleString()}
            </h3>
            <span className="text-lg font-medium text-primary-600/70 dark:text-primary-400/70">원</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[0.6875rem] font-bold text-on-surface-muted">당일</span>
              <span className="text-sm font-bold text-primary-600/90 dark:text-primary-400">{currentPaymentIncome.toLocaleString()}원</span>
            </div>
            <div className="w-px h-3 bg-border-default/60 self-center" />
            <div className="flex items-center gap-1.5">
              <span className="text-[0.6875rem] font-bold text-on-surface-muted">미수</span>
              <span className="text-sm font-bold text-primary-600/90 dark:text-primary-400">{backPaymentIncome.toLocaleString()}원</span>
            </div>
          </div>
        </div>

        {/* 카드 결제액 */}
        <div className="bg-surface-card border border-border-default p-5 rounded-lg shadow-sm">
          <div className="flex items-center gap-1.5 mb-1.5">
            <CreditCard className="w-3.5 h-3.5 text-primary-500" />
            <p className="text-sm font-bold text-on-surface-muted">카드 결제액</p>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-on-surface">{cardIncome.toLocaleString()}</span>
            <span className="text-sm text-on-surface-muted">원</span>
          </div>
          <div className="mt-3 w-full bg-secondary-100 rounded-full h-1.5 dark:bg-secondary-800">
            <div className="bg-primary-500 h-1.5 rounded-full" style={{ width: `${cardPct}%` }} />
          </div>
          <p className="text-[0.625rem] text-on-surface-muted mt-1.5 text-right font-medium">수입의 {cardPct}%</p>
        </div>

        {/* 현금 / 이체 합계 */}
        <div className="bg-surface-card border border-border-default p-5 rounded-lg shadow-sm">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Banknote className="w-3.5 h-3.5 text-success-500" />
            <p className="text-sm font-bold text-on-surface-muted">현금 / 이체 합계</p>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-on-surface">{cashTransferIncome.toLocaleString()}</span>
            <span className="text-sm text-on-surface-muted">원</span>
          </div>
          <div className="mt-3 w-full bg-secondary-100 rounded-full h-1.5 dark:bg-secondary-800">
            <div className="bg-success-500 h-1.5 rounded-full" style={{ width: `${cashTransferPct}%` }} />
          </div>
          <p className="text-[0.625rem] text-on-surface-muted mt-1.5 text-right font-medium">수입의 {cashTransferPct}%</p>
        </div>

        {/* 오늘 접수한 금액 */}
        <div className="bg-surface-card border border-border-default p-5 rounded-lg shadow-sm opacity-85">
          <div className="flex items-center gap-1.5 mb-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-secondary-500" />
            <p className="text-sm font-bold text-on-surface-muted">{periodLabel} 접수한 금액</p>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-on-surface">{summary.totalSales.toLocaleString()}</span>
            <span className="text-sm text-on-surface-muted">원</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-sm font-medium text-on-surface-muted">
            <Receipt className="w-3 h-3" />
            <span>{salesRecords.length}건의 작업 접수됨</span>
          </div>
        </div>
      </div>

      {/* 하단 상세 섹션 */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* 좌측 패널: 차트 + 인기품목 */}
        <div className="w-72 shrink-0 flex flex-col gap-4 min-h-0">
          <div className="flex-1 bg-surface-card border border-border-default rounded-lg shadow-sm flex flex-col p-4 overflow-visible">
            <h3 className="text-sm font-bold text-on-surface mb-4">주간 매출 추이</h3>
            <div className="flex-1 flex items-end justify-between gap-1.5 relative min-h-0">
              {chartData.map((data, i) => {
                const isToday = i === chartData.length - 1;
                const maxTotal = Math.max(...chartData.map((d) => d.total), 1);
                const pct = Math.round((data.total / maxTotal) * 100);
                return (
                  <div key={data.date} className="flex flex-col items-center w-full h-full justify-end group z-10 relative">
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center z-20">
                      <div className="bg-surface-card border border-border-default px-2 py-1 rounded-lg shadow-lg text-[0.625rem] whitespace-nowrap animate-in fade-in zoom-in duration-200">
                        <p className="text-on-surface-muted font-medium">{data.date}</p>
                        <p className="text-primary-600 font-bold">{data.total.toLocaleString()}원 (접수)</p>
                      </div>
                      <div className="w-1.5 h-1.5 bg-surface-card border-r border-b border-border-default rotate-45 -mt-1" />
                    </div>

                    <div
                      className={`w-full max-w-[32px] rounded-t transition-all ${
                        isToday ? "bg-primary-600" : "bg-primary-200 dark:bg-primary-900/50 hover:bg-primary-400"
                      }`}
                      style={{ height: `${pct}%`, minHeight: pct > 0 ? "4px" : "0" }}
                    />
                    <span
                      className={`text-[0.625rem] mt-2 font-medium ${
                        isToday ? "text-primary-600 font-bold" : "text-on-surface-muted"
                      }`}
                    >
                      {data.label}
                    </span>
                  </div>
                );

              })}
            </div>
          </div>
          <div className="h-48 bg-surface-card border border-border-default rounded-lg shadow-sm flex flex-col p-4 overflow-hidden">
            <h4 className="text-[0.6875rem] font-bold text-on-surface-muted mb-3 uppercase tracking-wider">자주 찾는 품목</h4>
            <div className="flex-1 overflow-y-auto space-y-2">
              {topItems.length === 0 ? (
                <p className="text-sm text-on-surface-muted text-center py-8">데이터 없음</p>
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

        {/* 우측 패널: 상세 내역 (탭 방식) */}
        <div className="flex-1 bg-surface-card border border-border-default rounded-lg shadow-sm flex flex-col overflow-hidden">
          <div className="px-4 py-3 bg-surface-elevated border-b border-border-default flex justify-between items-center shrink-0">
            <div className="flex items-center gap-4">
              <div className="flex bg-surface-card rounded-md border border-border-default p-1 p-0.5">
                <button
                  onClick={() => setRightTab("payments")}
                  className={`flex items-center gap-1.5 px-3 py-1 text-sm font-bold rounded-lg transition-all cursor-pointer ${
                    rightTab === "payments" ? "bg-primary-600 text-white shadow-sm" : "text-on-surface-muted hover:text-on-surface"
                  }`}
                >
                  <ArrowDownCircle className="w-3.5 h-3.5" />
                  입금 내역
                </button>
                <button
                  onClick={() => setRightTab("receptions")}
                  className={`flex items-center gap-1.5 px-3 py-1 text-sm font-bold rounded-lg transition-all cursor-pointer ${
                    rightTab === "receptions" ? "bg-primary-600 text-white shadow-sm" : "text-on-surface-muted hover:text-on-surface"
                  }`}
                >
                  <LayoutList className="w-3.5 h-3.5" />
                  접수 내역
                </button>
              </div>
              <span className="text-[0.6875rem] text-on-surface-muted font-medium">({periodLabel})</span>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-secondary-400" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="검색..." className="pl-7 pr-3 py-1.5 text-sm border border-border-default rounded-lg bg-surface-card text-on-surface placeholder:text-on-surface-muted focus:outline-none focus:border-primary-500 transition-colors w-48" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface-elevated sticky top-0 border-b border-border-default z-10">
                {rightTab === "payments" ? (
                  <tr>
                    <th className="px-4 py-2.5 text-sm font-semibold text-on-surface-muted w-24 text-center border-r border-border-default/50">시간</th>
                    <th className="px-4 py-2.5 text-sm font-semibold text-on-surface-muted w-28">고객명</th>
                    <th className="px-4 py-2.5 text-sm font-semibold text-on-surface-muted">내용</th>
                    <th className="px-4 py-2.5 text-sm font-semibold text-on-surface-muted text-center w-32">수입 구분</th>
                    <th className="px-4 py-2.5 text-sm font-semibold text-on-surface-muted text-center w-20">수단</th>
                    <th className="px-4 py-2.5 text-sm font-semibold text-on-surface-muted text-right w-24">금액</th>
                    <th className="px-4 py-2.5 text-sm font-semibold text-on-surface-muted w-12"></th>
                  </tr>
                ) : (
                  <tr>
                    <th className="px-4 py-2.5 text-sm font-semibold text-on-surface-muted w-24 text-center border-r border-border-default/50">시간</th>
                    <th className="px-4 py-2.5 text-sm font-semibold text-on-surface-muted w-28">고객명</th>
                    <th className="px-4 py-2.5 text-sm font-semibold text-on-surface-muted">내용</th>
                    <th className="px-4 py-2.5 text-sm font-semibold text-on-surface-muted text-center w-32">결제 상태</th>
                    <th className="px-4 py-2.5 text-sm font-semibold text-on-surface-muted text-right w-24">금액</th>
                    <th className="px-4 py-2.5 text-sm font-semibold text-on-surface-muted w-12"></th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-border-default">
                {rightTab === "payments" ? (
                  filteredPayments.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-on-surface-muted text-sm">입금 내역이 없습니다.</td></tr>
                  ) : (
                    filteredPayments.map((r) => {
                      const { time, isToday } = formatSmartDateTime(r.paidAt);
                      return (
                        <tr key={r.paymentId} className="hover:bg-surface-elevated transition-colors group">
                          <td className={`px-4 py-3 text-sm text-center border-r border-border-default/50 font-mono ${isToday ? "text-primary-600 font-bold dark:text-primary-400" : "text-on-surface-muted"}`}>{time}</td>
                          <td className="px-4 py-3 font-semibold text-on-surface">{r.customerName}</td>
                          <td className="px-4 py-3 text-on-surface truncate max-w-[200px]">{r.description ?? "-"}</td>
                          <td className="px-4 py-3 text-center">
                            {r.isBackPayment ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 text-[0.6875rem] font-bold"><History className="w-3 h-3" /> 미수 수납</span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 text-[0.6875rem] font-bold"><Receipt className="w-3 h-3" /> 당일 결제</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center"><PaymentMethodBadge method={r.method as any ?? "credit"} /></td>
                          <td className="px-4 py-3 text-right font-bold text-on-surface whitespace-nowrap">{r.amount.toLocaleString()}원</td>
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => handleGoToCustomer(r.customerId, r.workItemId)} title="고객 관리에서 보기" className="p-1.5 rounded-md text-on-surface-muted bg-surface-elevated border border-border-default hover:bg-primary-600 hover:text-white transition-all cursor-pointer shadow-sm"><ExternalLink className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      );
                    })
                  )
                ) : (
                  filteredSales.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-on-surface-muted text-sm">접수 내역이 없습니다.</td></tr>
                  ) : (
                    filteredSales.map((r) => {
                      const { time, isToday } = formatSmartDateTime(r.receivedAt);
                      const isFullyPaid = r.paidAmount >= r.price;
                      return (
                        <tr key={r.workItemId} className="hover:bg-surface-elevated transition-colors group">
                          <td className={`px-4 py-3 text-sm text-center border-r border-border-default/50 font-mono ${isToday ? "text-primary-600 font-bold dark:text-primary-400" : "text-on-surface-muted"}`}>{time}</td>
                          <td className="px-4 py-3 font-semibold text-on-surface">{r.customerName}</td>
                          <td className="px-4 py-3 text-on-surface truncate max-w-[200px]">{r.description ?? "-"}</td>
                          <td className="px-4 py-3 text-center">
                            {isFullyPaid ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 text-[0.625rem] font-bold">완납</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-50 text-danger-700 border border-rose-100 dark:bg-danger-950/20 dark:text-danger-400 text-[0.625rem] font-bold">
                                {r.paidAmount > 0 ? "일부 미납" : "미납"}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-on-surface whitespace-nowrap">{r.price.toLocaleString()}원</td>
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => handleGoToCustomer(r.customerId, r.workItemId)} title="고객 관리에서 보기" className="p-1.5 rounded-md text-on-surface-muted bg-surface-elevated border border-border-default hover:bg-primary-600 hover:text-white transition-all cursor-pointer shadow-sm"><ExternalLink className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      );
                    })
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
