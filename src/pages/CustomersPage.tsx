import { useState, useMemo, useEffect, useCallback, useRef, Fragment } from "react";
import { useLocation } from "react-router";
import {
  Search,
  Plus,
  Trash2,
  Pencil,
  Users,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  X,
} from "lucide-react";
import type { Customer, WorkItemFull, WorkItemDetail, WorkItemStatus, CreateWorkItem, UpdateWorkItem, DetailInput, CreateCustomer, UpdateCustomer } from "@/types";
import { useCustomerStore } from "@/stores/customerStore";
import { useWorkItemStore } from "@/stores/workItemStore";
import { useDialogStore } from "@/stores/dialogStore";
import { workItemApi } from "@/bindings";
import { CustomerFormCard } from "@/pages/customers/CustomerFormCard";
import { WorkItemFormCard } from "@/pages/customers/WorkItemFormCard";

// 날짜 포맷 헬퍼
function formatDateShort(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const now = new Date();
  const isCurrentYear = d.getFullYear() === now.getFullYear();

  if (isCurrentYear) {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDateFull(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }) + " " + d.toLocaleTimeString("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const STATUS_CONFIG: Record<WorkItemStatus, { label: string; cls: string }> = {
  Received: { label: "접수", cls: "bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300" },
  Completed: { label: "완료", cls: "bg-success-100 text-success-700 dark:bg-success-900/50 dark:text-success-300" },
  PickedUp: { label: "수령", cls: "bg-secondary-200 text-secondary-600 dark:bg-secondary-700 dark:text-secondary-300" },
};

function StatusBadge({ status }: { status: WorkItemStatus }) {
  const c = STATUS_CONFIG[status];
  if (!c) return null;
  return <span className={`inline-block px-2.5 py-1 rounded text-xs font-bold whitespace-nowrap ${c.cls}`}>{c.label}</span>;
}

// 상태 인라인 드롭다운
function StatusDropdown({ status, onChangeStatus }: { status: WorkItemStatus; onChangeStatus: (s: WorkItemStatus) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 외부 클릭으로 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const options: WorkItemStatus[] = ["Received", "Completed", "PickedUp"];

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="cursor-pointer"
      >
        <StatusBadge status={status} />
      </button>
      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-surface-card border border-border-default rounded-lg shadow-lg py-1 z-30 min-w-[80px]">
          {options.map((s) => {
            const c = STATUS_CONFIG[s];
            return (
              <button
                key={s}
                onClick={(e) => { e.stopPropagation(); onChangeStatus(s); setOpen(false); }}
                className={`w-full px-3 py-1.5 text-xs font-bold text-left hover:bg-surface-elevated transition-colors cursor-pointer ${s === status ? "opacity-50" : ""}`}
              >
                <span className={`inline-block px-2 py-0.5 rounded ${c.cls}`}>{c.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==========================================
// 좌측: 고객 목록 패널
// ==========================================
function CustomerListPanel({
  selectedId,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
  scrollToId,
  searchKeyword,
  onSearchChange,
  filtered,
  isActive,
}: {
  selectedId: number | null;
  onSelect: (c: Customer) => void;
  onAdd: () => void;
  onEdit: () => void;
  onDelete: () => void;
  scrollToId: number | null;
  searchKeyword: string;
  onSearchChange: (kw: string) => void;
  filtered: Customer[];
  isActive?: boolean;
}) {
  const { unpaidMap } = useCustomerStore();
  const itemRefs = useRef<Map<number, HTMLLIElement>>(new Map());

  // scrollToId 변경 시 해당 항목으로 스크롤
  useEffect(() => {
    if (scrollToId == null) return;
    const el = itemRefs.current.get(scrollToId);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [scrollToId]);

  return (
    <div className={`w-[380px] bg-surface-card rounded-lg shadow-sm flex flex-col overflow-hidden shrink-0 border transition-colors ${isActive ? "border-primary-400/70" : "border-border-default"}`}>
      {/* 헤더 */}
      <div className="bg-secondary-800 dark:bg-secondary-900 text-white px-4 py-3 flex items-center shrink-0">
        <Users className="w-5 h-5 mr-2 text-secondary-300" />
        <h2 className="font-medium">
          고객 목록{" "}
          <span className="text-secondary-400 ml-1">
            {searchKeyword ? `검색 ${filtered.length}명` : `${filtered.length}명`}
          </span>
        </h2>
      </div>

      {/* 검색 + 액션 */}
      <div className="p-3 border-b border-border-default flex gap-2 items-center shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-muted w-4 h-4" />
          <input
            type="text"
            placeholder="이름 / 전화번호 검색"
            value={searchKeyword}
            onChange={(e) => onSearchChange(e.target.value)}
            className={`w-full pl-9 py-2 border border-border-default rounded text-sm bg-surface-card text-on-surface placeholder:text-on-surface-muted focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 ${searchKeyword ? "pr-8" : "pr-3"}`}
          />
          {searchKeyword && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-muted hover:text-on-surface transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          onClick={onAdd}
          className="flex items-center px-3 py-2 bg-primary-600 text-white rounded text-sm font-medium hover:bg-primary-700 transition-colors cursor-pointer">
          <Plus className="w-4 h-4 mr-1" /> 추가
        </button>
        <button
          onClick={onEdit}
          disabled={selectedId === null}
          className="p-2 border border-border-default rounded text-on-surface-muted hover:bg-surface-elevated transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          disabled={selectedId === null}
          className="p-2 border border-danger-200 dark:border-danger-800 rounded text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-950 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* 리스트 */}
      <ul className="flex-1 overflow-y-auto divide-y divide-border-default">
        {filtered.map((c) => {
          const isSelected = selectedId === c.id;
          return (
            <li
              key={c.id}
              ref={(el) => {
                if (el) itemRefs.current.set(c.id, el);
                else itemRefs.current.delete(c.id);
              }}
              onClick={() => onSelect(c)}
              className={`p-4 cursor-pointer transition-colors ${
                isSelected
                  ? "bg-primary-50 dark:bg-primary-950 border-l-4 border-l-primary-500"
                  : "hover:bg-surface-elevated border-l-4 border-l-transparent"
              }`}
            >
      <div className="flex justify-between items-center mb-1">
                <span
                  className={`font-medium truncate min-w-0 flex-1 mr-2 ${
                    isSelected ? "text-primary-700 dark:text-primary-300" : "text-on-surface"
                  }`}
                >
                  {c.name}
                </span>
                <span className="text-sm text-on-surface-muted shrink-0">{c.phoneNumber || "-"}</span>
              </div>
              <div className="flex justify-between items-center">
                <div
                  className={`text-sm truncate flex-1 ${
                    isSelected ? "text-primary-500/80 dark:text-primary-400/80" : "text-on-surface-muted"
                  }`}
                >
                  {c.note || "\u00A0"}
                </div>
                {unpaidMap[c.id] && (
                  <span className="text-xs font-bold text-danger-600 dark:text-danger-400 whitespace-nowrap ml-2">
                    미수금 {unpaidMap[c.id].toLocaleString()}원
                  </span>
                )}
              </div>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <div className="p-8 text-center text-on-surface-muted text-sm">
            {searchKeyword ? "검색 결과가 없습니다." : "등록된 고객이 없습니다."}
          </div>
        )}
      </ul>
    </div>
  );
}

// ==========================================
// 우측: 작업 항목 패널
// ==========================================
function WorkItemListPanel({
  customer,
  expandedId,
  setExpandedId,
  isActive,
  onAdd,
  onEdit,
  onDelete,
  onChangeStatus,
  onPayment,
  activeWorkItemId,
  detailsRefreshId,
  onGoToPreviousPanel,
  focusWorkItemId,
}: {
  customer: Customer | null;
  expandedId: number | null;
  setExpandedId: (id: number | null) => void;
  isActive: boolean;
  onAdd: () => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onChangeStatus: (id: number, status: WorkItemStatus) => void;
  onPayment: (id: number) => void;
  activeWorkItemId: number | null;
  detailsRefreshId: { id: number; nonce: number } | null;
  onGoToPreviousPanel: () => void;
  focusWorkItemId?: number | null;
}) {
  const { workItems } = useWorkItemStore();

  // 키보드 하이라이트 (sortedItems 기반으로 관리)
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  // 고객 변경 시 하이라이트 초기화
  useEffect(() => {
    setHighlightedIdx(0);
  }, [customer?.id]);

  // 컬럼 정렬 상태: null -> asc -> desc -> null (3-state)
  type SortCol = "status" | "receivedAt" | "pickedUpAt" | "description" | "price";
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);

  const handleSortClick = (col: SortCol) => {
    if (sortCol !== col) {
      setSortCol(col);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else if (sortDir === "desc") {
      setSortCol(null);
      setSortDir(null);
    }
  };

  const sortedItems = useMemo(() => {
    if (!sortCol || !sortDir) return workItems;
    return [...workItems].sort((a, b) => {
      let av: string | number | null;
      let bv: string | number | null;
      if (sortCol === "status") { av = a.status; bv = b.status; }
      else if (sortCol === "receivedAt") { av = a.receivedAt; bv = b.receivedAt; }
      else if (sortCol === "pickedUpAt") { av = a.pickedUpAt; bv = b.pickedUpAt; }
      else if (sortCol === "description") { av = a.description; bv = b.description; }
      else { av = a.price; bv = b.price; }
      if (av === null || av === undefined) return sortDir === "asc" ? 1 : -1;
      if (bv === null || bv === undefined) return sortDir === "asc" ? -1 : 1;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [workItems, sortCol, sortDir]);

  // 키보드로 하이라이트 이동 시 해당 행 스크롤
  useEffect(() => {
    const item = sortedItems[highlightedIdx];
    if (!item) return;
    const el = rowRefs.current.get(item.id);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightedIdx, sortedItems]);

  // 아코디언 상세: 열 때 lazy load, 로컬 캐시
  const [detailsCache, setDetailsCache] = useState<Record<number, WorkItemDetail[]>>({});

  // 수정 완료 시 해당 캐시 항목 무효화 -> 다음 열기 때 재로드
  // nonce를 포함한 객체를 사용해 같은 ID를 연속 저장해도 effect 항상 재실행
  // 현재 열려있는 행이면 즉시 재조회
  useEffect(() => {
    if (detailsRefreshId === null) return;
    const { id } = detailsRefreshId;
    setDetailsCache((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (expandedId === id) {
      workItemApi.get(id).then((full) => {
        setDetailsCache((prev) => ({ ...prev, [id]: full.details }));
      }).catch(() => {
        setDetailsCache((prev) => ({ ...prev, [id]: [] }));
      });
    }
  }, [detailsRefreshId, expandedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = useCallback(async (itemId: number) => {
    if (expandedId === itemId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(itemId);
    // 캐시에 없으면 로드
    if (!detailsCache[itemId]) {
      try {
        const full = await workItemApi.get(itemId);
        setDetailsCache((prev) => ({ ...prev, [itemId]: full.details }));
      } catch {
        setDetailsCache((prev) => ({ ...prev, [itemId]: [] }));
      }
    }
  }, [expandedId, setExpandedId, detailsCache]);

  // 고객 변경 시 디테일 캐시 초기화
  useEffect(() => {
    setDetailsCache({});
  }, [customer?.id]);

  // focusWorkItemId가 있으면 자동으로 해당 항목 expand + 스크롤
  useEffect(() => {
    if (!focusWorkItemId) return;
    
    // 데이터 로딩 대기 후 처리
    const timer = setTimeout(async () => {
      // 토글 대신 직접 ID 설정 (무한 반복 방지)
      setExpandedId(focusWorkItemId);
      
      // 캐시 데이터가 없으면 미리 로드 (handleToggle의 lazy load 로직 모사)
      if (!detailsCache[focusWorkItemId]) {
        try {
          const full = await workItemApi.get(focusWorkItemId);
          setDetailsCache((prev) => ({ ...prev, [focusWorkItemId]: full.details }));
        } catch (e) {
          console.error("Failed to lazy load details for focus item:", e);
        }
      }

      const el = rowRefs.current.get(focusWorkItemId);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [focusWorkItemId, setExpandedId, detailsCache]); // eslint-disable-line react-hooks/exhaustive-deps

  // isActive 패널에서만 키보드 네비게이션 처리
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIdx((prev) => Math.max(0, prev - 1));
          break;
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIdx((prev) => Math.min(sortedItems.length - 1, prev + 1));
          break;
        case "ArrowRight":
          e.preventDefault();
          { const item = sortedItems[highlightedIdx]; if (item) handleToggle(item.id); }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (expandedId !== null) { handleToggle(expandedId); }
          else { onGoToPreviousPanel(); }
          break;
        case "Enter": {
          e.preventDefault();
          const item = sortedItems[highlightedIdx];
          if (item) onEdit(item.id);
          break;
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive, sortedItems, highlightedIdx, expandedId, handleToggle, onGoToPreviousPanel, onEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!customer) {
    return (
      <div className="flex-1 bg-surface-card rounded-lg shadow-sm border border-border-default flex flex-col items-center justify-center text-on-surface-muted">
        <ClipboardList className="w-16 h-16 mb-4 opacity-20" />
        <h3 className="text-lg font-medium">고객을 선택해주세요</h3>
      </div>
    );
  }

  const totalAmount = workItems.reduce((sum, item) => sum + item.price, 0);
  const totalUnpaid = workItems.reduce(
    (sum, item) => sum + (item.price - item.paidAmount),
    0
  );

  return (
    <div className={`flex-1 bg-surface-card rounded-lg shadow-sm flex flex-col overflow-hidden border transition-colors ${isActive ? "border-primary-400/70" : "border-border-default"}`}>
      {/* 헤더 */}
      <div className="bg-secondary-800 dark:bg-secondary-900 text-white px-4 py-3 flex items-center shrink-0">
        <ClipboardList className="w-5 h-5 mr-2 text-secondary-300" />
        <h2 className="font-medium">
          작업 항목 - {customer.name}{" "}
          <span className="text-secondary-400 ml-1">({workItems.length}건)</span>
        </h2>
      </div>

      {/* 요약 + 버튼 */}
      <div className="p-3 border-b border-border-default flex justify-between items-center shrink-0">
        <div className="flex space-x-6 px-2 text-sm">
          <span className="text-on-surface-muted">
            청구 합계:{" "}
            <strong className="text-on-surface text-base ml-1">
              {totalAmount.toLocaleString()}원
            </strong>
          </span>
          <span className="text-on-surface-muted">
            미수금:{" "}
            <strong className="text-danger-600 text-base ml-1">
              {totalUnpaid.toLocaleString()}원
            </strong>
          </span>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={onAdd}
            className="flex items-center px-3 py-2 bg-primary-600 text-white rounded text-sm font-medium hover:bg-primary-700 transition-colors cursor-pointer">
            <Plus className="w-4 h-4 mr-1" /> 추가
          </button>
          <button
            onClick={() => activeWorkItemId && onEdit(activeWorkItemId)}
            disabled={!activeWorkItemId}
            className="p-2 border border-border-default rounded text-on-surface-muted hover:bg-surface-elevated transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => activeWorkItemId && onDelete(activeWorkItemId)}
            disabled={!activeWorkItemId}
            className="p-2 border border-danger-200 dark:border-danger-800 rounded text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-950 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 테이블 */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-surface-elevated sticky top-0 border-b border-border-default text-on-surface-muted z-10">
            <tr>
              {(["status", "receivedAt", "pickedUpAt", "description", "price"] as const).map((col) => {
                const labels: Record<string, string> = { status: "상태", receivedAt: "접수", pickedUpAt: "수령", description: "작업내용", price: "금액" };
                const widths: Record<string, string> = { status: "px-2 py-3 text-center w-24", receivedAt: "px-2 py-3 w-12 whitespace-nowrap", pickedUpAt: "px-2 py-3 w-12 whitespace-nowrap", description: "px-3 py-3", price: "px-3 py-3 w-24" };
                const isSortActive = sortCol === col;
                return (
                  <th
                    key={col}
                    onClick={() => handleSortClick(col)}
                    className={`${widths[col]} font-medium cursor-pointer select-none hover:text-on-surface transition-colors group`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {labels[col]}
                      {isSortActive && sortDir === "asc" && <ChevronUp className="w-3.5 h-3.5 text-primary-500" />}
                      {isSortActive && sortDir === "desc" && <ChevronDown className="w-3.5 h-3.5 text-primary-500" />}
                      {!isSortActive && <ChevronsUpDown className="w-3.5 h-3.5 opacity-0 group-hover:opacity-40 transition-opacity" />}
                    </span>
                  </th>
                );
              })}
              <th className="px-3 py-3 font-medium w-28">메모</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {sortedItems.map((item, itemIdx) => {
              const isUnpaid = item.price > item.paidAmount;
              const isExpanded = expandedId === item.id;
              const isHighlighted = isActive && highlightedIdx === itemIdx;
              const details = detailsCache[item.id];
              return (
                <Fragment key={item.id}>
                  <tr
                    ref={(el) => {
                      if (el) rowRefs.current.set(item.id, el);
                      else rowRefs.current.delete(item.id);
                    }}
                    onClick={() => handleToggle(item.id)}
                    className={`hover:bg-surface-elevated transition-colors cursor-pointer ${isExpanded ? "bg-primary-50/60 dark:bg-primary-950/40" : ""} ${isHighlighted ? "ring-2 ring-inset ring-primary-400" : ""}`}
                  >
                    <td className="px-3 py-3 text-center">
                      <StatusDropdown status={item.status} onChangeStatus={(s) => onChangeStatus(item.id, s)} />
                    </td>
                    <td className="px-2 py-3 text-on-surface-muted font-mono text-[13px] tracking-tighter" title={formatDateFull(item.receivedAt)}>
                      {formatDateShort(item.receivedAt)}
                    </td>
                    <td className="px-2 py-3 text-on-surface-muted font-mono text-[13px] tracking-tighter" title={formatDateFull(item.pickedUpAt)}>
                      {formatDateShort(item.pickedUpAt)}
                    </td>
                    <td className="px-3 py-3 font-bold text-on-surface">
                      {item.description}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-base font-bold text-on-surface leading-none">
                          {item.price.toLocaleString()}원
                        </span>
                        {isUnpaid ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); onPayment(item.id); }}
                            className="px-2 py-0.5 bg-danger-50 dark:bg-danger-950 border border-danger-200 dark:border-danger-800 text-danger-600 dark:text-danger-400 rounded text-xs font-bold whitespace-nowrap leading-none cursor-pointer hover:bg-danger-100 dark:hover:bg-danger-900 transition-colors"
                          >
                            미수금 {(item.price - item.paidAmount).toLocaleString()}원
                          </button>
                        ) : (
                          <span className="px-2 py-0.5 bg-primary-50 dark:bg-primary-950 border border-primary-200 dark:border-primary-800 text-primary-600 dark:text-primary-400 rounded text-xs font-bold whitespace-nowrap leading-none">
                            완납
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-on-surface-muted text-[13px] max-w-[112px] truncate" title={item.note || ""}>
                      {item.note || ""}
                    </td>
                    <td className="px-2 py-3 text-center">
                      <ChevronDown className={`w-4 h-4 text-on-surface-muted transition-transform inline-block ${isExpanded ? "rotate-180" : ""}`} />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={7} className="bg-surface-elevated/50 dark:bg-surface-elevated/30 px-6 py-3">
                        {details === undefined ? (
                          <p className="text-sm text-on-surface-muted text-center py-2">로딩 중...</p>
                        ) : details.length > 0 ? (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-on-surface-muted text-xs">
                                <th className="text-left pb-1.5 font-medium">품목</th>
                                <th className="text-center pb-1.5 font-medium w-16">수량</th>
                                <th className="text-right pb-1.5 font-medium w-24">단가</th>
                                <th className="text-right pb-1.5 font-medium w-24">소계</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border-default/50">
                              {details.map((d) => (
                                <tr key={d.id}>
                                  <td className="py-1.5 text-on-surface">
                                    <span>{d.itemName}</span>
                                    {d.optionsMemo && (
                                      <p className="mt-0.5 text-[11px] text-on-surface-muted">&#8627; {d.optionsMemo}</p>
                                    )}
                                  </td>
                                  <td className="py-1.5 text-center text-on-surface-muted">{d.quantity}</td>
                                  <td className="py-1.5 text-right text-on-surface-muted">{d.unitPrice.toLocaleString()}원</td>
                                  <td className="py-1.5 text-right font-medium text-on-surface">{(d.quantity * d.unitPrice).toLocaleString()}원</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="text-sm text-on-surface-muted text-center py-2">상세 품목 정보 없음</p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {workItems.length === 0 && (
              <tr>
                <td colSpan={7} className="p-12 text-center text-on-surface-muted">
                  등록된 작업 항목이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==========================================
// 메인 레이아웃
// ==========================================
export function CustomersPage() {
  const { customers, selectedCustomer, select, load, create, update, delete: deleteCustomer, loadUnpaid } = useCustomerStore();
  const { workItems, setFilter } = useWorkItemStore();
  const { showConfirm } = useDialogStore();
  const location = useLocation();
  const [activePanel, setActivePanel] = useState<"customers" | "workItems">("customers");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [focusWorkItemId, setFocusWorkItemId] = useState<number | null>(null);

  // 고객 검색 (서버 사이드 API 호출)
  const [searchKeyword, setSearchKeyword] = useState("");
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const timer = setTimeout(() => {
      load(searchKeyword.trim()).then(() => loadUnpaid());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchKeyword, load, loadUnpaid]);

  const filteredCustomers = customers;

  // Floating Card 상태
  const [cardOpen, setCardOpen] = useState(false);
  const [cardMode, setCardMode] = useState<"create" | "edit">("create");
  const [scrollToCustomerId, setScrollToCustomerId] = useState<number | null>(null);

  const handleAdd = () => { setCardMode("create"); setCardOpen(true); };
  const handleEdit = () => { if (!selectedCustomer) return; setCardMode("edit"); setCardOpen(true); };

  const handleDelete = async () => {
    if (!selectedCustomer) return;
    const confirmed = await showConfirm({
      title: "고객 삭제",
      message: `"${selectedCustomer.name}" 고객을 삭제하시겠습니까? 관련 접수 내역도 모두 삭제됩니다.`,
      confirmText: "삭제",
      isDestructive: true,
    });
    if (!confirmed) return;
    await deleteCustomer(selectedCustomer.id);
    const { customers: remaining } = useCustomerStore.getState();
    if (remaining.length > 0) select(remaining[0]);
    loadUnpaid();
  };

  const handleCardSave = async (data: CreateCustomer | UpdateCustomer) => {
    if (cardMode === "create") {
      const created = await create(data as CreateCustomer);
      select(created);
      setScrollToCustomerId(created.id);
      setTimeout(() => setScrollToCustomerId(null), 100);
    } else if (selectedCustomer) {
      await update(selectedCustomer.id, data as UpdateCustomer);
    }
    loadUnpaid();
  };

  // 작업항목 Floating Card 상태
  const [wiCardOpen, setWiCardOpen] = useState(false);
  const [wiCardMode, setWiCardMode] = useState<"create" | "edit">("create");
  const [editingWorkItem, setEditingWorkItem] = useState<WorkItemFull | null>(null);

  const handleWiAdd = () => {
    if (!selectedCustomer) return;
    setWiCardMode("create");
    setEditingWorkItem(null);
    setWiCardOpen(true);
  };

  const handleWiDelete = async (id: number) => {
    const item = workItems.find((w) => w.id === id);
    if (!item) return;
    const confirmed = await showConfirm({
      title: "작업 삭제",
      message: `"${item.description}" 작업을 삭제하시겠습니까?`,
      confirmText: "삭제",
      isDestructive: true,
    });
    if (!confirmed) return;
    await useWorkItemStore.getState().delete(id);
    loadUnpaid();
  };

  const handleWiChangeStatus = async (id: number, status: WorkItemStatus) => {
    await useWorkItemStore.getState().updateStatus(id, status);
    loadUnpaid();
  };

  // 미수금 뱃지 클릭 -> 결제 탭으로 열기
  const [wiInitialTab, setWiInitialTab] = useState<"info" | "payment">("info");
  const [detailsRefreshId, setDetailsRefreshId] = useState<{ id: number; nonce: number } | null>(null);

  const handleWiPayment = async (id: number) => {
    setWiCardMode("edit");
    const full = await workItemApi.get(id);
    setEditingWorkItem(full);
    setWiInitialTab("payment");
    setWiCardOpen(true);
  };

  const handleWiEdit = async (id: number) => {
    setWiCardMode("edit");
    const full = await workItemApi.get(id);
    setEditingWorkItem(full);
    setWiInitialTab("info");
    setWiCardOpen(true);
  };

  const handleWiCardSave = async (data: CreateWorkItem | UpdateWorkItem, details?: DetailInput[], status?: WorkItemStatus, pickedUpAtOverride?: string) => {
    if (wiCardMode === "create") {
      const created = await useWorkItemStore.getState().create(data as CreateWorkItem);
      if (status) {
        await useWorkItemStore.getState().updateStatus(created.id, status);
      }
      if (pickedUpAtOverride) {
        await useWorkItemStore.getState().update(created.id, { pickedUpAt: pickedUpAtOverride });
      }
    } else if (editingWorkItem) {
      // 순서 중요: updateStatus가 날짜를 자동 설정하므로 먼저 호출, 그 후 update로 날짜 덜어쓰기
      if (status) {
        await useWorkItemStore.getState().updateStatus(editingWorkItem.id, status);
      }
      await useWorkItemStore.getState().update(editingWorkItem.id, data as UpdateWorkItem);
      if (details) {
        await workItemApi.replaceDetails(editingWorkItem.id, details);
      }
      setDetailsRefreshId({ id: editingWorkItem.id, nonce: Date.now() });
    }
    loadUnpaid();
  };

  // 초기 로드
  useEffect(() => {
    const state = location.state as { focusCustomerId?: number; focusWorkItemId?: number } | null;
    const focusId = state?.focusCustomerId;
    const focusItemId = state?.focusWorkItemId;
    load().then(async () => {
      const { customers: loaded, selectedCustomer: current } = useCustomerStore.getState();
      if (focusId) {
        // POS에서 '지난 접수 확인'으로 진입한 경우 해당 고객 포커싱
        const target = loaded.find((c) => c.id === focusId);
        if (target) {
          select(target);
          setScrollToCustomerId(target.id);
          setTimeout(() => setScrollToCustomerId(null), 100);
          // 작업 항목 로드를 기다린 후 포커싱 (setTimeout 타이밍 했 제거)
          if (focusItemId) {
            await useWorkItemStore.getState().setFilter({ customerId: target.id });
            setFocusWorkItemId(focusItemId);
          }
        }
      } else if (!current && loaded.length > 0) {
        select(loaded[0]);
        const t = useCustomerStore.getState().selectedCustomer;
        if (t) setScrollToCustomerId(t.id);
      }
      useCustomerStore.getState().loadUnpaid();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 고객 선택 시 작업 항목 로드 + 아코디언 초기화
  useEffect(() => {
    if (selectedCustomer) {
      setFilter({ customerId: selectedCustomer.id });
    }
    setExpandedId(null);
  }, [selectedCustomer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 키보드 네비게이션 (customers 패널 전용; workItems 패널은 WorkItemListPanel 내부 처리)
  useEffect(() => {
    if (activePanel !== "customers") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      switch (e.key) {
        case "ArrowUp": {
          e.preventDefault();
          const idx = filteredCustomers.findIndex((c) => c.id === selectedCustomer?.id);
          if (idx > 0) select(filteredCustomers[idx - 1]);
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          const idx = filteredCustomers.findIndex((c) => c.id === selectedCustomer?.id);
          if (idx < filteredCustomers.length - 1) select(filteredCustomers[idx + 1]);
          break;
        }
        case "ArrowRight":
          e.preventDefault();
          setActivePanel("workItems");
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredCustomers, selectedCustomer, activePanel, select]);

  return (
    <div className="h-full flex gap-4">
      <CustomerListPanel
        selectedId={selectedCustomer?.id ?? null}
        onSelect={(c) => { select(c); setActivePanel("customers"); }}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDelete}
        scrollToId={scrollToCustomerId}
        searchKeyword={searchKeyword}
        onSearchChange={setSearchKeyword}
        filtered={filteredCustomers}
        isActive={activePanel === "customers"}
      />
      <WorkItemListPanel
        customer={selectedCustomer}
        expandedId={expandedId}
        setExpandedId={setExpandedId}
        isActive={activePanel === "workItems"}
        onAdd={handleWiAdd}
        onEdit={handleWiEdit}
        onDelete={handleWiDelete}
        onChangeStatus={handleWiChangeStatus}
        onPayment={handleWiPayment}
        activeWorkItemId={expandedId}
        detailsRefreshId={detailsRefreshId}
        onGoToPreviousPanel={() => setActivePanel("customers")}
        focusWorkItemId={focusWorkItemId}
      />
      <CustomerFormCard
        open={cardOpen}
        mode={cardMode}
        customer={selectedCustomer}
        onSave={handleCardSave}
        onClose={() => setCardOpen(false)}
      />
      <WorkItemFormCard
        open={wiCardOpen}
        mode={wiCardMode}
        customerId={selectedCustomer?.id ?? 0}
        workItem={editingWorkItem}
        initialTab={wiInitialTab}
        onSave={handleWiCardSave}
        onClose={() => setWiCardOpen(false)}
        onPaymentChange={() => { useWorkItemStore.getState().load(); loadUnpaid(); }}
      />
    </div>
  );
}
