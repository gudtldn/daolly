import { useState, useEffect, useRef } from "react";
import { X, Plus, Trash2, Pencil, Check } from "lucide-react";
import type { WorkItemFull, WorkItemStatus, CreateWorkItem, UpdateWorkItem, DetailInput, Payment } from "@/types";
import { paymentApi } from "@/bindings";
import { CurrencyInput } from "@/components/CurrencyInput";
import { NumberInput } from "@/components/NumberInput";

// datetime-local <-> ISO 변환 헬퍼
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(local: string): string {
  // Return local time as-is (with seconds) - no UTC conversion
  return local ? local + ":00" : "";
}

// 결제 수단 키 -> 한글 표시 변환 (영문 key 기준, 구형 DB 한글 key fallback 포함)
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "현금",
  card: "카드",
  credit: "외상",
  transfer: "계좌이체",
  // 구형 한글 key fallback (DB 마이그레이션 전 데이터 호환)
  "현금": "현금",
  "카드": "카드",
  "계좌이체": "계좌이체",
  "기타": "기타",
};
function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "-";
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

type Tab = "info" | "payment";

interface Props {
  open: boolean;
  mode: "create" | "edit";
  customerId: number;
  /** edit 모드에서 사용할 기존 데이터 (full) */
  workItem?: WorkItemFull | null;
  /** edit 모드에서 초기 탭 선택 */
  initialTab?: Tab;
  onSave: (data: CreateWorkItem | UpdateWorkItem, details?: DetailInput[], status?: WorkItemStatus, pickedUpAt?: string) => Promise<void>;
  onClose: () => void;
  /** 결제 변경 후 외부 상태 갱신 */
  onPaymentChange?: () => void;
}

function emptyDetail(): DetailInput & { _key: number } {
  return { _key: Date.now() + Math.random(), itemName: "", unitPrice: 0, quantity: 1, optionsMemo: null };
}

type DetailRow = DetailInput & { _key: number };

