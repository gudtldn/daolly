import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useSearch } from "@/hooks/useSearch";
import { useListInteraction } from "@/hooks/useListInteraction";
import { CurrencyInput } from "@/components/CurrencyInput";
import {
  User, Plus, Search, History, X,
  Minus, Trash2, Pen, Keyboard, Shirt,
  CheckCircle2, CreditCard, Banknote, Landmark, Clock, UserPlus,
  Settings,
} from "lucide-react";
import type { Customer, Category, PriceItem, PriceOption, CreateCustomer } from "@/types";
import {
  customerApi, categoryApi, priceItemApi, priceOptionApi, workItemApi,
} from "@/bindings";
import { useCartStore, type CartItem, type PaymentMethod } from "@/stores/cartStore";
import { useDialogStore } from "@/stores/dialogStore";
import { CustomerFormCard } from "@/pages/customers/CustomerFormCard";

// ============================================================
// CustomerPanel (왼쪽 300px)
// ============================================================

function CustomerPanel({
  selectedCustomer,
  onSelect,
  onDeselect,
  onViewHistory,
  onAddNew,
}: {
  selectedCustomer: Customer | null;
  onSelect: (c: Customer) => void;
  onDeselect: () => void;
  onViewHistory: (customerId: number) => void;
  onAddNew: (name: string) => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [unpaid, setUnpaid] = useState(0);

  const {
    source: lastSource,
    setSource: setLastSource,
    highlightIdx,
    setHighlightIdx,
    setItemRef,
  } = useListInteraction();

  const {
    query,
    setQuery,
    results,
    setResults,
  } = useSearch(customerApi.list, {
    onSuccess: () => {
      setHighlightIdx(0);
      setShowDropdown(true);
    },
    onClear: () => setShowDropdown(false),
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (c: Customer) => {
    onSelect(c);
    setQuery("");
    setResults([]);
    setShowDropdown(false);
  };

  const handleAddNew = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    onAddNew(trimmed);
    setQuery("");
    setResults([]);
    setShowDropdown(false);
  };

  useEffect(() => {
    if (!selectedCustomer) { setUnpaid(0); return; }
    workItemApi.getAllUnpaidAmounts().then((m) => {
      setUnpaid(m[selectedCustomer.id] ?? 0);
    }).catch(() => {});
  }, [selectedCustomer]);

  const isExactMatch = results.some((c) => c.name === query.trim());
  const showAddOption = query.trim() && !isExactMatch;

  return (
    <div className="w-[300px] shrink-0 bg-surface-card border border-border-default rounded-lg flex flex-col shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-secondary-800 dark:bg-secondary-900 text-white flex items-center shrink-0">
        <User className="w-5 h-5 mr-2 text-secondary-300" />
        <h3 className="font-medium">고객 정보</h3>
      </div>

      <div className="p-4 border-b border-border-default shrink-0 relative" ref={containerRef}>
        {selectedCustomer ? (
          // Customer selected: show a minimal change-customer link. Full info is in the card below.
          <button
            onClick={onDeselect}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-on-surface-muted hover:text-primary-600 hover:bg-surface-elevated rounded-lg transition-colors cursor-pointer border border-dashed border-border-default"
          >
            <Search className="w-3.5 h-3.5" />
            다른 고객 검색
          </button>
        ) : (
          // Search mode: input with inline clear button and search button.
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={query}
                onFocus={() => query.trim() && setShowDropdown(true)}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (["ArrowUp", "ArrowDown", "Enter"].includes(e.key)) {
                    setLastSource("keyboard");
                  }
                  if (e.key === "Enter") {
                    if (results.length > 0 && highlightIdx < results.length) {
                      handleSelect(results[highlightIdx]);
                    } else if (showAddOption) {
                      handleAddNew();
                    }
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    const maxIdx = showAddOption ? results.length : Math.max(0, results.length - 1);
                    setHighlightIdx((i) => Math.min(i + 1, maxIdx));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setHighlightIdx((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Escape") {
                    setShowDropdown(false);
                  }
                }}
                placeholder="이름, 전화번호 뒷자리..."
                className={`w-full border border-border-default bg-surface-card rounded-lg px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-muted focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 ${query ? "pr-8" : ""}`}
              />
              {query && (
                <button
                  onClick={() => { setQuery(""); setResults([]); setShowDropdown(false); }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-on-surface-muted hover:text-on-surface transition-colors cursor-pointer"
                  aria-label="검색어 지우기"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {showAddOption && results.length === 0 ? (
              <button
                onClick={handleAddNew}
                title="새 고객으로 추가"
                className="bg-primary-600 text-white px-3 py-2 rounded-lg hover:bg-primary-700 transition-colors shrink-0 flex items-center justify-center cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => results.length > 0 && handleSelect(results[0])}
                disabled={!query.trim()}
                className="bg-primary-600 text-white px-3 py-2 rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 cursor-pointer"
              >
                <Search className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
        {showDropdown && (
          <div 
            ref={dropdownRef}
            className="absolute left-4 right-4 top-full mt-1 bg-surface-card border border-border-default rounded-lg shadow-lg z-20 max-h-48 overflow-x-hidden overflow-y-auto"
          >
            {results.map((c, idx) => (
              <button
                key={c.id}
                ref={setItemRef(idx)}
                onClick={() => handleSelect(c)}
                onMouseMove={() => {
                  if (lastSource !== "mouse" || highlightIdx !== idx) {
                    setLastSource("mouse");
                    setHighlightIdx(idx);
                  }
                }}
                className={`w-full text-left px-3 py-2.5 text-sm border-b border-border-default last:border-0 transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                  idx === highlightIdx ? "bg-primary-50 dark:bg-primary-900/30" : ""
                }`}
              >
                <div className="flex items-center min-w-0 flex-1">
                  <span className="font-bold text-on-surface truncate">{c.name}</span>
                  {c.phoneNumber && (
                    <span className="text-on-surface-muted ml-2 text-sm shrink-0">{c.phoneNumber}</span>
                  )}
                </div>
                {idx === highlightIdx && (
                  <span className="text-[0.6rem] text-on-surface-muted bg-surface-elevated px-1.5 py-0.5 rounded border border-border-default shrink-0 animate-in fade-in duration-200">Enter</span>
                )}
              </button>
            ))}
            
            {results.length === 0 && showAddOption && (
              <div className="px-3 pt-3 pb-1 text-sm text-on-surface-muted text-center">
                검색 결과가 없습니다.
              </div>
            )}
            {showAddOption && (
              <>
                {results.length > 0 && <div className="border-t border-border-default/50 my-1" />}
                <button
                  ref={setItemRef(results.length)}
                  onClick={handleAddNew}
                  onMouseMove={() => {
                    if (lastSource !== "mouse" || highlightIdx !== results.length) {
                      setLastSource("mouse");
                      setHighlightIdx(results.length);
                    }
                  }}
                  className={`w-full text-left px-4 py-3.5 text-sm transition-colors cursor-pointer ${
                    highlightIdx === results.length ? "bg-primary-50 dark:bg-primary-900/30" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 text-primary-600 font-bold min-w-0">
                      <UserPlus className="w-4 h-4 shrink-0" />
                      <span className="truncate">"{query.trim()}"님 신규 등록</span>
                    </div>
                    {highlightIdx === results.length && (
                      <span className="text-[0.65rem] text-on-surface-muted bg-surface-elevated px-1.5 py-0.5 rounded border border-border-default shrink-0 animate-in fade-in duration-200">Enter</span>
                    )}
                  </div>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        {selectedCustomer ? (
          <div className="space-y-3">
            <div className="bg-surface border border-border-default rounded-lg p-4 space-y-2.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/40 rounded-full flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-primary-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-on-surface text-base leading-tight">{selectedCustomer.name}</p>
                  <p className="text-sm text-on-surface-muted">{selectedCustomer.phoneNumber}</p>
                </div>
              </div>
              {unpaid > 0 && (
                <div className="flex items-center justify-between bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-700 rounded-lg px-3 py-2">
                  <span className="text-sm font-medium text-warning-700 dark:text-warning-300">미수금</span>
                  <span className="text-sm font-bold text-warning-700 dark:text-warning-300">
                    {unpaid.toLocaleString()}원
                  </span>
                </div>
              )}
              {selectedCustomer.note && (
                <div className="bg-surface-elevated border border-border-default rounded-lg px-3 py-2">
                  <p className="text-sm text-on-surface-muted leading-relaxed">{selectedCustomer.note}</p>
                </div>
              )}
            </div>
            <button
              onClick={() => onViewHistory(selectedCustomer.id)}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-on-surface-muted border border-border-default rounded-lg hover:bg-surface-elevated hover:text-on-surface transition-colors">
              <History className="w-3.5 h-3.5" />
              지난 접수 확인
            </button>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center text-on-surface-muted gap-3">
            <User className="w-12 h-12 opacity-20" />
            <p className="text-sm">위 검색창에서 고객을 선택해주세요.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// DirectInputForm
// ============================================================

function DirectInputForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string, price: number) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState(0);

  const handleSubmit = () => {
    if (!name.trim() || price <= 0) return;
    onSubmit(name.trim(), price);
    setName("");
    setPrice(0);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
    if (e.key === "Escape") onCancel();
  };

  return (
    <div className="flex items-center gap-2 p-3 bg-surface-elevated border border-border-default rounded-lg">
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKey}
        placeholder="품목명"
        className="flex-1 px-3 py-2 border border-border-default bg-surface-card rounded-lg text-sm text-on-surface focus:border-primary-500 outline-none"
      />
      <CurrencyInput
        value={price}
        onChange={setPrice}
        onKeyDown={handleKey}
        placeholder="가격"
        className="w-28 px-3 py-2 border border-border-default bg-surface-card rounded-lg text-sm text-on-surface focus:border-primary-500 outline-none text-right"
      />
      <button
        onClick={handleSubmit}
        disabled={!name.trim() || price <= 0}
        className="px-3 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:bg-secondary-300 disabled:cursor-not-allowed transition-colors"
      >
        <Plus className="w-4 h-4" />
      </button>
      <button
        onClick={onCancel}
        className="px-3 py-2 text-on-surface-muted hover:text-on-surface border border-border-default rounded-lg text-sm transition-colors"
      >
        취소
      </button>
    </div>
  );
}

// ============================================================
// OrderPanel (가운데 flex-1)
// ============================================================

function OrderPanel({
  items,
  onAddItem,
  onRemoveItem,
  onUpdateQty,
  onUpdateItem,
}: {
  items: CartItem[];
  onAddItem: (item: Omit<CartItem, "uid" | "quantity"> & { optionsMemo?: string }) => void;
  onRemoveItem: (i: number) => void;
  onUpdateQty: (i: number, qty: number) => void;
  onUpdateItem: (i: number, updates: Partial<CartItem>) => void;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [priceItems, setPriceItems] = useState<PriceItem[]>([]);
  const [priceOptions, setPriceOptions] = useState<PriceOption[]>([]);
  const [activeCatId, setActiveCatId] = useState<number | null>(null);
  const [showDirectInput, setShowDirectInput] = useState(false);
  const [selectedOptionIds, setSelectedOptionIds] = useState<Set<number>>(new Set());

  // Reset selected options when switching category to prevent accidental carry-over.
  useEffect(() => {
    setSelectedOptionIds(new Set());
  }, [activeCatId]);
  const [editingPriceIdx, setEditingPriceIdx] = useState<number | null>(null);
  const [editingMemoIdx, setEditingMemoIdx] = useState<number | null>(null);
  const { showCustom } = useDialogStore();
  const memoRef = useRef<string>("");
  const priceRef = useRef<number>(0);
  const catTabsRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // native non-passive wheel -> horizontal scroll (React onWheel is passive in newer browsers)
  useEffect(() => {
    const el = catTabsRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // 스크롤 가능 여부 감지 -> 오른쪽 페이드 인디케이터
  useEffect(() => {
    const el = catTabsRef.current;
    if (!el) return;
    const update = () => setCanScrollRight(el.scrollWidth > el.clientWidth + el.scrollLeft + 1);
    update();
    el.addEventListener("scroll", update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, [categories]);

  useEffect(() => {
    Promise.all([categoryApi.list(), priceItemApi.list(), priceOptionApi.list()]).then(
      ([cats, pItems, opts]) => {
        setCategories(cats);
        setPriceItems(pItems);
        setPriceOptions(opts);
        if (cats.length > 0) setActiveCatId(cats[0].id);
      },
    );
  }, []);

  const navigate = useNavigate();
  const catItems = priceItems.filter((p) => p.categoryId === activeCatId);

  const handleItemClick = (id: number, name: string, basePrice: number) => {
    const selectedOpts = priceOptions.filter((o) => selectedOptionIds.has(o.id));
    const optionsMemo =
      selectedOpts.length > 0
        ? selectedOpts.map((o) => `${o.name}(+${o.price.toLocaleString()})`).join(", ")
        : "";
    const totalPrice = basePrice + selectedOpts.reduce((s, o) => s + o.price, 0);
    onAddItem({ priceItemId: id, name, unitPrice: totalPrice, optionsMemo });
    setSelectedOptionIds(new Set());
  };

  const openFullEdit = (i: number) => {
    priceRef.current = items[i].unitPrice;
    memoRef.current = items[i].optionsMemo ?? "";
    const inputEl = (
      <div className="py-2 flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-on-surface-muted mb-1.5">단가 수정</label>
          <CurrencyInput
            autoFocus
            value={priceRef.current}
            onChange={(v) => { priceRef.current = v; }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.form?.requestSubmit?.(); }}
            className="w-full border border-border-default rounded-lg px-3 py-2 text-lg font-bold text-primary-600 bg-surface focus:border-primary-500 outline-none text-left"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-on-surface-muted mb-1.5">메모 수정</label>
          <input
            type="text"
            defaultValue={memoRef.current}
            onChange={(e) => { memoRef.current = e.target.value; }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.form?.requestSubmit?.(); }}
            placeholder="메모를 입력하세요"
            className="w-full border border-border-default rounded-lg px-3 py-2 text-sm text-on-surface bg-surface focus:border-primary-500 outline-none"
          />
        </div>
      </div>
    );
    showCustom({
      title: `${items[i].name} - 수정`,
      customContent: inputEl,
      confirmText: "적용",
    }).then((confirmed) => {
      if (confirmed) {
        onUpdateItem(i, { unitPrice: priceRef.current, optionsMemo: memoRef.current });
      }
    });
  };

  return (
    <div className="flex-1 min-w-0 bg-surface-card border border-border-default rounded-lg flex flex-col shadow-sm overflow-hidden">
      {/* 카테고리 탭 */}
      <div className="relative shrink-0 flex border-b border-border-default bg-surface">
        <div
          ref={catTabsRef}
          className="flex-1 flex overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCatId(cat.id)}
              className={`min-w-[4rem] flex-1 py-3.5 font-bold text-sm transition-colors whitespace-nowrap px-4 ${
                activeCatId === cat.id
                  ? "text-primary-600 border-b-2 border-primary-600 bg-surface-card"
                  : "text-on-surface-muted hover:text-on-surface hover:bg-surface-elevated"
              }`}
            >
              {cat.name}
            </button>
          ))}
          {categories.length === 0 && (
            <div className="flex-1 px-4 py-3.5 text-sm text-on-surface-muted text-center">
              단가표에서 카테고리를 먼저 설정해주세요.
            </div>
          )}
        </div>
        {canScrollRight && (
          <div className="absolute right-12 top-0 bottom-0 w-10 bg-gradient-to-l from-surface to-transparent pointer-events-none" />
        )}
        <button
          onClick={() => navigate("/settings?tab=pricing")}
          className="w-12 flex items-center justify-center text-on-surface-muted hover:text-primary-600 hover:bg-surface-elevated transition-colors border-l border-border-default shrink-0 bg-surface z-10"
          title="단가표 설정 바로가기"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* 단가 버튼 그리드 영역 */}
      <div className="p-4 shrink-0 bg-surface border-b border-border-default overflow-y-auto max-h-56 min-h-[140px] flex items-center justify-center">
        {catItems.length > 0 ? (
          <div className="w-full grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3">
            {catItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id, item.name, item.defaultPrice)}
                className="bg-surface-card border border-border-default rounded-lg p-3 text-center shadow-sm hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all active:scale-95"
              >
                <p className="font-bold text-on-surface text-sm">{item.name}</p>
                <p className="text-sm font-medium text-primary-600 mt-1">
                  {item.defaultPrice.toLocaleString()}
                </p>
              </button>
            ))}
            <button
              onClick={() => setShowDirectInput(true)}
              className={`border-2 border-dashed rounded-lg p-3 flex flex-col items-center justify-center transition-all text-sm font-bold active:scale-95 ${
                showDirectInput
                  ? "border-primary-500 bg-primary-50 text-primary-600 dark:bg-primary-900/20"
                  : "border-border-default bg-surface text-on-surface-muted hover:border-primary-400 hover:text-primary-500"
              }`}
            >
              <Keyboard className="w-5 h-5 mb-1" />
              직접 입력
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 animate-in fade-in zoom-in-95 duration-300">
            <p className="text-sm text-on-surface-muted">
              {categories.length === 0 
                ? "단가표에 등록된 카테고리가 없습니다." 
                : "이 분류에 등록된 품목이 없습니다."}
            </p>
            <button
              onClick={() => setShowDirectInput(true)}
              className={`flex items-center gap-2 px-8 py-3.5 rounded-xl border-2 border-dashed transition-all text-sm font-bold active:scale-95 ${
                showDirectInput
                  ? "border-primary-500 bg-primary-50 text-primary-600 dark:bg-primary-900/20 shadow-inner"
                  : "border-border-default bg-surface-card text-on-surface-muted hover:border-primary-400 hover:text-primary-600 hover:bg-surface-elevated shadow-sm"
              }`}
            >
              <Keyboard className="w-5 h-5" />
              {showDirectInput ? "직접 입력 창 활성화됨" : "품목 직접 입력하기"}
            </button>
          </div>
        )}
      </div>

      {/* 추가 옵션 체크박스 */}
      {priceOptions.length > 0 && (
        <div className="px-4 py-2 border-b border-border-default shrink-0 bg-surface flex flex-wrap gap-2">
          {priceOptions.map((opt) => {
            const checked = selectedOptionIds.has(opt.id);
            return (
              <label
                key={opt.id}
                className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg cursor-pointer border transition-colors select-none ${
                  checked
                    ? "bg-primary-50 dark:bg-primary-900/20 border-primary-400 text-primary-700 dark:text-primary-300 font-semibold"
                    : "bg-surface-elevated border-border-default text-on-surface-muted hover:border-secondary-300"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setSelectedOptionIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(opt.id)) next.delete(opt.id);
                      else next.add(opt.id);
                      return next;
                    })
                  }
                  className="w-3.5 h-3.5 accent-primary-600"
                />
                {opt.name}
                <span className="text-sm text-primary-500">+{opt.price.toLocaleString()}</span>
              </label>
            );
          })}
        </div>
      )}

      {/* 직접 입력 폼 */}
      {showDirectInput && (
        <div className="px-4 py-3 border-b border-border-default shrink-0 bg-surface">
          <DirectInputForm
            onSubmit={(name, price) => {
              onAddItem({ priceItemId: null, name, unitPrice: price, optionsMemo: "" });
              setShowDirectInput(false);
            }}
            onCancel={() => setShowDirectInput(false)}
          />
        </div>
      )}

      {/* 장바구니 테이블 */}
      <div className="flex-1 overflow-auto bg-surface-card">
        <table className="w-full text-sm text-left">
          <thead className="bg-surface sticky top-0 border-b border-border-default text-on-surface-muted z-10">
            <tr>
              <th className="px-4 py-3 font-medium">품목명 / 메모</th>
              <th className="px-4 py-3 font-medium text-center w-28">수량</th>
              <th className="px-4 py-3 font-medium text-right w-32">단가</th>
              <th className="px-4 py-3 font-medium text-right w-32">금액</th>
              <th className="px-4 py-3 font-medium text-center w-20">수정</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {items.map((item, index) => (
              <tr key={item.uid} className="hover:bg-surface transition-colors">
                <td className="px-4 py-3">
                  <div className="font-bold text-on-surface">{item.name}</div>
                  {editingMemoIdx === index ? (
                    <input
                      autoFocus
                      type="text"
                      value={item.optionsMemo}
                      onChange={(e) => onUpdateItem(index, { optionsMemo: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Escape") setEditingMemoIdx(null);
                      }}
                      onBlur={() => setEditingMemoIdx(null)}
                      className="w-full border-2 border-primary-500 rounded-md px-2 py-1 text-sm text-on-surface outline-none bg-surface shadow-sm"
                      placeholder="메모 입력..."
                    />
                  ) : (
                    <div
                      onClick={() => setEditingMemoIdx(index)}
                      className="text-sm text-on-surface-muted mt-0.5 cursor-pointer hover:text-primary-500 transition-colors inline-block"
                      title="메모 수정"
                    >
                      {item.optionsMemo ? `↳ ${item.optionsMemo}` : <span className="opacity-50">↳ 메모 추가...</span>}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-1.5 bg-surface border border-border-default rounded-lg p-1">
                    <button
                      onClick={() => onUpdateQty(index, Math.max(1, item.quantity - 1))}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-muted hover:bg-surface-elevated transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-bold text-on-surface w-4 text-center">{item.quantity}</span>
                    <button
                      onClick={() => onUpdateQty(index, item.quantity + 1)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-muted hover:bg-surface-elevated transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  {editingPriceIdx === index ? (
                    <CurrencyInput
                      autoFocus
                      value={item.unitPrice}
                      onChange={(v) => onUpdateItem(index, { unitPrice: v })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Escape") setEditingPriceIdx(null);
                      }}
                      onBlur={() => setEditingPriceIdx(null)}
                      className="w-full border-2 border-primary-500 rounded-md px-2 py-1 text-base font-bold text-primary-600 outline-none bg-surface text-right shadow-sm"
                    />
                  ) : (
                    <button
                      onClick={() => setEditingPriceIdx(index)}
                      className="text-primary-600 font-semibold hover:text-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/30 px-2 py-1 rounded-lg transition-colors"
                      title="단가 수정"
                    >
                      {item.unitPrice.toLocaleString()}
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-bold text-on-surface">
                  {(item.unitPrice * item.quantity).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => openFullEdit(index)}
                      className="p-1.5 text-on-surface-muted hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-colors"
                      title="상세 수정"
                    >
                      <Pen className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onRemoveItem(index)}
                      className="p-1.5 text-on-surface-muted hover:text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/30 rounded-lg transition-colors"
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="p-12 text-center text-on-surface-muted">
                  <Shirt className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  위 버튼을 클릭하여 품목을 추가해주세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// PaymentPanel (오른쪽 320px)
// ============================================================

const PAYMENT_OPTIONS: { key: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { key: "card", label: "신용카드", icon: <CreditCard className="w-5 h-5 mb-1" /> },
  { key: "cash", label: "현금", icon: <Banknote className="w-5 h-5 mb-1" /> },
  { key: "transfer", label: "계좌이체", icon: <Landmark className="w-5 h-5 mb-1" /> },
  { key: "credit", label: "외상 (후불)", icon: <Clock className="w-5 h-5 mb-1" /> },
];

function PaymentPanel({
  items,
  selectedCustomer,
  onSubmit,
  submitting,
}: {
  items: CartItem[];
  selectedCustomer: Customer | null;
  onSubmit: (method: PaymentMethod, note: string) => void;
  submitting: boolean;
}) {
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [note, setNote] = useState("");

  const total = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const isEmpty = items.length === 0;
  const noCustomer = !selectedCustomer;
  const noMethod = method === null;

  return (
    <div className="w-[320px] shrink-0 bg-surface-card border border-border-default rounded-lg flex flex-col shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-secondary-800 dark:bg-secondary-900 text-white shrink-0">
        <h3 className="font-medium text-white">결제 정보</h3>
      </div>

      <div className="flex-1 flex flex-col gap-4 p-5 overflow-y-auto">
        {/* 금액 요약 */}
        <div className="bg-surface border border-border-default rounded-lg p-4 space-y-3 shadow-inner">
          <div className="flex justify-between items-center text-sm">
            <span className="text-on-surface-muted">총 수량</span>
            <span className="font-bold text-on-surface">{totalQty} 개</span>
          </div>
          <div className="pt-3 border-t border-border-default flex justify-between items-end">
            <span className="font-bold text-on-surface text-sm">최종 결제 금액</span>
            <span className="text-3xl font-bold text-primary-600 tracking-tighter leading-none">
              {total.toLocaleString()}
              <span className="text-base font-medium text-on-surface-muted ml-1">원</span>
            </span>
          </div>
        </div>

        {/* 결제 수단 */}
        <div>
          <p className="text-sm font-medium text-on-surface-muted mb-2">결제 수단 <span className="text-danger-500">*</span></p>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setMethod(opt.key)}
                className={`flex flex-col items-center justify-center p-3 rounded-lg font-bold transition-all border-2 text-sm ${
                  method === opt.key
                    ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400"
                    : "border-border-default bg-surface-card text-on-surface hover:bg-surface-elevated"
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 접수 메모 */}
        <div>
          <label className="block text-sm font-medium text-on-surface-muted mb-1.5">
            접수 메모 (선택)
          </label>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 드라이클리닝 주의, 급행 요청 등"
            className="w-full px-3 py-2 bg-surface border border-border-default rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 text-on-surface resize-none text-sm"
          />
        </div>
      </div>

      <div className="p-4 border-t border-border-default bg-surface-elevated shrink-0">
        {(noCustomer || noMethod) && (
          <p className="text-sm text-warning-600 text-center mb-3">
            {noCustomer ? "고객을 먼저 선택해주세요." : "결제 수단을 선택해주세요."}
          </p>
        )}
        <button
          onClick={() => method && onSubmit(method, note)}
          disabled={isEmpty || noCustomer || noMethod || submitting}
          className="w-full bg-primary-600 disabled:bg-secondary-300 disabled:cursor-not-allowed hover:bg-primary-700 text-white py-4 rounded-lg text-lg font-bold shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="w-5 h-5" />
          {submitting ? "처리 중..." : "접수 완료"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// PosPage (최상위)
// ============================================================

export function PosPage() {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitCount, setSubmitCount] = useState(0);
  
  // 고객 추가 모달 상태
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");

  const { items, addItem, removeItem, updateQuantity, updateItem, setCustomer, submit } =
    useCartStore();
  const navigate = useNavigate();

  // 다른 페이지에서 돌아왔을 때 cartStore.customerId로 고객 복원
  useEffect(() => {
    const storedId = useCartStore.getState().customerId;
    if (storedId && !selectedCustomer) {
      customerApi.get(storedId).then((found) => {
        setSelectedCustomer(found);
      }).catch((e) => {
        console.warn("Failed to restore customer from cart store:", e);
        useCartStore.getState().setCustomer(null); // stale id cleanup
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectCustomer = (c: Customer) => {
    setSelectedCustomer(c);
    setCustomer(c.id);
  };

  const handleDeselectCustomer = () => {
    setSelectedCustomer(null);
    setCustomer(null);
  };

  const handleViewHistory = (customerId: number) => {
    navigate("/customers", { state: { focusCustomerId: customerId } });
  };

  const handleAddNewCustomer = (name: string) => {
    setNewCustomerName(name);
    setIsCustomerModalOpen(true);
  };

  const handleCustomerSave = async (data: CreateCustomer) => {
    try {
      const created = await customerApi.create(data);
      handleSelectCustomer(created);
      toast.success(`${created.name} 고객님이 등록되었습니다.`);
    } catch (e) {
      toast.error(`고객 등록 실패: ${String(e)}`);
      throw e; // CustomerFormCard에서 에러 처리를 할 수 있도록 던짐
    }
  };

  const handleSubmit = async (method: PaymentMethod, note: string) => {
    const customerName = selectedCustomer?.name ?? "";
    setSubmitting(true);
    try {
      const workItem = await submit(method, note || undefined);
      const prevId = selectedCustomer?.id;
      setSelectedCustomer(null);
      setSubmitCount((n) => n + 1);
      toast.success(`${customerName}님 접수 완료`, {
        action: prevId
          ? { label: "접수 확인", onClick: () => navigate("/customers", { state: { focusCustomerId: prevId, focusWorkItemId: workItem.id } }) }
          : undefined,
      });
    } catch (e) {
      toast.error(`접수 실패: ${String(e)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full flex gap-4 overflow-hidden">
      <CustomerPanel 
        selectedCustomer={selectedCustomer} 
        onSelect={handleSelectCustomer} 
        onDeselect={handleDeselectCustomer} 
        onViewHistory={handleViewHistory}
        onAddNew={handleAddNewCustomer}
      />
      {/* 고객 미선택 시 OrderPanel, PaymentPanel 비활성화 overlay */}
      <div className="flex-1 min-w-0 flex gap-4 overflow-hidden relative">
        {!selectedCustomer && (
          <div className="absolute inset-0 z-50 bg-surface/90 flex items-center justify-center rounded-xl">
            <div className="flex flex-col items-center gap-3 bg-surface-card border border-border-default rounded-lg px-8 py-6 shadow-xl">
              <User className="w-10 h-10 text-on-surface-muted opacity-40" />
              <p className="text-sm font-semibold text-on-surface">왼쪽 검색에서 고객을 먼저 선택해주세요.</p>
            </div>
          </div>
        )}
        <OrderPanel
          items={items}
          onAddItem={addItem}
          onRemoveItem={removeItem}
          onUpdateQty={updateQuantity}
          onUpdateItem={updateItem}
        />
        <PaymentPanel
          key={submitCount}
          items={items}
          selectedCustomer={selectedCustomer}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      </div>

      <CustomerFormCard
        open={isCustomerModalOpen}
        mode="create"
        customer={newCustomerName ? { id: 0, name: newCustomerName, phoneNumber: null, note: null, createdAt: "", lastModifiedAt: "" } : null}
        onSave={handleCustomerSave as any}
        onClose={() => setIsCustomerModalOpen(false)}
      />
    </div>
  );
}
