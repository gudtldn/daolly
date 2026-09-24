import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { paymentApi } from "@/bindings";
import { useDialogStore } from "@/stores/dialogStore";
import { errorMessage } from "@/utils/errors";
import type { CreditPayment } from "@/types";

/**
 * 예전 버전에서 결제 수단을 '외상'으로 등록한 결제 점검.
 * 이런 결제는 돈을 받지 않았는데 받은 것으로 계산되어 미수금에서 빠졌습니다.
 * 자동으로 지우지 않고, 확인한 뒤 결제에서 빼면 미수금으로 다시 표시됩니다.
 * 정리할 결제가 없으면 아무것도 보이지 않습니다.
 */
export function CreditPaymentReview() {
  const [items, setItems] = useState<CreditPayment[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { showConfirm } = useDialogStore();

  const load = async () => {
    try {
      setItems(await paymentApi.listCredit());
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (items.length === 0 && !error) return null;

  const handleRemove = async (p: CreditPayment) => {
    const ok = await showConfirm({
      title: "외상 결제 정리",
      message: `${p.customerName}님 '${p.description ?? "접수"}'의 ${p.amount.toLocaleString()}원 결제를 지웁니다. 이 금액은 미수금으로 다시 표시됩니다.`,
      confirmText: "결제에서 빼기",
      isDestructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      await paymentApi.delete(p.paymentId);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-surface-card rounded-lg border border-warning-200/60 dark:border-warning-900/50 p-5 shadow-sm">
      <div className="flex items-start gap-3 mb-4">
        <AlertTriangle className="w-5 h-5 text-warning-600 dark:text-warning-400 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-on-surface">외상으로 기록된 결제 {items.length}건</h4>
          <p className="text-sm text-on-surface-muted mt-1">
            예전 버전에서는 결제 수단을 '외상'으로 등록하면 돈을 받지 않았는데도 받은 것으로 계산되었습니다.
            실제로 받지 않은 결제라면 '결제에서 빼기'를 눌러 주세요. 미수금으로 다시 표시됩니다.
          </p>
        </div>
      </div>
      {error && <p className="text-sm text-danger-600 dark:text-danger-400 mb-3">{error}</p>}
      {items.length > 0 && (
        <div className="border border-border-default rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-on-surface-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">고객</th>
                <th className="px-3 py-2 text-left font-medium">내용</th>
                <th className="px-3 py-2 text-left font-medium">결제일</th>
                <th className="px-3 py-2 text-right font-medium">금액</th>
                <th className="w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {items.map((p) => (
                <tr key={p.paymentId}>
                  <td className="px-3 py-2 text-on-surface">{p.customerName}</td>
                  <td className="px-3 py-2 text-on-surface-muted">{p.description ?? "-"}</td>
                  <td className="px-3 py-2 text-on-surface-muted">{new Date(p.paidAt).toLocaleDateString("ko-KR")}</td>
                  <td className="px-3 py-2 text-right font-medium text-on-surface">{p.amount.toLocaleString()}원</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => handleRemove(p)}
                      disabled={busy}
                      className="px-3 py-1.5 text-sm font-medium text-warning-700 dark:text-warning-300 border border-warning-300 dark:border-warning-800 rounded-lg hover:bg-warning-50 dark:hover:bg-warning-950 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      결제에서 빼기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
