import { CreditCard, Banknote, Clock, Landmark } from "lucide-react";

export interface DateRange {
  from: string;
  to: string;
}

export const PERIODS = [
  { id: "today", label: "오늘" },
  { id: "yesterday", label: "어제" },
  { id: "week", label: "이번 주" },
  { id: "month", label: "이번 달" },
] as const;

export type PresetId = (typeof PERIODS)[number]["id"];

export function toDateStr(d: Date): string {
  return d.toLocaleDateString("sv"); // local time YYYY-MM-DD (avoids UTC offset issue)
}

export function getDateRange(period: PresetId): DateRange {
  const today = new Date();
  const todayStr = toDateStr(today);
  switch (period) {
    case "today":
      return { from: todayStr, to: todayStr };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const s = toDateStr(y);
      return { from: s, to: s };
    }
    case "week": {
      const day = today.getDay(); // 0=Sun
      const diff = day === 0 ? 6 : day - 1; // Mon=0
      const mon = new Date(today);
      mon.setDate(today.getDate() - diff);
      return { from: toDateStr(mon), to: todayStr };
    }
    case "month": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: toDateStr(first), to: todayStr };
    }
  }
}

export function PaymentMethodBadge({ method }: { method: string }) {
  switch (method) {
    case "card":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
          <CreditCard className="w-3 h-3" /> 카드
        </span>
      );
    case "cash":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded bg-success-50 text-success-700 dark:bg-success-900/40 dark:text-success-300">
          <Banknote className="w-3 h-3" /> 현금
        </span>
      );
    case "transfer":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded bg-secondary-100 text-secondary-600 dark:bg-secondary-700 dark:text-secondary-300">
          <Landmark className="w-3 h-3" /> 이체
        </span>
      );
    case "credit":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded bg-warning-50 text-warning-700 dark:bg-warning-900/40 dark:text-warning-300">
          <Clock className="w-3 h-3" /> 외상
        </span>
      );
    default:
      return null;
  }
}
