import { useState, useMemo, useEffect } from "react";
import {
  Search,
  Plus,
  Trash2,
  Pencil,
  Users,
  ClipboardList,
  ChevronDown,
} from "lucide-react";

// -- 목업 데이터 (디자인 확인용, 기능 연결 시 제거) --
const mockCustomers = [
  { id: 1, name: "홍길동", phone: "010-1234-5678", note: "단골 / 바지 기장 줄임 주의" },
  { id: 2, name: "김철수", phone: "010-9876-5432", note: "" },
  { id: 3, name: "이영희", phone: "010-5555-1234", note: "정장만 맡김" },
  { id: 4, name: "박지성", phone: "010-1111-2222", note: "미수금 주의 고객" },
  { id: 5, name: "최민수", phone: "010-3333-4444", note: "" },
  { id: 6, name: "정수아", phone: "-", note: "전화번호 미등록" },
];

const mockWorkItemsMap: Record<number, any[]> = {
  1: [
    { id: 101, status: "Received", receivedAt: "2025-01-01T14:30:00", pickedUpAt: null, desc: "와이셔츠 외 3건", price: 12000, paid: 12000, note: "" },
    { id: 102, status: "Completed", receivedAt: "2025-01-03T09:15:00", pickedUpAt: null, desc: "겨울 패딩 드라이", price: 25000, paid: 10000, note: "얼룩 주의" },
    { id: 103, status: "PickedUp", receivedAt: "2024-12-28T16:45:00", pickedUpAt: "2025-01-02T11:00:00", desc: "정장 상하의", price: 15000, paid: 15000, note: "" },
  ],
  4: [
    { id: 104, status: "Completed", receivedAt: "2025-01-05T10:20:00", pickedUpAt: null, desc: "고급 니트", price: 8000, paid: 0, note: "" },
  ],
};

// 목업: WorkItem별 상세 품목
const mockDetailsMap: Record<number, { name: string; qty: number; unitPrice: number }[]> = {
  101: [
    { name: "와이셔츠", qty: 2, unitPrice: 3000 },
    { name: "면바지", qty: 1, unitPrice: 4000 },
    { name: "넥타이", qty: 1, unitPrice: 2000 },
  ],
  102: [
    { name: "겨울 패딩 (드라이)", qty: 1, unitPrice: 25000 },
  ],
  103: [
    { name: "정장 상의", qty: 1, unitPrice: 8000 },
    { name: "정장 하의", qty: 1, unitPrice: 7000 },
  ],
  104: [
    { name: "고급 니트 (드라이)", qty: 1, unitPrice: 8000 },
  ],
};

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

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    Received: { label: "접수", cls: "bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300" },
    Completed: { label: "완료", cls: "bg-success-100 text-success-700 dark:bg-success-900/50 dark:text-success-300" },
    PickedUp: { label: "수령", cls: "bg-secondary-200 text-secondary-600 dark:bg-secondary-700 dark:text-secondary-300" },
  };
  const c = config[status];
  if (!c) return null;
  return <span className={`inline-block px-2.5 py-1 rounded text-xs font-bold whitespace-nowrap ${c.cls}`}>{c.label}</span>;
}

