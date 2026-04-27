import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { Customer, CreateCustomer, UpdateCustomer } from "@/types";

// 전화번호 포맷: 02-XXX(X)-XXXX / 0XX-XXX(X)-XXXX
function formatPhone(digits: string): string {
  const isSeoul = digits.startsWith("02");
  const areaLen = isSeoul ? 2 : 3;
  const maxLen = isSeoul ? 10 : 11;

  if (digits.length <= areaLen) return digits;
  const area = digits.slice(0, areaLen);
  const rest = digits.slice(areaLen);
  const midLen = digits.length >= maxLen ? 4 : 3;
  if (rest.length <= midLen) return `${area}-${rest}`;
  return `${area}-${rest.slice(0, midLen)}-${rest.slice(midLen)}`;
}

function getMaxDigits(digits: string): number {
  return digits.startsWith("02") ? 10 : 11;
}

interface Props {
  open: boolean;
  mode: "create" | "edit";
  customer?: Customer | null;
  onSave: (data: CreateCustomer | UpdateCustomer) => Promise<void>;
  onClose: () => void;
}

export function CustomerFormCard({ open, mode, customer, onSave, onClose }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

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

    if (customer) {
      setName(customer.name);
      // 숫자만 추출 후 포맷팅 적용
      const digits = (customer.phoneNumber ?? "").replace(/\D/g, "");
      setPhone(digits ? formatPhone(digits) : "");
      setNote(customer.note ?? "");
    } else {
      setName("");
      setPhone("");
      setNote("");
    }
    setError("");
    setSaving(false);
  }, [open, mode, customer]);

  // Esc로 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const cursorPos = input.selectionStart ?? 0;
    const digits = input.value.replace(/\D/g, "");
    if (digits.length > getMaxDigits(digits)) return;
    const formatted = formatPhone(digits);
    // 커서 앞쪽 숫자 개수 기준으로 위치 계산
    const digitsBefore = input.value.slice(0, cursorPos).replace(/\D/g, "").length;
    let newCursor = 0;
    let count = 0;
    for (let i = 0; i < formatted.length && count < digitsBefore; i++) {
      newCursor = i + 1;
      if (formatted[i] !== "-") count++;
    }
    setPhone(formatted);
    requestAnimationFrame(() => {
      phoneInputRef.current?.setSelectionRange(newCursor, newCursor);
    });
  };

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("이름을 입력해주세요.");
      nameRef.current?.focus();
      return;
    }
    setError("");
    setSaving(true);
    try {
      await onSave({
        name: trimmed,
        phoneNumber: phone.trim() || null,
        note: note.trim() || null,
      });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // input 필드에서 Enter -> 제출 (textarea는 제외)
    if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!open) return null;

  return (
    // backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* card */}
      <div
        className="bg-surface-card rounded-xl shadow-2xl border border-border-default w-[420px] animate-in fade-in zoom-in-95 duration-200"
        onKeyDown={handleKeyDown}
      >
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <h3 className="text-lg font-semibold text-on-surface">
            {mode === "create" ? "고객 추가" : "고객 수정"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-elevated text-on-surface-muted transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* body */}
        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="text-sm text-danger-600 dark:text-danger-400 bg-danger-50 dark:bg-danger-950 px-3 py-2 rounded">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="customer-name" className="block text-sm font-medium text-on-surface mb-1">
              이름 <span className="text-danger-500">*</span>
            </label>
            <input
              id="customer-name"
              ref={nameRef}
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="고객 이름"
              className="w-full px-3 py-2 border border-border-default rounded-lg text-sm bg-surface-card text-on-surface placeholder:text-on-surface-muted focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label htmlFor="customer-phone" className="block text-sm font-medium text-on-surface mb-1">
              전화번호
            </label>
            <input
              id="customer-phone"
              ref={phoneInputRef}
              type="text"
              value={phone}
              onChange={handlePhoneChange}
              placeholder="010-0000-0000"
              className="w-full px-3 py-2 border border-border-default rounded-lg text-sm bg-surface-card text-on-surface placeholder:text-on-surface-muted focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label htmlFor="customer-note" className="block text-sm font-medium text-on-surface mb-1">
              메모
            </label>
            <textarea
              id="customer-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="고객 관련 메모"
              rows={3}
              className="w-full px-3 py-2 border border-border-default rounded-lg text-sm bg-surface-card text-on-surface placeholder:text-on-surface-muted focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 resize-none"
            />
          </div>
        </div>

        {/* footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border-default bg-surface-base/50 rounded-b-xl">
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
            {saving ? "저장 중..." : mode === "create" ? "추가" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