export function WorkItemFormCard({ open, mode, customerId, workItem, initialTab, onSave, onClose, onPaymentChange }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("info");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [details, setDetails] = useState<DetailRow[]>([emptyDetail()]);
  const [manualPrice, setManualPrice] = useState(false);
  const [priceInput, setPriceInput] = useState(0);
  const [status, setStatus] = useState<WorkItemStatus>("Received");
  const [receivedAt, setReceivedAt] = useState("");
  const [pickedUpAt, setPickedUpAt] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const descRef = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  // 결제 탭 상태
  const [payments, setPayments] = useState<Payment[]>([]);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState("cash");
  const [payDate, setPayDate] = useState("");
  const [payLoading, setPayLoading] = useState(false);
  // 결제 인라인 편집 상태
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState(0);
  const [editMethod, setEditMethod] = useState("");
  const [editDate, setEditDate] = useState("");

  // 자동 합산 가격
  const autoPrice = details.reduce((sum, d) => sum + d.unitPrice * d.quantity, 0);
  const effectivePrice = manualPrice ? priceInput : autoPrice;

  // 열릴 때 폼 초기화 및 포커스 저장
  useEffect(() => {
    if (!open) {
      // 닫힐 때 포커스 복원
      if (previousFocus.current && document.body.contains(previousFocus.current)) {
        const prev = previousFocus.current;
        setTimeout(() => prev.focus(), 50);
      }
      previousFocus.current = null;
      return;
    }

    previousFocus.current = document.activeElement as HTMLElement;

    if (mode === "edit" && workItem) {
      setDescription(workItem.description ?? "");
      setNote(workItem.note ?? "");
      setStatus(workItem.status);
      setReceivedAt(toLocalInput(workItem.receivedAt));
      setPickedUpAt(toLocalInput(workItem.pickedUpAt));
      setDetails(
        workItem.details.length > 0
          ? workItem.details.map((d) => ({
              _key: d.id + Math.random(),
              itemName: d.itemName,
              unitPrice: d.unitPrice,
              quantity: d.quantity,
              optionsMemo: d.optionsMemo,
            }))
          : [emptyDetail()]
      );
      // 합산과 실제 가격이 다르면 수동모드
      const sum = workItem.details.reduce((s, d) => s + d.unitPrice * d.quantity, 0);
      setManualPrice(sum !== workItem.price);
      setPriceInput(workItem.price);
    } else {
      setDescription("");
      setNote("");
      setStatus("Received");
      setReceivedAt(toLocalInput(new Date().toISOString()));
      setPickedUpAt("");
      setDetails([emptyDetail()]);
      setManualPrice(false);
      setPriceInput(0);
    }
    setError("");
    setSaving(false);
    setActiveTab(mode === "edit" && initialTab ? initialTab : "info");
    // 결제 데이터 초기화
    if (mode === "edit" && workItem) {
      setPayments(workItem.payments);
      const remaining = workItem.price - workItem.paidAmount;
      setPayAmount(remaining > 0 ? remaining : 0);
    } else {
      setPayments([]);
      setPayAmount(0);
    }
    setPayMethod("cash");
    setPayDate(toLocalInput(new Date().toISOString()));
    setPayLoading(false);
    setEditingPaymentId(null);
  }, [open, mode, workItem, initialTab]);

  // Esc로 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // 결제 등록
  const handleAddPayment = async () => {
    if (!workItem || payAmount <= 0) return;
    setPayLoading(true);
    try {
      await paymentApi.create({ workItemId: workItem.id, amount: payAmount, method: payMethod, paidAt: payDate ? fromLocalInput(payDate) : undefined });
      const updated = await paymentApi.list(workItem.id);
      setPayments(updated);
      const newPaid = updated.reduce((s, p) => s + p.amount, 0);
      const remaining = workItem.price - newPaid;
      setPayAmount(remaining > 0 ? remaining : 0);
      onPaymentChange?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPayLoading(false);
    }
  };

  // 결제 수정 모드 진입
  const handleEditPayment = (p: Payment) => {
    setEditingPaymentId(p.id);
    setEditAmount(p.amount);
    setEditMethod(p.method ?? "cash");
    setEditDate(toLocalInput(p.paidAt));
  };

  // 결제 수정 저장
  const handleSaveEditPayment = async () => {
    if (!workItem || editingPaymentId === null || editAmount <= 0) return;
    setPayLoading(true);
    try {
      await paymentApi.update(editingPaymentId, {
        amount: editAmount,
        method: editMethod || null,
        paidAt: editDate ? fromLocalInput(editDate) : undefined,
      });
      const updated = await paymentApi.list(workItem.id);
      setPayments(updated);
      const newPaid = updated.reduce((s, p) => s + p.amount, 0);
      const remaining = workItem.price - newPaid;
      setPayAmount(remaining > 0 ? remaining : 0);
      setEditingPaymentId(null);
      onPaymentChange?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPayLoading(false);
    }
  };

  // 결제 수정 취소
  const handleCancelEdit = () => setEditingPaymentId(null);

  const payAmountRef = useRef<HTMLInputElement>(null);

  // 탭 전환 시 포커스
  useEffect(() => {
    if (activeTab === "payment") {
      setTimeout(() => payAmountRef.current?.focus(), 50);
    }
  }, [activeTab]);

  // 결제 삭제
  const handleDeletePayment = async (paymentId: number) => {
    if (!workItem) return;
    setPayLoading(true);
    try {
      await paymentApi.delete(paymentId);
      const updated = await paymentApi.list(workItem.id);
      setPayments(updated);
      const newPaid = updated.reduce((s, p) => s + p.amount, 0);
      const remaining = workItem.price - newPaid;
      setPayAmount(remaining > 0 ? remaining : 0);
      onPaymentChange?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPayLoading(false);
    }
  };

  // 품목 행 변경
  const updateDetail = (key: number, field: keyof DetailInput, value: string | number) => {
    setDetails((prev) =>
      prev.map((d) => (d._key === key ? { ...d, [field]: value } : d))
    );
  };

  const addDetail = () => {
    const newRow = emptyDetail();
    setDetails((prev) => [...prev, newRow]);
    // 다음 렌더링 후 새 행의 품목명에 포커스
    setTimeout(() => {
      const el = itemRefs.current.get(newRow._key);
      el?.focus();
    }, 50);
  };

  const removeDetail = (key: number) => {
    setDetails((prev) => {
      const next = prev.filter((d) => d._key !== key);
      return next.length === 0 ? [emptyDetail()] : next;
    });
  };

  const handleSubmit = async () => {
    const trimmedDesc = description.trim();
    if (!trimmedDesc) {
      setError("작업내용을 입력해주세요.");
      descRef.current?.focus();
      return;
    }
    // 품목 유효성: 빈 행 제거 후 검증
    const validDetails = details.filter((d) => d.itemName.trim());
    if (validDetails.length === 0 && !manualPrice) {
      setError("품목을 하나 이상 입력하거나 가격을 직접 입력해주세요.");
      return;
    }

    setError("");
    setSaving(true);
    try {
      const detailInputs: DetailInput[] = validDetails.map((d) => ({
        itemName: d.itemName.trim(),
        unitPrice: d.unitPrice,
        quantity: d.quantity,
        optionsMemo: d.optionsMemo?.trim() || null,
      }));

      if (mode === "create") {
        const statusOverride = status !== "Received" ? status : undefined;
        const pickupDate = pickedUpAt ? fromLocalInput(pickedUpAt) : undefined;
        await onSave({
          customerId,
          description: trimmedDesc,
          price: effectivePrice,
          note: note.trim() || null,
          receivedAt: receivedAt ? fromLocalInput(receivedAt) : null,
          details: detailInputs,
        } as CreateWorkItem, undefined, statusOverride, pickupDate);
      } else {
        const statusChanged = workItem && status !== workItem.status ? status : undefined;
        await onSave(
          {
            description: trimmedDesc,
            price: effectivePrice,
            note: note.trim(),
            receivedAt: receivedAt ? fromLocalInput(receivedAt) : null,
            pickedUpAt: pickedUpAt ? fromLocalInput(pickedUpAt) : "",
          } as UpdateWorkItem,
          detailInputs,
          statusChanged,
        );
      }
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!open) return null;

  const inputCls = "w-full px-3 py-2 border border-border-default rounded-lg text-sm bg-surface-card text-on-surface placeholder:text-on-surface-muted focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-surface-card rounded-xl shadow-2xl border border-border-default w-[620px] h-[min(85vh,600px)] flex flex-col animate-in fade-in zoom-in-95 duration-200"
        onKeyDown={handleKeyDown}
      >
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default shrink-0">
          <h3 className="text-lg font-semibold text-on-surface">
            {mode === "create" ? "작업 접수" : "작업 수정"}
          </h3>
          <button onClick={onClose} className="p-2 -mr-1 rounded-lg hover:bg-surface-elevated text-on-surface-muted transition-colors cursor-pointer" aria-label="닫기">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 탭 바 (edit 모드에서만) */}
        {mode === "edit" && (
          <div className="flex border-b border-border-default shrink-0">
            {([["info", "작업 정보"], ["payment", "결제 관리"]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                  activeTab === key
                    ? "text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400"
                    : "text-on-surface-muted hover:text-on-surface hover:bg-surface-elevated"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* body - scrollable */}
        <div
          className="flex-1 overflow-y-auto px-5 py-4 space-y-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {error && (
            <div className="text-sm text-danger-600 dark:text-danger-400 bg-danger-50 dark:bg-danger-950 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          {activeTab === "info" ? (
            <>
          {/* 작업내용 */}
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">
              작업내용 <span className="text-danger-500">*</span>
            </label>
            <input
              ref={descRef}
              type="text"
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="작업 내용 요약"
              className={inputCls}
            />
          </div>

          {/* 상태 + 날짜 */}
          <div className="flex gap-3">
            <div className="w-24 shrink-0">
              <label className="block text-sm font-medium text-on-surface mb-1">상태</label>
              <select
                value={status}
                onChange={(e) => {
                  const next = e.target.value as WorkItemStatus;
                  setStatus(next);
                  if (next !== "PickedUp") setPickedUpAt("");
                  else if (!pickedUpAt) setPickedUpAt(toLocalInput(new Date().toISOString()));
                }}
                className={inputCls}
              >
                <option value="Received">접수</option>
                <option value="Completed">완료</option>
                <option value="PickedUp">수령</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-on-surface mb-1">접수일시</label>
              <input
                type="datetime-local"
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="flex-1">
              <label className={`block text-sm font-medium mb-1 ${status === "PickedUp" ? "text-on-surface" : "text-on-surface-muted"}`}>수령일시</label>
              <input
                type="datetime-local"
                value={pickedUpAt}
                onChange={(e) => setPickedUpAt(e.target.value)}
                disabled={status !== "PickedUp"}
                className={`${inputCls} disabled:opacity-40 disabled:cursor-not-allowed`}
              />
            </div>
          </div>

          {/* 품목 테이블 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-on-surface">품목</label>
              <button
                onClick={addDetail}
                type="button"
                className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> 행 추가
              </button>
            </div>
            <div className="border border-border-default rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-elevated text-on-surface-muted">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium">품목명</th>
                    <th className="px-2 py-2 text-right font-medium w-24">단가</th>
                    <th className="px-2 py-2 text-center font-medium w-16">수량</th>
                    <th className="px-2 py-2 text-right font-medium w-24">소계</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default">
                  {details.map((d) => (
                    <tr key={d._key}>
                      <td className="px-2 py-1.5">
                        <input
                          ref={(el) => {
                            if (el) itemRefs.current.set(d._key, el);
                            else itemRefs.current.delete(d._key);
                          }}
                          type="text"
                          value={d.itemName}
                          onChange={(e) => updateDetail(d._key, "itemName", e.target.value)}
                          placeholder="품목명"
                          className="w-full px-2 py-1 border border-border-default rounded-lg text-sm bg-surface-card text-on-surface focus:outline-none focus:border-primary-500"
                        />
                        <div className="mt-1 flex items-center gap-1">
                          <span className="text-[0.6875rem] text-on-surface-muted/60 shrink-0">&#8627;</span>
                          <input
                            type="text"
                            value={d.optionsMemo ?? ""}
                            onChange={(e) => updateDetail(d._key, "optionsMemo", e.target.value)}
                            placeholder="옵션 메모 (선택)"
                            className="flex-1 px-2 py-0.5 border border-border-default rounded text-[0.6875rem] bg-surface text-on-surface-muted placeholder:text-on-surface-muted/50 focus:outline-none focus:border-primary-400"
                          />
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <CurrencyInput
                          value={d.unitPrice}
                          onChange={(val) => updateDetail(d._key, "unitPrice", val)}
                          placeholder="0"
                          className="w-full px-2 py-1 border border-border-default rounded-lg text-sm text-right bg-surface-card text-on-surface focus:outline-none focus:border-primary-500"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <NumberInput
                          min={1}
                          value={d.quantity}
                          onChange={(val) => updateDetail(d._key, "quantity", Math.max(1, val))}
                          className="w-full px-2 py-1 border border-border-default rounded-lg text-sm text-center bg-surface-card text-on-surface focus:outline-none focus:border-primary-500"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right text-sm font-medium text-on-surface">
                        {(d.unitPrice * d.quantity).toLocaleString()}원
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <button
                          onClick={() => removeDetail(d._key)}
                          type="button"
                          className="p-1.5 text-on-surface-muted hover:text-danger-500 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 가격 */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <label className="text-sm font-medium text-on-surface">가격</label>
                <label className="flex items-center gap-1.5 text-sm text-on-surface-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={manualPrice}
                    onChange={(e) => {
                      setManualPrice(e.target.checked);
                      if (!e.target.checked) setPriceInput(0);
                    }}
                    className="rounded border-border-default"
                  />
                  직접 입력
                </label>
              </div>
              {manualPrice ? (
                <CurrencyInput
                  value={priceInput}
                  onChange={setPriceInput}
                  placeholder="가격 직접 입력"
                  className={inputCls}
                />
              ) : (
                <div className="px-3 py-2 border border-border-default rounded-lg text-sm bg-surface-elevated text-on-surface font-medium">
                  {autoPrice.toLocaleString()}원 (자동 합산)
                </div>
              )}
            </div>
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">메모</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="작업 관련 메모"
              rows={2}
              className={`${inputCls} resize-y min-h-[60px]`}
            />
          </div>
            </>
          ) : (
            <>
          {/* ===== 결제 관리 탭 ===== */}
          {(() => {
            const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
            const remaining = (workItem?.price ?? 0) - totalPaid;
            return (
              <>
                {/* 요약 카드 */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-surface-elevated rounded-lg px-4 py-3 text-center">
                    <div className="text-sm text-on-surface-muted mb-1">종액</div>
                    <div className="text-lg font-bold text-on-surface">{(workItem?.price ?? 0).toLocaleString()}원</div>
                  </div>
                  <div className="bg-surface-elevated rounded-lg px-4 py-3 text-center">
                    <div className="text-sm text-on-surface-muted mb-1">납부액</div>
                    <div className="text-lg font-bold text-primary-600 dark:text-primary-400">{totalPaid.toLocaleString()}원</div>
                  </div>
                  <div className={`rounded-lg px-4 py-3 text-center ${remaining > 0 ? "bg-danger-50 dark:bg-danger-950" : "bg-success-50 dark:bg-success-950"}`}>
                    <div className="text-sm text-on-surface-muted mb-1">잔액</div>
                    <div className={`text-lg font-bold ${remaining > 0 ? "text-danger-600 dark:text-danger-400" : "text-success-600 dark:text-success-400"}`}>
                      {remaining > 0 ? `${remaining.toLocaleString()}원` : "완납"}
                    </div>
                  </div>
                </div>

                {/* 결제 내역 */}
                <div>
                  <label className="block text-sm font-medium text-on-surface mb-2">결제 내역</label>
                  {payments.length > 0 ? (
                    <div className="border border-border-default rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-surface-elevated text-on-surface-muted">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">일시</th>
                            <th className="px-3 py-2 text-right font-medium">금액</th>
                            <th className="px-3 py-2 text-left font-medium">수단</th>
                            <th className="w-16"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-default">
                          {payments.map((p) => (
                            editingPaymentId === p.id ? (
                              <tr key={p.id} className="bg-surface-elevated/50">
                                <td className="px-2 py-1.5">
                                  <input
                                    type="datetime-local"
                                    value={editDate}
                                    onChange={(e) => setEditDate(e.target.value)}
                                    className="w-full text-sm border border-border-default rounded-lg px-1.5 py-1 bg-surface-base text-on-surface"
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <CurrencyInput
                                    value={editAmount}
                                    onChange={setEditAmount}
                                    className="w-full text-sm border border-border-default rounded-lg px-1.5 py-1 bg-surface-base text-on-surface text-right"
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <select
                                    value={editMethod}
                                    onChange={(e) => setEditMethod(e.target.value)}
                                    className="w-full text-sm border border-border-default rounded-lg px-1.5 py-1 bg-surface-base text-on-surface"
                                  >
                                    <option value="cash">현금</option>
                                    <option value="card">카드</option>
                                    <option value="transfer">계좌이체</option>
                                    <option value="credit">외상</option>
                                  </select>
                                </td>
                                <td className="px-1 py-1.5">
                                  <div className="flex gap-0.5 justify-center">
                                    <button
                                      onClick={handleSaveEditPayment}
                                      disabled={payLoading || editAmount <= 0}
                                      className="p-1.5 text-primary-600 hover:text-primary-700 transition-colors cursor-pointer disabled:opacity-30"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={handleCancelEdit}
                                      disabled={payLoading}
                                      className="p-1.5 text-on-surface-muted hover:text-on-surface transition-colors cursor-pointer disabled:opacity-30"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ) : (
                              <tr key={p.id}>
                                <td className="px-3 py-2 text-on-surface-muted text-[0.8125rem]">
                                  {new Date(p.paidAt).toLocaleDateString("ko-KR")} {new Date(p.paidAt).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", hour12: true })}
                                </td>
                                <td className="px-3 py-2 text-right font-medium text-on-surface">{p.amount.toLocaleString()}원</td>
                      <td className="px-3 py-2 text-on-surface-muted">{paymentMethodLabel(p.method)}</td>
                                <td className="px-1 py-2 text-center">
                                  <div className="flex gap-0.5 justify-center">
                                    <button
                                      onClick={() => handleEditPayment(p)}
                                      disabled={payLoading}
                                      className="p-1.5 text-on-surface-muted hover:text-primary-600 transition-colors cursor-pointer disabled:opacity-30"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeletePayment(p.id)}
                                      disabled={payLoading}
                                      className="p-1.5 text-on-surface-muted hover:text-danger-500 transition-colors cursor-pointer disabled:opacity-30"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-sm text-on-surface-muted text-center py-4 border border-border-default rounded-lg">
                      결제 내역이 없습니다.
                    </div>
                  )}
                </div>

                {/* 신규 결제 등록 */}
                {remaining > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-on-surface mb-2">결제 등록</label>
                    <div className="flex gap-2 items-end">
                      <div className="w-52">
                        <label className="block text-sm text-on-surface-muted mb-1">일시</label>
                        <input
                          type="datetime-local"
                          value={payDate}
                          onChange={(e) => setPayDate(e.target.value)}
                          className={inputCls}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm text-on-surface-muted mb-1">금액</label>
                        <CurrencyInput
                          ref={payAmountRef}
                          value={payAmount}
                          onChange={setPayAmount}
                          placeholder="결제 금액"
                          className={inputCls}
                        />
                      </div>
                      <div className="w-28">
                        <label className="block text-sm text-on-surface-muted mb-1">수단</label>
                        <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className={inputCls}>
                          <option value="cash">현금</option>
                          <option value="card">카드</option>
                          <option value="transfer">계좌이체</option>
                          <option value="credit">외상</option>
                        </select>
                      </div>
                      <button
                        onClick={handleAddPayment}
                        disabled={payLoading || payAmount <= 0}
                        className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {payLoading ? "처리 중..." : "등록"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
            </>
          )}
        </div>

        {/* footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border-default bg-surface-base/50 rounded-b-xl shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-on-surface-muted border border-border-default rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer"
          >
            {activeTab === "payment" ? "닫기" : "취소"}
          </button>
          {activeTab === "info" && (
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "저장 중..." : mode === "create" ? "접수" : "저장"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
