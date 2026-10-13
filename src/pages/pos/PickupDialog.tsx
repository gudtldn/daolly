import { useEffect, useState } from "react";
import { Banknote, CreditCard, Landmark } from "lucide-react";
import { workItemApi } from "@/bindings";
import { errorMessage } from "@/utils/errors";
import type { PaymentMethod, WorkItem, WorkItemFull } from "@/types";

const METHODS: { key: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { key: "cash", label: "현금", icon: <Banknote className="w-6 h-6" /> },
  { key: "card", label: "카드", icon: <CreditCard className="w-6 h-6" /> },
  { key: "transfer", label: "계좌이체", icon: <Landmark className="w-6 h-6" /> },
];

export const PAYMENT_LABELS: Record<PaymentMethod, string> = { cash: "현금", card: "카드", transfer: "계좌이체" };

interface Props {
  /** 출고할 세탁물. null이면 닫힘 */
  item: WorkItem | null;
  onClose: () => void;
  /** 출고 완료. method는 남은 금액을 받은 수단 (받지 않았으면 null) */
  onPickedUp: (receipt: WorkItemFull, method: PaymentMethod | null, collected: number) => void;
}

/**
 * 출고: 세탁물을 내어 주면서 남은 금액을 한 번에 받습니다.
 * (예전에는 고객 관리에서 상태를 바꾸고 결제를 따로 등록해야 했음)
 */
export function PickupDialog({ item, onClose, onPickedUp }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPending(false);
    setError("");
  }, [item?.id]);

  useEffect(() => {
    if (!item) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [item, pending, onClose]);

  if (!item) return null;
  const balance = Math.max(item.price - item.paidAmount, 0);

  const handlePickup = async (method: PaymentMethod | null) => {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const receipt = await workItemApi.pickup(item.id, method);
      onPickedUp(receipt, balance > 0 ? method : null, method ? balance : 0);
    } catch (e) {
      setError(errorMessage(e));
      setPending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="pickup-title" className="bg-surface-card rounded-xl shadow-xl w-[440px] p-6 space-y-5">
        <div>
          <h3 id="pickup-title" className="text-xl font-bold text-on-surface">출고</h3>
          <p className="text-base text-on-surface-muted mt-1 truncate">{item.description ?? "세탁물"}</p>
        </div>

        {balance > 0 ? (
          <>
            <div className="flex items-baseline justify-between bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-700 rounded-lg px-4 py-3">
              <span className="text-base font-medium text-warning-700 dark:text-warning-300">남은 금액</span>
              <span className="text-2xl font-bold text-warning-700 dark:text-warning-300">{balance.toLocaleString()}원</span>
            </div>
            <p className="text-sm text-on-surface-muted">받은 방법을 누르면 결제와 출고가 함께 처리됩니다.</p>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => handlePickup(m.key)}
                  disabled={pending}
                  className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-lg border-2 border-border-default bg-surface-card text-base font-bold text-on-surface hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {m.icon}
                  {m.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => handlePickup(null)}
              disabled={pending}
              className="w-full py-3 rounded-lg border border-border-default text-sm font-medium text-on-surface-muted hover:bg-surface-elevated transition-colors cursor-pointer disabled:opacity-50"
            >
              받지 않고 출고 (미수금으로 두기)
            </button>
          </>
        ) : (
          <button
            onClick={() => handlePickup(null)}
            disabled={pending}
            className="w-full py-4 rounded-lg bg-primary-600 text-white text-lg font-bold hover:bg-primary-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            출고하기
          </button>
        )}

        {error && <p className="text-sm text-danger-600 dark:text-danger-400">{error}</p>}

        <div className="flex justify-end">
          <button
            onClick={onClose}
            disabled={pending}
            className="px-4 py-2 text-sm text-on-surface-muted border border-border-default rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer disabled:opacity-50"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
