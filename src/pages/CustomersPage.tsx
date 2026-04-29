import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { Virtuoso } from "react-virtuoso";
import type { VirtuosoHandle } from "react-virtuoso";
import { useLocation } from "react-router";
import { useSearch } from "@/hooks/useSearch";
import { useSortableData } from "@/hooks/useSortableData";
import { useListInteraction, type InteractionSource } from "@/hooks/useListInteraction";
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
import { LoadingOverlay } from "@/components/LoadingOverlay";
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
  onScrollComplete,
  searchKeyword,
  debouncedSearchKeyword,
  onSearchChange,
  filtered,
  isActive,
  lastSource,
  onMouseMove,
}: {
  selectedId: number | null;
  onSelect: (c: Customer) => void;
  onAdd: () => void;
  onEdit: () => void;
  onDelete: () => void;
  scrollToId: number | null;
  onScrollComplete?: () => void;
  searchKeyword: string;
  debouncedSearchKeyword: string;
  onSearchChange: (kw: string) => void;
  filtered: Customer[];
  isActive?: boolean;
  lastSource: InteractionSource;
  onMouseMove: () => void;
}) {
  const { unpaidMap, isLoading } = useCustomerStore();
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // scrollToId 변경 시 해당 항목으로 스크롤 (Fast Smooth Scroll 트릭)
  useEffect(() => {
    if (scrollToId == null) return;
    const index = filtered.findIndex((c) => c.id === scrollToId);
    if (index !== -1 && virtuosoRef.current) {
      // 컴포넌트 마운트 직후나 데이터 변경 직후에 바로 스크롤을 시도하면
      // Virtuoso가 아직 항목들의 크기를 측정하지 못해 스크롤이 무시되는 간헐적 문제가 발생할 수 있음
      // 이를 방지하기 위해 setTimeout으로 렌더링 틱을 지연시킵니다.
      const timer = setTimeout(() => {
        if (!virtuosoRef.current) return;
        // 50개 이상의 거리가 있으면 근처(20개 전)로 순간이동 후 부드럽게 이동
        if (index > 50) {
          virtuosoRef.current.scrollToIndex({ index: index - 20, align: "start" });
          requestAnimationFrame(() => {
            virtuosoRef.current?.scrollToIndex({ index, align: "center", behavior: "smooth" });
            onScrollComplete?.();
          });
        } else {
          // 가깝거나 위로 올라가는 경우(index < 50) 바로 부드럽게
          virtuosoRef.current.scrollToIndex({ index, align: "center", behavior: "smooth" });
          onScrollComplete?.();
        }
      }, 50); // 약간의 지연(50ms)을 주어 DOM 렌더링 완료 보장
      
      return () => clearTimeout(timer);
    }
  }, [scrollToId, filtered, onScrollComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="w-[380px] bg-surface-card rounded-lg shadow-sm flex flex-col overflow-hidden shrink-0 border border-border-default transition-colors">
      {/* 헤더 */}
      <div className="bg-secondary-800 dark:bg-secondary-900 text-white px-4 py-3 flex items-center shrink-0">
        <Users className="w-5 h-5 mr-2 text-secondary-300" />
        <h2 className="font-medium">
          고객 목록{" "}
          <span className="text-secondary-400 ml-1">
            {debouncedSearchKeyword ? `검색 ${filtered.length}명` : `${filtered.length}명`}
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
            onKeyDown={(e) => {
              if (filtered.length === 0) return;
              
              const currentIndex = filtered.findIndex(c => c.id === selectedId);
              
              if (e.key === "Enter") {
                onSelect(filtered[currentIndex === -1 ? 0 : currentIndex]);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                const nextIndex = Math.min(currentIndex + 1, filtered.length - 1);
                onSelect(filtered[nextIndex === -1 ? 0 : nextIndex]);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                const prevIndex = Math.max(currentIndex - 1, 0);
                onSelect(filtered[prevIndex === -1 ? 0 : prevIndex]);
              }
            }}
            className={`w-full pl-9 py-2 border border-border-default rounded-lg text-sm bg-surface-card text-on-surface placeholder:text-on-surface-muted focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 ${searchKeyword ? "pr-8" : "pr-3"}`}
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
          className="flex items-center px-3 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors cursor-pointer">
          <Plus className="w-4 h-4 mr-1" /> 추가
        </button>
        <button
          onClick={onEdit}
          disabled={selectedId === null}
          className="p-2 border border-border-default rounded-lg text-on-surface-muted hover:bg-surface-elevated transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          disabled={selectedId === null}
          className="p-2 border border-danger-200 dark:border-danger-800 rounded-lg text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-950 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* 리스트 */}
      <div className="flex-1 overflow-hidden" onMouseMove={onMouseMove}>
        <Virtuoso
          ref={virtuosoRef}
          data={filtered}
          itemContent={(_index: number, c: Customer) => {
            const isSelected = selectedId === c.id;
            return (
              <div
                onClick={() => onSelect(c)}
                className={`p-4 cursor-pointer transition-colors border-b border-border-default ${
                  isSelected
                    ? "bg-primary-50 dark:bg-primary-950 border-l-4 border-l-primary-500"
                    : "border-l-4 border-l-transparent"
                } ${
                  lastSource === "mouse" ? "hover:bg-surface-elevated" : ""
                } ${
                  lastSource === "keyboard" && isSelected && isActive ? "ring-2 ring-inset ring-primary-400" : ""
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
              </div>
            );
          }}
          components={{
            EmptyPlaceholder: () => {
              if (isLoading) {
                return <div className="p-8 text-center text-on-surface-muted text-sm">로딩 중...</div>;
              }
              if (debouncedSearchKeyword) {
                return (
                  <div className="p-8 text-center flex flex-col items-center justify-center h-full">
                    <p className="text-on-surface-muted text-sm mb-4">
                      <span className="font-bold text-on-surface">"{debouncedSearchKeyword}"</span> 검색 결과가 없습니다.
                    </p>
                    <button
                      onClick={onAdd}
                      className="flex items-center px-4 py-2 bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800 rounded-lg text-sm font-medium hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4 mr-1.5" />
                      신규 고객으로 추가하기
                    </button>
                  </div>
                );
              }
              return <div className="p-8 text-center text-on-surface-muted text-sm">등록된 고객이 없습니다.</div>;
            }
          }}
        />
      </div>
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
  lastSource,
  onMouseMove,
  onKeyDown,
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
  lastSource: InteractionSource;
  onMouseMove: () => void;
  onKeyDown: () => void;
}) {
  const { workItems } = useWorkItemStore();

  const { sortedItems, requestSort, sortConfig } = useSortableData(workItems);

  // 키보드 하이라이트 (sortedItems 기반으로 관리)
  const {
    highlightIdx: highlightedIdx,
    setHighlightIdx: setHighlightedIdx,
    setItemRef,
    itemRefs: rowRefs,
  } = useListInteraction({
    externalSource: lastSource,
    onSourceChange: (source) => {
      if (source === "mouse") onMouseMove();
      if (source === "keyboard") onKeyDown();
    },
    onScroll: (el) => {
      const container = el.closest(".overflow-auto");
      if (container) {
        const rect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        // 헤더 높이 (약 40px) + 여유 공간 고려
        const headerHeight = 44;
        
        const isAbove = rect.top < containerRect.top + headerHeight;
        const isBelow = rect.bottom > containerRect.bottom;

        if (isAbove) {
          container.scrollBy({ top: rect.top - containerRect.top - headerHeight, behavior: "smooth" });
        } else if (isBelow) {
          container.scrollBy({ top: rect.bottom - containerRect.bottom, behavior: "smooth" });
        }
      }
    },
  });

  // 고객 변경 시 하이라이트 초기화
  useEffect(() => {
    setHighlightedIdx(0);
  }, [customer?.id, setHighlightedIdx]);

  // 아코디언 상세: 열 때 lazy load, 로컬 캐시
  const [detailsCache, setDetailsCache] = useState<Record<number, WorkItemDetail[]>>({});

  // 수정 완료 시 해당 캐시 항목 무효화 -> 다음 열기 때 재로드
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
    if (!focusWorkItemId || workItems.length === 0) return;
    
    const applyFocus = async () => {
      setExpandedId(focusWorkItemId);
      if (!detailsCache[focusWorkItemId]) {
        try {
          const full = await workItemApi.get(focusWorkItemId);
          setDetailsCache((prev) => ({ ...prev, [focusWorkItemId]: full.details }));
        } catch (e) {
          console.error("Failed to lazy load details for focus item:", e);
        }
      }
      // 렌더링을 기다리기 위해 requestAnimationFrame 사용 (setTimeout 대용)
      requestAnimationFrame(() => {
        const idx = sortedItems.findIndex(i => i.id === focusWorkItemId);
        const el = rowRefs.current.get(idx);
        if (el) { el.scrollIntoView({ block: "center" }); }
      });
    };

    void applyFocus();
  }, [focusWorkItemId, workItems.length, setExpandedId, sortedItems]); // eslint-disable-line react-hooks/exhaustive-deps

  // isActive 패널에서만 키보드 네비게이션 처리
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (["ArrowUp", "ArrowDown", "ArrowRight", "ArrowLeft", "Enter"].includes(e.key)) {
        onKeyDown();
      }

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
  }, [isActive, sortedItems, highlightedIdx, expandedId, handleToggle, onGoToPreviousPanel, onEdit, onKeyDown]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!customer) {
    return (
      <div className="flex-1 bg-surface-card rounded-lg shadow-sm border border-border-default flex flex-col items-center justify-center text-on-surface-muted">
        <ClipboardList className="w-16 h-16 mb-4 opacity-20" />
        <h3 className="text-lg font-medium">고객을 선택해주세요</h3>
      </div>
    );
  }

  const totalAmount = workItems.reduce((sum, item) => sum + item.price, 0);
  const totalUnpaid = workItems.reduce((sum, item) => sum + (item.price - item.paidAmount), 0);

  return (
    <div className="flex-1 bg-surface-card rounded-lg shadow-sm flex flex-col overflow-hidden border border-border-default transition-colors">
      <div className="bg-secondary-800 dark:bg-secondary-900 text-white px-4 py-3 flex items-center shrink-0">
        <ClipboardList className="w-5 h-5 mr-2 text-secondary-300" />
        <h2 className="font-medium">
          작업 항목 - {customer.name}{" "}
          <span className="text-secondary-400 ml-1">({workItems.length}건)</span>
        </h2>
      </div>

      <div className="p-3 border-b border-border-default flex justify-between items-center shrink-0">
        <div className="flex space-x-6 px-2 text-sm">
          <span className="text-on-surface-muted">
            청구 합계:{" "}
            <strong className="text-on-surface text-base ml-1">{totalAmount.toLocaleString()}원</strong>
          </span>
          <span className="text-on-surface-muted">
            미수금:{" "}
            <strong className="text-danger-600 text-base ml-1">{totalUnpaid.toLocaleString()}원</strong>
          </span>
        </div>
        <div className="flex space-x-2">
          <button onClick={onAdd} className="flex items-center px-3 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors cursor-pointer">
            <Plus className="w-4 h-4 mr-1" /> 추가
          </button>
          <button onClick={() => activeWorkItemId && onEdit(activeWorkItemId)} disabled={!activeWorkItemId} className="p-2 border border-border-default rounded-lg text-on-surface-muted hover:bg-surface-elevated transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={() => activeWorkItemId && onDelete(activeWorkItemId)} disabled={!activeWorkItemId} className="p-2 border border-danger-200 dark:border-danger-800 rounded-lg text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-950 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-surface-elevated sticky top-0 border-b border-border-default text-on-surface-muted z-10">
            <tr>
              {(["status", "receivedAt", "pickedUpAt", "description", "price"] as const).map((col) => {
                const labels: Record<string, string> = { status: "상태", receivedAt: "접수", pickedUpAt: "수령", description: "작업내용", price: "금액" };
                const widths: Record<string, string> = { status: "px-2 py-3 text-center w-24", receivedAt: "px-2 py-3 w-12 whitespace-nowrap", pickedUpAt: "px-2 py-3 w-12 whitespace-nowrap", description: "px-3 py-3", price: "px-3 py-3 w-24" };
                const isSortActive = sortConfig.key === col;
                return (
                  <th key={col} onClick={() => requestSort(col)} className={`${widths[col]} font-medium cursor-pointer select-none hover:text-on-surface transition-colors group`}>
                    <span className="inline-flex items-center gap-1">
                      {labels[col]}
                      {isSortActive && sortConfig.direction === "asc" && <ChevronUp className="w-3.5 h-3.5 text-primary-500" />}
                      {isSortActive && sortConfig.direction === "desc" && <ChevronDown className="w-3.5 h-3.5 text-primary-500" />}
                      {!isSortActive && <ChevronsUpDown className="w-3.5 h-3.5 opacity-0 group-hover:opacity-40 transition-opacity" />}
                    </span>
                  </th>
                );
              })}
              <th className="px-3 py-3 font-medium w-28">메모</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default" onMouseMove={onMouseMove}>
            {sortedItems.map((item, itemIdx) => {
              const isUnpaid = item.price > item.paidAmount;
              const isExpanded = expandedId === item.id;
              const isHighlighted = highlightedIdx === itemIdx;
              const details = detailsCache[item.id];
              return (
                <Fragment key={item.id}>
                  <tr
                    ref={setItemRef(itemIdx)}
                    onClick={() => handleToggle(item.id)}
                    onMouseEnter={() => lastSource === "mouse" && setHighlightedIdx(itemIdx)}
                    className={`transition-colors cursor-pointer ${isExpanded ? "bg-primary-50/60 dark:bg-primary-950/40" : ""} ${lastSource === "mouse" ? "hover:bg-surface-elevated" : ""} ${lastSource === "keyboard" && isHighlighted && isActive ? "ring-2 ring-inset ring-primary-400" : ""}`}
                  >
                    <td className="px-3 py-3 text-center">
                      <StatusDropdown status={item.status} onChangeStatus={(s) => onChangeStatus(item.id, s)} />
                    </td>
                    <td className="px-2 py-3 text-on-surface-muted font-mono text-[0.8125rem] tracking-tighter" title={formatDateFull(item.receivedAt)}>
                      {formatDateShort(item.receivedAt)}
                    </td>
                    <td className="px-2 py-3 text-on-surface-muted font-mono text-[0.8125rem] tracking-tighter" title={formatDateFull(item.pickedUpAt)}>
                      {formatDateShort(item.pickedUpAt)}
                    </td>
                    <td className="px-3 py-3 font-bold text-on-surface">{item.description}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-base font-bold text-on-surface leading-none">{item.price.toLocaleString()}원</span>
                        {isUnpaid ? (
                          <button onClick={(e) => { e.stopPropagation(); onPayment(item.id); }} className="px-2 py-0.5 bg-danger-50 dark:bg-danger-950 border border-danger-200 dark:border-danger-800 text-danger-600 dark:text-danger-400 rounded text-xs font-bold whitespace-nowrap leading-none cursor-pointer hover:bg-danger-100 dark:hover:bg-danger-900 transition-colors">
                            미수금 {(item.price - item.paidAmount).toLocaleString()}원
                          </button>
                        ) : (
                          <span className="px-2 py-0.5 bg-primary-50 dark:bg-primary-950 border border-primary-200 dark:border-primary-800 text-primary-600 dark:text-primary-400 rounded text-xs font-bold whitespace-nowrap leading-none">완납</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-on-surface-muted text-[0.8125rem] max-w-[112px] truncate" title={item.note || ""}>{item.note || ""}</td>
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
                                      <p className="mt-0.5 text-[0.6875rem] text-on-surface-muted">&#8627; {d.optionsMemo}</p>
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
              <tr><td colSpan={7} className="p-12 text-center text-on-surface-muted">등록된 작업 항목이 없습니다.</td></tr>
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
  const { selectedCustomer, select, create, update, delete: deleteCustomer, loadUnpaid, isLoading } = useCustomerStore();
  const { setFilter } = useWorkItemStore();
  const { showConfirm } = useDialogStore();
  const location = useLocation();
  const [activePanel, setActivePanel] = useState<"customers" | "workItems">("customers");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [focusWorkItemId, setFocusWorkItemId] = useState<number | null>(null);
  const [lastSource, setLastSource] = useState<InteractionSource>("keyboard");

  // 고객 검색 (useSearch 통합)
  const { customers: storeCustomers, load: loadStoreCustomers } = useCustomerStore();
  const customerListFn = useCallback((kw: string) => loadStoreCustomers(kw).then(() => useCustomerStore.getState().customers), [loadStoreCustomers]);
  
  const {
    query: searchKeyword,
    setQuery,
    debouncedQuery: debouncedSearchKeyword,
    performSearch: loadCustomers,
  } = useSearch(customerListFn, {
    allowEmpty: true, // 초기 로딩 시 모든 고객을 가져오기 위함
    onSuccess: () => {
      loadUnpaid();
    }
  });

  const filteredCustomers = storeCustomers;

  // 검색어가 비워졌을 때(초기화) 선택된 고객이 있다면 그 위치로 스크롤 유도
  useEffect(() => {
    if (!debouncedSearchKeyword.trim()) {
      const currentSelected = useCustomerStore.getState().selectedCustomer;
      if (currentSelected) {
        setScrollToCustomerId(currentSelected.id);
      }
    }
  }, [debouncedSearchKeyword]);

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
    await loadCustomers(searchKeyword);
    const { customers: remaining } = useCustomerStore.getState();
    if (remaining.length > 0) select(remaining[0]);
    loadUnpaid();
  };

  const handleCardSave = async (data: CreateCustomer | UpdateCustomer) => {
    if (cardMode === "create") {
      const created = await create(data as CreateCustomer);
      select(created);
      setScrollToCustomerId(created.id);
      // 신규 등록 시 검색어 초기화
      setQuery("");
      await loadCustomers(""); 
    } else if (selectedCustomer) {
      await update(selectedCustomer.id, data as UpdateCustomer);
      await loadCustomers(searchKeyword);
    }
    loadUnpaid();
  };

  // 작업항목 Floating Card 상태
  const [wiCardOpen, setWiCardOpen] = useState(false);
  const [wiCardMode, setWiCardMode] = useState<"create" | "edit">("create");
  const [editingWorkItem, setEditingWorkItem] = useState<WorkItemFull | null>(null);

  const handleWiAdd = () => { if (!selectedCustomer) return; setWiCardMode("create"); setEditingWorkItem(null); setWiCardOpen(true); };
  const handleWiDelete = async (id: number) => {
    const item = useWorkItemStore.getState().workItems.find((w) => w.id === id);
    if (!item) return;
    const confirmed = await showConfirm({ title: "작업 삭제", message: `"${item.description}" 작업을 삭제하시겠습니까?`, confirmText: "삭제", isDestructive: true });
    if (!confirmed) return;
    await useWorkItemStore.getState().delete(id);
    loadUnpaid();
  };

  const handleWiChangeStatus = async (id: number, status: WorkItemStatus) => {
    await useWorkItemStore.getState().updateStatus(id, status);
    loadUnpaid();
  };

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
      if (status) await useWorkItemStore.getState().updateStatus(created.id, status);
      if (pickedUpAtOverride) await useWorkItemStore.getState().update(created.id, { pickedUpAt: pickedUpAtOverride });
    } else if (editingWorkItem) {
      if (status) await useWorkItemStore.getState().updateStatus(editingWorkItem.id, status);
      await useWorkItemStore.getState().update(editingWorkItem.id, data as UpdateWorkItem);
      if (details) await workItemApi.replaceDetails(editingWorkItem.id, details);
      setDetailsRefreshId({ id: editingWorkItem.id, nonce: Date.now() });
    }
    loadUnpaid();
  };

  // 폼에 전달할 고객 데이터 계산
  const getCustomerForCard = () => {
    if (cardMode === "edit") return selectedCustomer;
    if (searchKeyword.trim()) {
      const kw = searchKeyword.trim();
      const isPhone = /^[0-9- ]+$/.test(kw); // 숫자, 하이픈, 공백으로만 구성되었는지 확인
      return {
        id: 0,
        name: isPhone ? "" : kw,
        phoneNumber: isPhone ? kw : null,
        note: null,
        createdAt: "",
        lastModifiedAt: "",
      } as Customer;
    }
    return null;
  };

  // 초기 로드
  useEffect(() => {
    const state = location.state as { focusCustomerId?: number; focusWorkItemId?: number } | null;
    const focusId = state?.focusCustomerId;
    const focusItemId = state?.focusWorkItemId;
    loadCustomers("").then(async () => {
      const { customers: loaded, selectedCustomer: current } = useCustomerStore.getState();
      if (focusId) {
        const target = loaded.find((c) => c.id === focusId);
        if (target) {
          select(target);
          setScrollToCustomerId(target.id);
          if (focusItemId) {
            await useWorkItemStore.getState().setFilter({ customerId: target.id });
            setFocusWorkItemId(focusItemId);
          }
        }
      } else if (current) {
        setScrollToCustomerId(current.id);
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
    if (selectedCustomer) setFilter({ customerId: selectedCustomer.id });
    setExpandedId(null);
  }, [selectedCustomer?.id, setFilter]);

  // 키보드 네비게이션 (customers 패널)
  useEffect(() => {
    if (activePanel !== "customers") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (["ArrowUp", "ArrowDown", "ArrowRight"].includes(e.key)) setLastSource("keyboard");
      switch (e.key) {
        case "ArrowUp": {
          e.preventDefault();
          const { customers: loaded } = useCustomerStore.getState();
          const idx = loaded.findIndex((c) => c.id === selectedCustomer?.id);
          if (idx > 0) select(loaded[idx - 1]);
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          const { customers: loaded } = useCustomerStore.getState();
          const idx = loaded.findIndex((c) => c.id === selectedCustomer?.id);
          if (idx < loaded.length - 1) select(loaded[idx + 1]);
          break;
        }
        case "ArrowRight": e.preventDefault(); setActivePanel("workItems"); break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCustomer, activePanel, select]);

  return (
    <div className="h-full flex gap-4 relative">
      <LoadingOverlay isLoading={isLoading} />
      <CustomerListPanel
        selectedId={selectedCustomer?.id ?? null}
        onSelect={(c) => { select(c); setActivePanel("customers"); }}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDelete}
        scrollToId={scrollToCustomerId}
        onScrollComplete={() => setScrollToCustomerId(null)}
        searchKeyword={searchKeyword}
        debouncedSearchKeyword={debouncedSearchKeyword}
        onSearchChange={setQuery}
        filtered={filteredCustomers}
        isActive={activePanel === "customers"}
        lastSource={lastSource}
        onMouseMove={() => setLastSource("mouse")}
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
        lastSource={lastSource}
        onMouseMove={() => setLastSource("mouse")}
        onKeyDown={() => setLastSource("keyboard")}
      />
      <CustomerFormCard open={cardOpen} mode={cardMode} customer={getCustomerForCard()} onSave={handleCardSave} onClose={() => setCardOpen(false)} />
      <WorkItemFormCard open={wiCardOpen} mode={wiCardMode} customerId={selectedCustomer?.id ?? 0} workItem={editingWorkItem} initialTab={wiInitialTab} onSave={handleWiCardSave} onClose={() => setWiCardOpen(false)} onPaymentChange={() => { useWorkItemStore.getState().load(); loadUnpaid(); }} />
    </div>
  );
}
