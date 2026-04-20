import { useState, useEffect, useRef } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import type { WorkItemFull, WorkItemStatus, CreateWorkItem, UpdateWorkItem, DetailInput } from "@/types";

// datetime-local <-> ISO 변환 헬퍼
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(local: string): string {
  if (!local) return "";
  return new Date(local).toISOString();
}

interface Props {
  open: boolean;
  mode: "create" | "edit";
  customerId: number;
  /** edit 모드에서 사용할 기존 데이터 (full) */
  workItem?: WorkItemFull | null;
  onSave: (data: CreateWorkItem | UpdateWorkItem, details?: DetailInput[], status?: WorkItemStatus, pickedUpAt?: string) => Promise<void>;
  onClose: () => void;
}

function emptyDetail(): DetailInput & { _key: number } {
  return { _key: Date.now() + Math.random(), itemName: "", unitPrice: 0, quantity: 1, optionsMemo: null };
}

type DetailRow = DetailInput & { _key: number };

export function WorkItemFormCard({ open, mode, customerId, workItem, onSave, onClose }: Props) {
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [details, setDetails] = useState<DetailRow[]>([emptyDetail()]);
  const [manualPrice, setManualPrice] = useState(false);
  const [priceInput, setPriceInput] = useState("");
  const [status, setStatus] = useState<WorkItemStatus>("Received");
  const [receivedAt, setReceivedAt] = useState("");
  const [pickedUpAt, setPickedUpAt] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const descRef = useRef<HTMLInputElement>(null);

  // 자동 합산 가격
  const autoPrice = details.reduce((sum, d) => sum + d.unitPrice * d.quantity, 0);
  const effectivePrice = manualPrice ? (parseInt(priceInput, 10) || 0) : autoPrice;

  // 열릴 때 폼 초기화
  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && workItem) {
      setDescription(workItem.description);
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
      setPriceInput(String(workItem.price));
    } else {
      setDescription("");
      setNote("");
      setStatus("Received");
      setReceivedAt(toLocalInput(new Date().toISOString()));
      setPickedUpAt("");
      setDetails([emptyDetail()]);
      setManualPrice(false);
      setPriceInput("");
    }
    setError("");
    setSaving(false);
    const t = setTimeout(() => descRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [open, mode, workItem]);

  // Esc로 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // 품목 행 변경
  const updateDetail = (key: number, field: keyof DetailInput, value: string | number) => {
    setDetails((prev) =>
      prev.map((d) => (d._key === key ? { ...d, [field]: value } : d))
    );
  };

  const addDetail = () => setDetails((prev) => [...prev, emptyDetail()]);

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
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-elevated text-on-surface-muted transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* body - scrollable */}
        <div
          className="flex-1 overflow-y-auto px-5 py-4 space-y-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {error && (
            <div className="text-sm text-danger-600 dark:text-danger-400 bg-danger-50 dark:bg-danger-950 px-3 py-2 rounded">
              {error}
            </div>
          )}

          {/* 작업내용 */}
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">
              작업내용 <span className="text-danger-500">*</span>
            </label>
            <input
              ref={descRef}
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="세탁 내용 요약"
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
                className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium cursor-pointer"
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
                          type="text"
                          value={d.itemName}
                          onChange={(e) => updateDetail(d._key, "itemName", e.target.value)}
                          placeholder="품목명"
                          className="w-full px-2 py-1 border border-border-default rounded text-sm bg-surface-card text-on-surface focus:outline-none focus:border-primary-500"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          value={d.unitPrice || ""}
                          onChange={(e) => updateDetail(d._key, "unitPrice", parseInt(e.target.value, 10) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 border border-border-default rounded text-sm text-right bg-surface-card text-on-surface focus:outline-none focus:border-primary-500"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min={1}
                          value={d.quantity}
                          onChange={(e) => updateDetail(d._key, "quantity", Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="w-full px-2 py-1 border border-border-default rounded text-sm text-center bg-surface-card text-on-surface focus:outline-none focus:border-primary-500"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right text-sm font-medium text-on-surface">
                        {(d.unitPrice * d.quantity).toLocaleString()}원
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <button
                          onClick={() => removeDetail(d._key)}
                          type="button"
                          className="p-1 text-on-surface-muted hover:text-danger-500 transition-colors cursor-pointer"
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
                <label className="flex items-center gap-1.5 text-xs text-on-surface-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={manualPrice}
                    onChange={(e) => {
                      setManualPrice(e.target.checked);
                      if (!e.target.checked) setPriceInput("");
                    }}
                    className="rounded border-border-default"
                  />
                  직접 입력
                </label>
              </div>
              {manualPrice ? (
                <input
                  type="number"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
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
        </div>

        {/* footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border-default bg-surface-base/50 rounded-b-xl shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-on-surface-muted border border-border-default rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "저장 중..." : mode === "create" ? "접수" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
