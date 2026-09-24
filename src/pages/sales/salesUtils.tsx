import { CreditCard, Banknote, Clock, Landmark } from "lucide-react";
import { toLocalDateString } from "@/utils/dateUtils";

/** 조회 기간: 이 PC 기준 날짜 "YYYY-MM-DD"이며 양끝을 포함합니다. */
export interface DateRange {
  from: string;
  to: string;
}

export const PERIODS = [
  { id: "today", label: "오늘" },
  { id: "yesterday", label: "어제" },
  { id: "week", label: "이번 주" },
  { id: "month", label: "이번 달" },
  { id: "year", label: "올해" },
] as const;

export type PresetId = (typeof PERIODS)[number]["id"];

/**
 * 주어진 프리셋(오늘, 어제, 이번 주 등)에 해당하는 날짜 범위를 반환합니다.
 */
export function getDateRange(period: PresetId): DateRange {
  const today = new Date();
  const range = (from: Date, to: Date = today): DateRange => ({
    from: toLocalDateString(from),
    to: toLocalDateString(to),
  });
  switch (period) {
    case "today":
      return range(today);
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return range(y, y);
    }
    case "week": {
      const day = today.getDay(); // 0=일요일
      const diff = day === 0 ? 6 : day - 1; // 월요일=0
      const mon = new Date(today);
      mon.setDate(today.getDate() - diff);
      return range(mon);
    }
    case "month":
      return range(new Date(today.getFullYear(), today.getMonth(), 1));
    case "year":
      return range(new Date(today.getFullYear(), 0, 1));
  }
}

/**
 * 결제 수단에 따른 뱃지 UI를 렌더링하는 컴포넌트입니다.
 */
export function PaymentMethodBadge({ method }: { method: string }) {
  // 여러 결제 수단이 쉼표로 합쳐져 있는 경우 (예: "card, cash" 또는 "카드, 현금")
  if (method.includes(",")) {
    const methods = Array.from(new Set(method.split(",").map((m) => m.trim()))); // 중복 제거
    return (
      <div className="flex items-center justify-center gap-0.5 flex-nowrap">
        {methods.map((m, i) => (
          <PaymentMethodBadge key={`${m}-${i}`} method={m} />
        ))}
      </div>
    );
  }

  const m = method.toLowerCase();
  const baseClass = "inline-flex items-center gap-1 font-bold px-1.5 py-0.5 rounded border whitespace-nowrap";
  const smallText = "text-xs";

  if (m === "card" || m === "카드") {
    return (
      <span className={`${baseClass} ${smallText} bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 border-primary-200/50 dark:border-primary-800/50`}>
        <CreditCard className="w-3 h-3" /> 카드
      </span>
    );
  }
  if (m === "cash" || m === "현금") {
    return (
      <span className={`${baseClass} ${smallText} bg-success-50 text-success-700 dark:bg-success-900/40 dark:text-success-300 border-success-200/50 dark:border-success-800/50`}>
        <Banknote className="w-3 h-3" /> 현금
      </span>
    );
  }
  if (m === "transfer" || m === "이체" || m === "계좌이체") {
    return (
      <span className={`${baseClass} ${smallText} bg-secondary-100 text-secondary-600 dark:bg-secondary-700 dark:text-secondary-300 border-secondary-200/50`}>
        <Landmark className="w-3 h-3" /> 이체
      </span>
    );
  }
  if (m === "credit" || m === "외상") {
    return (
      <span className={`${baseClass} ${smallText} bg-warning-50 text-warning-700 dark:bg-warning-900/40 dark:text-warning-300 border-warning-200/50 dark:border-warning-800/50`}>
        <Clock className="w-3 h-3" /> 외상
      </span>
    );
  }

  // 매칭되는 것이 없으면 텍스트라도 표시
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface-elevated text-on-surface-muted border border-border-default text-xs font-bold whitespace-nowrap">
      {method}
    </span>
  );
}
