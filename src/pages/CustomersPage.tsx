import { useState, useMemo, useEffect, useCallback, useRef, Fragment } from "react";
import {
  Search,
  Plus,
  Trash2,
  Pencil,
  Users,
  ClipboardList,
  ChevronDown,
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
  return `${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
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
}: {
  selectedId: number | null;
  onSelect: (c: Customer) => void;
  onAdd: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { customers, unpaidMap } = useCustomerStore();
  const [searchKeyword, setSearchKeyword] = useState("");

  // 클라이언트 사이드 필터 (즉시 반응)
  const filtered = useMemo(() => {
    if (!searchKeyword) return customers;
    const kw = searchKeyword.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(kw) ||
        (c.phoneNumber && c.phoneNumber.includes(kw)),
    );
  }, [searchKeyword, customers]);

  return (
    <div className="w-[380px] bg-surface-card rounded-lg shadow-sm border border-border-default flex flex-col overflow-hidden shrink-0">
      {/* 헤더 */}
      <div className="bg-secondary-800 dark:bg-secondary-900 text-white px-4 py-3 flex items-center shrink-0">
        <Users className="w-5 h-5 mr-2 text-secondary-300" />
        <h2 className="font-medium">
          고객 목록{" "}
          <span className="text-secondary-400 ml-1">({filtered.length}명)</span>
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
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-border-default rounded text-sm bg-surface-card text-on-surface placeholder:text-on-surface-muted focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
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
              onClick={() => onSelect(c)}
              className={`p-4 cursor-pointer transition-colors ${
                isSelected
                  ? "bg-primary-50 dark:bg-primary-950 border-l-4 border-l-primary-500"
                  : "hover:bg-surface-elevated border-l-4 border-l-transparent"
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span
                  className={`font-medium ${
                    isSelected ? "text-primary-700 dark:text-primary-300" : "text-on-surface"
                  }`}
                >
                  {c.name}
                </span>
                <span className="text-sm text-on-surface-muted">{c.phoneNumber || "-"}</span>
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
                    미수 {unpaidMap[c.id].toLocaleString()}원
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
  highlightedIdx,
  isActive,
  onAdd,
  onEdit,
  onDelete,
  onChangeStatus,
  onPayment,
  selectedWorkItemId,
}: {
  customer: Customer | null;
  expandedId: number | null;
  setExpandedId: (id: number | null) => void;
  highlightedIdx: number;
  isActive: boolean;
  onAdd: () => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onChangeStatus: (id: number, status: WorkItemStatus) => void;
  onPayment: (id: number) => void;
  selectedWorkItemId: number | null;
}) {
  const { workItems } = useWorkItemStore();
  // 아코디언 상세: 열 때 lazy load, 로컬 캐시
  const [detailsCache, setDetailsCache] = useState<Record<number, WorkItemDetail[]>>({});

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
    <div className="flex-1 bg-surface-card rounded-lg shadow-sm border border-border-default flex flex-col overflow-hidden">
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
            onClick={() => selectedWorkItemId && onEdit(selectedWorkItemId)}
            disabled={!selectedWorkItemId}
            className="p-2 border border-border-default rounded text-on-surface-muted hover:bg-surface-elevated transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => selectedWorkItemId && onDelete(selectedWorkItemId)}
            disabled={!selectedWorkItemId}
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
              <th className="px-3 py-3 font-medium text-center w-20">상태</th>
              <th className="px-2 py-3 font-medium w-14">접수</th>
              <th className="px-2 py-3 font-medium w-14">수령</th>
              <th className="px-3 py-3 font-medium">작업내용</th>
              <th className="px-3 py-3 font-medium w-24">결제</th>
              <th className="px-3 py-3 font-medium w-28">메모</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {workItems.map((item, itemIdx) => {
              const isUnpaid = item.price > item.paidAmount;
              const isExpanded = expandedId === item.id;
              const isHighlighted = isActive && highlightedIdx === itemIdx;
              const details = detailsCache[item.id];
              return (
                <Fragment key={item.id}>
                  <tr
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
                            미수 {(item.price - item.paidAmount).toLocaleString()}
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
                                  <td className="py-1.5 text-on-surface">{d.itemName}</td>
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
  const [activePanel, setActivePanel] = useState<"customers" | "workItems">("customers");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [highlightedIdx, setHighlightedIdx] = useState(0);

  // Floating Card 상태
  const [cardOpen, setCardOpen] = useState(false);
  const [cardMode, setCardMode] = useState<"create" | "edit">("create");

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
    }
    loadUnpaid();
  };

  // 초기 로드
  useEffect(() => {
    load().then(() => {
      // 로드 완료 후 미수금 조회 + 첫 고객 자동 선택
      const { customers: loaded } = useCustomerStore.getState();
      if (loaded.length > 0) select(loaded[0]);
      useCustomerStore.getState().loadUnpaid();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 고객 선택 시 작업 항목 로드 + 아코디언 초기화
  useEffect(() => {
    if (selectedCustomer) {
      setFilter({ customerId: selectedCustomer.id });
    }
    setExpandedId(null);
    setHighlightedIdx(0);
  }, [selectedCustomer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 키보드 네비게이션
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          if (activePanel === "customers") {
            const idx = customers.findIndex((c) => c.id === selectedCustomer?.id);
            if (idx > 0) select(customers[idx - 1]);
          } else {
            setHighlightedIdx((prev) => Math.max(0, prev - 1));
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          if (activePanel === "customers") {
            const idx = customers.findIndex((c) => c.id === selectedCustomer?.id);
            if (idx < customers.length - 1) select(customers[idx + 1]);
          } else {
            setHighlightedIdx((prev) => Math.min(workItems.length - 1, prev + 1));
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (activePanel === "customers") {
            setActivePanel("workItems");
          } else {
            const item = workItems[highlightedIdx];
            if (item) setExpandedId(item.id);
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (activePanel === "workItems") {
            if (expandedId !== null) {
              setExpandedId(null);
            } else {
              setActivePanel("customers");
            }
          }
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [customers, selectedCustomer, activePanel, highlightedIdx, expandedId, workItems, select]);

  return (
    <div className="h-full flex gap-4">
      <CustomerListPanel
        selectedId={selectedCustomer?.id ?? null}
        onSelect={(c) => { select(c); setActivePanel("customers"); }}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
      <WorkItemListPanel
        customer={selectedCustomer}
        expandedId={expandedId}
        setExpandedId={setExpandedId}
        highlightedIdx={highlightedIdx}
        isActive={activePanel === "workItems"}
        onAdd={handleWiAdd}
        onEdit={handleWiEdit}
        onDelete={handleWiDelete}
        onChangeStatus={handleWiChangeStatus}
        onPayment={handleWiPayment}
        selectedWorkItemId={expandedId}
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
