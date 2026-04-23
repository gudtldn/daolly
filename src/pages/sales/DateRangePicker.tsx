import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ArrowRight, X } from "lucide-react";

interface DateRange {
  from: string; // YYYY-MM-DD 형식의 시작일
  to: string;   // YYYY-MM-DD 형식의 종료일
}

interface Props {
  value: DateRange | null;
  onApply: (range: DateRange) => void;
  onClear: () => void;
}

function formatDisplay(range: DateRange): string {
  const from = new Date(range.from);
  const to = new Date(range.to);
  const currentYear = new Date().getFullYear();

  const fmtFull = (d: Date) =>
    `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  const fmtShort = (d: Date) =>
    `${d.getMonth() + 1}/${d.getDate()}`;

  // 시작일이나 종료일이 올해가 아니거나, 두 날짜의 연도가 다르면 연도 포함 표시
  if (
    from.getFullYear() !== currentYear ||
    to.getFullYear() !== currentYear ||
    from.getFullYear() !== to.getFullYear()
  ) {
    return `${fmtFull(from)} ~ ${fmtFull(to)}`;
  }

  return `${fmtShort(from)} ~ ${fmtShort(to)}`;
}

/**
 * 날짜 범위를 직접 지정할 수 있는 데이트 피커(Date Range Picker) 컴포넌트입니다.
 */
export function DateRangePicker({ value, onApply, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const today = new Date().toLocaleDateString("sv"); // local time YYYY-MM-DD
  const [from, setFrom] = useState(value?.from ?? today);
  const [to, setTo] = useState(value?.to ?? today);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // 팝오버 위치 계산 (fixed 포지션)
  const calcPosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPopoverStyle({
      position: "fixed",
      top: rect.bottom + 6,
      left: rect.left,
    });
  };

  // 위치가 어긋나는 것을 방지하기 위해 창 크기가 변경되면 팝오버를 닫습니다.
  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [open]);

  // 외부 클릭 시 팝오버를 닫습니다.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleOpen = () => {
    setFrom(value?.from ?? today);
    setTo(value?.to ?? today);
    calcPosition();
    setOpen(true);
  };

  const handleApply = () => {
    if (!from || !to) return;
    onApply(from > to ? { from: to, to: from } : { from, to });
    setOpen(false);
  };

  const popover = open
    ? createPortal(
        <div
          ref={popoverRef}
          style={popoverStyle}
          className="z-50 bg-surface-card border border-border-default rounded-xl shadow-xl p-4 w-80"
        >
          <p className="text-xs font-bold text-on-surface-muted mb-3">기간 직접 지정</p>

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label htmlFor="drp-from" className="block text-[0.6875rem] font-semibold text-on-surface-muted mb-1">시작일</label>
              <input
                id="drp-from"
                type="date"
                value={from}
                max={today}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm border border-border-default rounded-lg bg-surface text-on-surface focus:outline-none focus:border-primary-500 transition-colors cursor-pointer"
              />
            </div>
            <ArrowRight className="w-4 h-4 text-on-surface-muted shrink-0 mt-4" />
            <div className="flex-1">
              <label htmlFor="drp-to" className="block text-[0.6875rem] font-semibold text-on-surface-muted mb-1">종료일</label>
              <input
                id="drp-to"
                type="date"
                value={to}
                max={today}
                onChange={(e) => setTo(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm border border-border-default rounded-lg bg-surface text-on-surface focus:outline-none focus:border-primary-500 transition-colors cursor-pointer"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-border-default">
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 text-sm font-medium text-on-surface-muted bg-surface-elevated border border-border-default rounded-lg hover:bg-surface transition-colors cursor-pointer"
            >
              취소
            </button>
            <button
              onClick={handleApply}
              disabled={!from || !to}
              className="px-4 py-1.5 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              적용
            </button>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div ref={triggerRef} className="relative">
      {/* 트리거 버튼 */}
      {value ? (
        <div className="flex items-center gap-1">
          <span className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-primary-600 bg-primary-50 border border-primary-200 rounded dark:bg-primary-900/30 dark:text-primary-400 dark:border-primary-800">
            <CalendarDays className="w-3.5 h-3.5" />
            {formatDisplay(value)}
          </span>
          <button
            onClick={onClear}
            className="p-1.5 text-on-surface-muted hover:text-danger-500 transition-colors cursor-pointer rounded"
            title="기간 초기화"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={handleOpen}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-on-surface-muted hover:text-on-surface transition-colors cursor-pointer"
        >
          <CalendarDays className="w-3.5 h-3.5" />
          기간 직접 지정
        </button>
      )}

      {popover}
    </div>
  );
}
