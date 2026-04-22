import { useState, useEffect } from "react";
import { Clock, ChevronDown, ChevronUp, Users } from "lucide-react";
import { salesApi } from "@/bindings/sales";
import type { UnpaidRecord } from "@/types";

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
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [records, setRecords] = useState<UnpaidRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void salesApi
      .listUnpaidRecords()
      .then(setRecords)
      .catch(() => setError("데이터를 불러오는 중 오류가 발생했습니다."));
  }, []);

  const customers = groupByCustomer(records);
  const totalUnpaid = customers.reduce((s, c) => s + c.totalUnpaid, 0);

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  function toDateStr(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      return iso.slice(0, 10);
    }
  }

  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      {error && (
        <div className="shrink-0 px-4 py-2.5 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm dark:bg-danger-950/30 dark:border-danger-900/40 dark:text-danger-400">
          {error}
        </div>
      )}
      {/* 요약 배너 */}
      <div className="flex items-center justify-between bg-warning-50 border border-warning-200 px-5 py-4 rounded-lg shrink-0 dark:bg-warning-950/20 dark:border-warning-900/40">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-warning-100 rounded-lg dark:bg-warning-900/30">
            <Clock className="w-5 h-5 text-warning-600 dark:text-warning-400" />
          </div>
          <div>
            <p className="text-xs font-semibold text-warning-600 dark:text-warning-400">총 미수금</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-warning-700 dark:text-warning-300 tracking-tight">
                {totalUnpaid.toLocaleString()}
              </span>
              <span className="text-sm text-warning-600/70 dark:text-warning-400/70">원</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-warning-700 dark:text-warning-400">
          <Users className="w-4 h-4" />
          <span className="font-semibold">{customers.length}명</span>
        </div>
      </div>

      {/* 고객별 미수금 목록 */}
      <div className="flex-1 bg-surface-card border border-border-default rounded-lg shadow-sm flex flex-col overflow-hidden min-h-0">
        {/* 테이블 헤더 */}
        <div className="bg-surface-elevated border-b border-border-default shrink-0">
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr_2rem] px-4 py-2.5">
            <span className="text-xs font-semibold text-on-surface-muted">고객명</span>
            <span className="text-xs font-semibold text-on-surface-muted">전화번호</span>
            <span className="text-xs font-semibold text-on-surface-muted text-right">미수금 합계</span>
            <span className="text-xs font-semibold text-on-surface-muted text-right">마지막 외상일</span>
            <span />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-border-default">
          {customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-on-surface-muted">
              <Clock className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">현재 미수금이 없습니다.</p>
            </div>
          ) : (
            customers.map((customer) => {
              const isExpanded = expandedId === customer.customerId;
              return (
                <div key={customer.customerId}>
                  {/* 고객 행 */}
                  <button
                    onClick={() => toggleExpand(customer.customerId)}
                    className="w-full grid grid-cols-[1fr_1fr_1fr_1fr_2rem] px-4 py-3 hover:bg-surface-elevated transition-colors cursor-pointer text-left"
                  >
                    <span className="font-semibold text-on-surface text-sm">{customer.name}</span>
                    <span className="text-sm text-on-surface-muted">{customer.phone ?? "-"}</span>
                    <span className="text-sm font-bold text-warning-700 dark:text-warning-400 text-right">
                      {customer.totalUnpaid.toLocaleString()}원
                    </span>
                    <span className="text-sm text-on-surface-muted text-right">
                      {toDateStr(customer.lastDate)}
                    </span>
                    <span className="flex items-center justify-end text-on-surface-muted">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </span>
                  </button>

                  {/* 펼친 세부 내역 */}
                  {isExpanded && (
                    <div className="bg-surface-elevated border-t border-border-default px-6 pb-3 pt-2 space-y-1.5">
                      {customer.records.map((r) => (
                        <div
                          key={r.workItemId}
                          className="flex justify-between items-center text-sm py-1.5 border-b border-border-default last:border-0"
                        >
                          <div className="flex items-center gap-3">
                            <Clock className="w-3.5 h-3.5 text-warning-500 shrink-0" />
                            <span className="text-on-surface-muted text-xs">{toDateStr(r.receivedAt)}</span>
                            <span className="text-on-surface">{r.description ?? "-"}</span>
                          </div>
                          <span className="font-bold text-warning-700 dark:text-warning-400">
                            {r.unpaidAmount.toLocaleString()}원
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
