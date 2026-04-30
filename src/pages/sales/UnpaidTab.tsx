import { useState, useEffect, useMemo } from "react";
import { Clock, ChevronDown, ChevronUp, Users, ExternalLink, Receipt } from "lucide-react";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { useNavigate } from "react-router";
import { salesApi } from "@/bindings/sales";
import type { UnpaidRecord } from "@/types";
import { formatSmartDateTime } from "@/utils/dateUtils";

// Group flat UnpaidRecord[] by customer for accordion display.
interface CustomerGroup {
  customerId: number;
  name: string;
  phone: string | null;
  totalUnpaid: number;
  lastDate: string;
  records: UnpaidRecord[];
}

function groupByCustomer(records: UnpaidRecord[]): CustomerGroup[] {
  const map = new Map<number, CustomerGroup>();
  for (const r of records) {
    const existing = map.get(r.customerId);
    if (existing) {
      existing.totalUnpaid += r.unpaidAmount;
      if (r.receivedAt > existing.lastDate) existing.lastDate = r.receivedAt;
      existing.records.push(r);
    } else {
      map.set(r.customerId, {
        customerId: r.customerId,
        name: r.customerName,
        phone: r.customerPhone ?? null,
        totalUnpaid: r.unpaidAmount,
        lastDate: r.receivedAt,
        records: [r],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.totalUnpaid - a.totalUnpaid);
}

// ============================================================
// UnpaidTab
// ============================================================
export function UnpaidTab() {
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [records, setRecords] = useState<UnpaidRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadData = () => {
    setIsLoading(true);
    setError(null);
    void salesApi
      .listUnpaidRecords()
      .then(setRecords)
      .catch(() => setError("데이터를 불러오는 중 오류가 발생했습니다."))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const customers = useMemo(() => groupByCustomer(records), [records]);
  const totalUnpaid = customers.reduce((s, c) => s + c.totalUnpaid, 0);

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleGoToCustomer = (customerId: number) => {
    navigate("/customers", { 
      state: { 
        focusCustomerId: customerId
      } 
    });
  };

  const handleGoToWorkItem = (customerId: number, workItemId: number) => {
    navigate("/customers", { 
      state: { 
        focusCustomerId: customerId,
        focusWorkItemId: workItemId
      } 
    });
  };

  function toDateStr(iso: string): string {
    try {
      const d = new Date(iso);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      const isCurrentYear = d.getFullYear() === now.getFullYear();

      if (isToday) return "오늘";
      
      return isCurrentYear 
        ? `${d.getMonth() + 1}/${d.getDate()}`
        : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    } catch {
      return iso.slice(0, 10);
    }
  }

  // 일관성을 위한 그리드 열 정의
  const gridCols = "grid-cols-[200px_1fr_140px_140px_48px]";

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
      {/* 요약 배너 */}
      <div className="flex items-center justify-between bg-warning-50 border border-warning-200 px-5 py-4 rounded-lg shrink-0 dark:bg-warning-950/20 dark:border-warning-900/40 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-warning-100 rounded-xl dark:bg-warning-900/40 shadow-inner">
            <Clock className="w-6 h-6 text-warning-600 dark:text-warning-400" />
          </div>
          <div>
            <p className="text-[0.6875rem] font-bold text-warning-600/80 dark:text-warning-400/70 uppercase tracking-wider mb-0.5">총 미수금 합계</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-warning-700 dark:text-warning-300 tracking-tight">
                {totalUnpaid.toLocaleString()}
              </span>
              <span className="text-sm font-bold text-warning-600/70 dark:text-warning-400/60">원</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2 bg-warning-100/50 dark:bg-warning-900/30 px-3 py-1.5 rounded-full border border-warning-200/50 dark:border-warning-900/50">
            <Users className="w-4 h-4 text-warning-600 dark:text-warning-400" />
            <span className="text-sm font-bold text-warning-700 dark:text-warning-300">{customers.length}명의 고객</span>
          </div>
        </div>
      </div>

      {/* 고객별 미수금 목록 */}
      <div className="flex-1 bg-surface-card border border-border-default rounded-lg shadow-sm flex flex-col overflow-hidden min-h-0">
        {/* 테이블 헤더 */}
        <div className="bg-surface-elevated border-b border-border-default shrink-0">
          <div className={`grid ${gridCols} px-4 py-3`}>
            <span className="text-sm font-bold text-on-surface-muted uppercase tracking-wider">고객명</span>
            <span className="text-sm font-bold text-on-surface-muted uppercase tracking-wider">전화번호</span>
            <span className="text-sm font-bold text-on-surface-muted uppercase tracking-wider text-right">미수금 합계</span>
            <span className="text-sm font-bold text-on-surface-muted uppercase tracking-wider text-right">마지막 외상일</span>
            <span />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-on-surface-muted">
              <div className="p-4 bg-surface-elevated rounded-full mb-4 opacity-50">
                <Clock className="w-10 h-10" />
              </div>
              <p className="text-sm font-bold">현재 미수금이 없습니다.</p>
              <p className="text-sm opacity-60 mt-1">모든 외상이 결제되었습니다.</p>
            </div>
          ) : (
            <div className="divide-y divide-border-default">
              {customers.map((customer) => {
                const isExpanded = expandedId === customer.customerId;
                return (
                  <div key={customer.customerId} className="group">
                    {/* 고객 행 */}
                    <div
                      onClick={() => toggleExpand(customer.customerId)}
                      className={`grid ${gridCols} items-center px-4 py-3.5 transition-colors cursor-pointer ${
                        isExpanded ? "bg-surface-elevated/80" : "hover:bg-surface-elevated/40"
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="font-bold text-on-surface text-sm truncate">{customer.name}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleGoToCustomer(customer.customerId);
                          }}
                          title="고객 관리에서 보기"
                          className="p-1.5 rounded-lg text-on-surface-muted bg-surface-elevated border border-border-default hover:bg-primary-600 hover:text-white dark:hover:bg-primary-500 hover:border-primary-600 transition-all cursor-pointer shadow-sm group/btn"
                        >
                          <ExternalLink className="w-4 h-4 transition-colors" />
                        </button>
                      </div>
                      <span className="text-sm text-on-surface-muted font-medium">{customer.phone ?? "-"}</span>
                      <span className="text-sm font-bold text-warning-700 dark:text-warning-400 text-right">
                        {customer.totalUnpaid.toLocaleString()}원
                      </span>
                      <span className="text-sm text-on-surface-muted text-right font-medium">
                        {toDateStr(customer.lastDate)}
                      </span>
                      <div className="flex items-center justify-end">
                        <div
                          className={`p-1.5 rounded-full transition-all ${
                            isExpanded ? "text-primary-600 bg-surface-elevated" : "text-on-surface-muted"
                          }`}
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5" />
                          ) : (
                            <ChevronDown className="w-5 h-5" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 펼친 세부 내역 */}
                    {isExpanded && (
                      <div className="bg-surface-elevated/30 border-t border-border-default/50 px-4 py-2 animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="bg-surface-card rounded-md border border-border-default/60 shadow-inner-sm overflow-hidden mb-2">
                          <div className="grid grid-cols-[140px_1fr_120px_48px] px-4 py-2 bg-surface-elevated/50 border-b border-border-default/50">
                            <span className="text-[0.625rem] font-bold text-on-surface-muted uppercase">일시</span>
                            <span className="text-[0.625rem] font-bold text-on-surface-muted uppercase">상세 내용</span>
                            <span className="text-[0.625rem] font-bold text-on-surface-muted uppercase text-right">금액</span>
                            <span />
                          </div>
                          <div className="divide-y divide-border-default/40">
                            {customer.records.map((r) => {
                              const { date, time } = formatSmartDateTime(r.receivedAt);
                              return (
                                <div
                                  key={r.workItemId}
                                  className="grid grid-cols-[140px_1fr_120px_48px] items-center px-4 py-2.5 hover:bg-surface-elevated/20 transition-colors group/row"
                                >
                                  <div className="flex flex-col">
                                    <span className="text-xs text-on-surface-muted font-medium">{date}</span>
                                    <span className="text-sm text-on-surface font-mono">{time}</span>
                                  </div>
                                  <div className="flex items-center gap-2 overflow-hidden">
                                    <Receipt className="w-3 h-3 text-on-surface-muted/50 shrink-0" />
                                    <span className="text-sm text-on-surface truncate">{r.description ?? "-"}</span>
                                  </div>
                                  <span className="text-sm font-bold text-warning-700 dark:text-warning-400 text-right">
                                    {r.unpaidAmount.toLocaleString()}원
                                  </span>
                                  <div className="flex justify-end">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleGoToWorkItem(customer.customerId, r.workItemId);
                                      }}
                                      title="고객 관리에서 이 작업 보기"
                                      className="p-1.5 rounded-lg text-on-surface-muted bg-surface-elevated border border-border-default hover:bg-primary-600 hover:text-white dark:hover:bg-primary-500 hover:border-primary-600 transition-all cursor-pointer shadow-sm group/btn"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