// ==========================================
// 좌측: 고객 목록 패널
// ==========================================
function CustomerListPanel({
  selectedId,
  onSelect,
}: {
  selectedId: number | null;
  onSelect: (c: any) => void;
}) {
  const [searchKeyword, setSearchKeyword] = useState("");

  const filtered = useMemo(() => {
    if (!searchKeyword) return mockCustomers;
    return mockCustomers.filter(
      (c) => c.name.includes(searchKeyword) || c.phone.includes(searchKeyword)
    );
  }, [searchKeyword]);

  // 고객별 미수금 계산
  const unpaidMap = useMemo(() => {
    const map: Record<number, number> = {};
    for (const [custId, items] of Object.entries(mockWorkItemsMap)) {
      const unpaid = items.reduce((sum: number, item: any) => sum + (item.price - item.paid), 0);
      if (unpaid > 0) map[Number(custId)] = unpaid;
    }
    return map;
  }, []);

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
        <button className="flex items-center px-3 py-2 bg-primary-600 text-white rounded text-sm font-medium hover:bg-primary-700 transition-colors cursor-pointer">
          <Plus className="w-4 h-4 mr-1" /> 추가
        </button>
        <button className="p-2 border border-border-default rounded text-on-surface-muted hover:bg-surface-elevated transition-colors cursor-pointer">
          <Pencil className="w-4 h-4" />
        </button>
        <button className="p-2 border border-danger-200 dark:border-danger-800 rounded text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-950 transition-colors cursor-pointer">
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
                <span className="text-sm text-on-surface-muted">{c.phone}</span>
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
            검색 결과가 없습니다.
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
}: {
  customer: any | null;
  expandedId: number | null;
  setExpandedId: (id: number | null) => void;
  highlightedIdx: number;
  isActive: boolean;
}) {

  if (!customer) {
    return (
      <div className="flex-1 bg-surface-card rounded-lg shadow-sm border border-border-default flex flex-col items-center justify-center text-on-surface-muted">
        <ClipboardList className="w-16 h-16 mb-4 opacity-20" />
        <h3 className="text-lg font-medium">고객을 선택해주세요</h3>
      </div>
    );
  }

  const workItems = mockWorkItemsMap[customer.id] || [];
  const totalAmount = workItems.reduce((sum: number, item: any) => sum + item.price, 0);
  const totalUnpaid = workItems.reduce(
    (sum: number, item: any) => sum + (item.price - item.paid),
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
          <button className="flex items-center px-3 py-2 bg-primary-600 text-white rounded text-sm font-medium hover:bg-primary-700 transition-colors cursor-pointer">
            <Plus className="w-4 h-4 mr-1" /> 추가
          </button>
          <button className="p-2 border border-border-default rounded text-on-surface-muted hover:bg-surface-elevated transition-colors cursor-pointer">
            <Pencil className="w-4 h-4" />
          </button>
          <button className="p-2 border border-danger-200 dark:border-danger-800 rounded text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-950 transition-colors cursor-pointer">
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
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {workItems.map((item: any, itemIdx: number) => {
              const isUnpaid = item.price > item.paid;
              const isExpanded = expandedId === item.id;
              const isHighlighted = isActive && highlightedIdx === itemIdx;
              const details = mockDetailsMap[item.id] || [];
              return (
                <>
                  <tr
                    key={item.id}
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className={`hover:bg-surface-elevated transition-colors cursor-pointer ${isHighlighted ? "ring-2 ring-inset ring-primary-400" : ""}`}
                  >
                    <td className="px-3 py-3 text-center">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-2 py-3 text-on-surface-muted font-mono text-[13px] tracking-tighter" title={formatDateFull(item.receivedAt)}>
                      {formatDateShort(item.receivedAt)}
                    </td>
                    <td className="px-2 py-3 text-on-surface-muted font-mono text-[13px] tracking-tighter" title={formatDateFull(item.pickedUpAt)}>
                      {formatDateShort(item.pickedUpAt)}
                    </td>
                    <td className="px-3 py-3 font-bold text-on-surface">
                      <div className="flex items-center gap-1.5">
                        <ChevronDown className={`w-4 h-4 text-on-surface-muted transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        {item.desc}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-base font-bold text-on-surface leading-none">
                          {item.price.toLocaleString()}원
                        </span>
                        {isUnpaid ? (
                          <span className="px-2 py-0.5 bg-danger-50 dark:bg-danger-950 border border-danger-200 dark:border-danger-800 text-danger-600 dark:text-danger-400 rounded text-xs font-bold whitespace-nowrap leading-none">
                            미수 {(item.price - item.paid).toLocaleString()}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-primary-50 dark:bg-primary-950 border border-primary-200 dark:border-primary-800 text-primary-600 dark:text-primary-400 rounded text-xs font-bold whitespace-nowrap leading-none">
                            완납
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-on-surface-muted text-[13px]">
                      {item.note || ""}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${item.id}-details`}>
                      <td colSpan={6} className="bg-surface-elevated/50 dark:bg-surface-elevated/30 px-6 py-3">
                        {details.length > 0 ? (
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
                              {details.map((d, i) => (
                                <tr key={i}>
                                  <td className="py-1.5 text-on-surface">{d.name}</td>
                                  <td className="py-1.5 text-center text-on-surface-muted">{d.qty}</td>
                                  <td className="py-1.5 text-right text-on-surface-muted">{d.unitPrice.toLocaleString()}원</td>
                                  <td className="py-1.5 text-right font-medium text-on-surface">{(d.qty * d.unitPrice).toLocaleString()}원</td>
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
                </>
              );
            })}
            {workItems.length === 0 && (
              <tr>
                <td colSpan={6} className="p-12 text-center text-on-surface-muted">
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
  const [selected, setSelected] = useState<any | null>(null);
  const [activePanel, setActivePanel] = useState<"customers" | "workItems">("customers");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [highlightedIdx, setHighlightedIdx] = useState(0);

  // 자동 선택 (첫 번째 고객)
  useEffect(() => {
    setSelected(mockCustomers[0]);
  }, []);

  // 고객 변경 시 아코디언/하이라이트 초기화
  useEffect(() => {
    setExpandedId(null);
    setHighlightedIdx(0);
  }, [selected?.id]);

  // 키보드 네비게이션
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const workItems = selected ? (mockWorkItemsMap[selected.id] || []) : [];

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          if (activePanel === "customers") {
            const idx = mockCustomers.findIndex((c) => c.id === selected?.id);
            if (idx > 0) setSelected(mockCustomers[idx - 1]);
          } else {
            setHighlightedIdx((prev) => Math.max(0, prev - 1));
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          if (activePanel === "customers") {
            const idx = mockCustomers.findIndex((c) => c.id === selected?.id);
            if (idx < mockCustomers.length - 1) setSelected(mockCustomers[idx + 1]);
          } else {
            setHighlightedIdx((prev) => Math.min(workItems.length - 1, prev + 1));
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (activePanel === "customers") {
            setActivePanel("workItems");
          } else {
            // 아코디언 펼치기
            const item = workItems[highlightedIdx];
            if (item) setExpandedId(item.id);
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (activePanel === "workItems") {
            // 아코디언이 펼쳐져 있으면 접기, 아니면 고객 패널로
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
  }, [selected, activePanel, highlightedIdx, expandedId]);

  return (
    <div className="h-full flex gap-4">
      <CustomerListPanel selectedId={selected?.id ?? null} onSelect={(c) => { setSelected(c); setActivePanel("customers"); }} />
      <WorkItemListPanel customer={selected} expandedId={expandedId} setExpandedId={setExpandedId} highlightedIdx={highlightedIdx} isActive={activePanel === "workItems"} />
    </div>
  );
}
