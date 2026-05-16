import { useState, useEffect, useRef } from "react";
import { Tag, Plus, Pen, Trash2, GripVertical, FileUp, FileDown } from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { usePriceStore } from "@/stores/priceStore";
import { useDialogStore } from "@/stores/dialogStore";
import type { Category, PriceItem } from "@/types";
import { CurrencyInput } from "@/components/CurrencyInput";

// ============================================================
// Form components rendered inside GlobalDialog customContent
// Each form uses useDialogStore.close() for its own cancel/save buttons
// so the dialog footer (hideFooter: true) is not rendered.
// ============================================================

function CategoryFormContent({
  initial,
  onSave,
}: {
  initial?: { name: string };
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const { close } = useDialogStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 렌더링 후 확실하게 포커스
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim());
    close(true);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-on-surface mb-1">이름</label>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border border-border-default rounded-lg bg-surface text-on-surface focus:border-primary-500 outline-none transition-colors"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-border-default">
        <button
          type="button"
          onClick={() => close(false)}
          className="px-4 py-2 text-sm font-medium text-on-surface bg-surface-card border border-border-default rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={!name.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          저장하기
        </button>
      </div>
    </form>
  );
}

function PriceItemFormContent({
  initial,
  onSave,
}: {
  initial?: { name: string; defaultPrice: number };
  onSave: (name: string, price: number) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [price, setPrice] = useState(initial ? String(initial.defaultPrice) : "");
  const { close } = useDialogStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(price, 10);
    if (!name.trim() || isNaN(p) || p < 0) return;
    onSave(name.trim(), p);
    close(true);
  };

  const isValid =
    name.trim().length > 0 && price !== "" && !isNaN(parseInt(price, 10)) && parseInt(price, 10) >= 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-on-surface mb-1">이름</label>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border border-border-default rounded-lg bg-surface text-on-surface focus:border-primary-500 outline-none transition-colors"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface mb-1">단가 (원)</label>
        <CurrencyInput
          min={0}
          value={parseInt(price, 10) || 0}
          onChange={(val) => setPrice(String(val))}
          className="w-full px-3 py-2 border border-border-default rounded-lg bg-surface text-on-surface focus:border-primary-500 outline-none transition-colors"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-border-default">
        <button
          type="button"
          onClick={() => close(false)}
          className="px-4 py-2 text-sm font-medium text-on-surface bg-surface-card border border-border-default rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={!isValid}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          저장하기
        </button>
      </div>
    </form>
  );
}

// ============================================================
// Sortable wrappers (dnd-kit)
// ============================================================

function SortableCategoryItem({
  cat,
  isActive,
  onSelect,
  onEdit,
  onDelete,
}: {
  cat: Category;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cat.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center border-b border-border-default last:border-0 group min-w-0 ${
        isActive ? "bg-primary-50 dark:bg-primary-950/30 border-l-2 border-l-primary-500" : "border-l-2 border-l-transparent"
      }`}
    >
      <span
        {...attributes}
        {...listeners}
        className="px-2 py-3 text-on-surface-muted opacity-0 group-hover:opacity-60 cursor-grab active:cursor-grabbing transition-opacity shrink-0"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </span>
      <button
        onClick={onSelect}
        title={cat.name}
        className={`flex-1 text-left px-2 py-3 text-sm transition-colors cursor-pointer truncate ${
          isActive
            ? "text-primary-700 dark:text-primary-300 font-semibold"
            : "text-on-surface hover:text-on-surface"
        }`}
      >
        {cat.name}
      </button>
      {isActive && (
        <div className="flex items-center gap-0.5 pr-2 shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 text-on-surface-muted hover:text-primary-600 hover:bg-primary-100 dark:hover:bg-primary-950/50 rounded-lg transition-colors cursor-pointer"
          >
            <Pen className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-on-surface-muted hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-950/50 rounded-lg transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </li>
  );
}

function SortablePriceItemRow({
  item,
  onEdit,
  onDelete,
}: {
  item: PriceItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="border-b border-border-default last:border-0 hover:bg-surface-elevated group transition-colors"
    >
      <td className="pl-3 pr-1 py-3 w-8">
        <span
          {...attributes}
          {...listeners}
          className="text-on-surface-muted opacity-0 group-hover:opacity-60 cursor-grab active:cursor-grabbing transition-opacity block"
        >
          <GripVertical className="w-4 h-4" />
        </span>
      </td>
      <td className="px-4 py-3 text-sm font-medium text-on-surface">{item.name}</td>
      <td className="px-4 py-3 text-sm text-right text-on-surface tabular-nums">
        {item.defaultPrice.toLocaleString()} 원
      </td>
      <td className="px-4 py-3 text-center w-20">
        <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-1.5 text-on-surface-muted hover:text-primary-600 hover:bg-primary-100 dark:hover:bg-primary-950/50 rounded-lg transition-colors cursor-pointer"
          >
            <Pen className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-on-surface-muted hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-950/50 rounded-lg transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ============================================================
// Main Component
// ============================================================

export function PriceSettings() {
  const {
    categories,
    priceItems,
    selectedCategoryId,
    isLoading,
    loadCategories,
    selectCategory,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    createPriceItem,
    updatePriceItem,
    deletePriceItem,
    reorderPriceItems,
    exportSettings,
    importSettings,
  } = usePriceStore();

  const { showCustom, showConfirm } = useDialogStore();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    loadCategories();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // select first category once categories are loaded
  useEffect(() => {
    if (categories.length > 0 && selectedCategoryId === null) {
      selectCategory(categories[0].id);
    }
  }, [categories, selectCategory]);

  const activeCat = categories.find((c) => c.id === selectedCategoryId);
  const activeItems = priceItems.filter((p) => p.categoryId === selectedCategoryId);

  // ---- Category handlers ----

  const handleAddCategory = () => {
    showCustom({
      title: "카테고리 추가",
      hideFooter: true,
      customContent: (
        <CategoryFormContent
          onSave={async (name) => {
            const newCat = await createCategory({ name, sortOrder: categories.length });
            selectCategory(newCat.id);
          }}
        />
      ),
    });
  };

  const handleEditCategory = (cat: Category) => {
    showCustom({
      title: "카테고리 수정",
      hideFooter: true,
      customContent: (
        <CategoryFormContent
          initial={{ name: cat.name }}
          onSave={(name) => {
            updateCategory(cat.id, { name, sortOrder: cat.sortOrder });
          }}
        />
      ),
    });
  };

  const handleDeleteCategory = async (cat: Category) => {
    const ok = await showConfirm({
      title: "카테고리 삭제",
      message: `"${cat.name}" 카테고리를 삭제하시겠습니까? 해당 카테고리의 품목도 모두 삭제됩니다.`,
      confirmText: "삭제",
      isDestructive: true,
    });
    if (ok) await deleteCategory(cat.id);
  };

  const handleCategoryDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(categories, oldIndex, newIndex);
    reorderCategories(reordered);
    await Promise.all(
      reordered.map((cat, i) =>
        cat.sortOrder !== i ? updateCategory(cat.id, { name: cat.name, sortOrder: i }) : Promise.resolve(cat),
      ),
    );
  };

  // ---- PriceItem handlers ----

  const handleAddItem = () => {
    if (!selectedCategoryId) return;
    showCustom({
      title: "품목 추가",
      hideFooter: true,
      customContent: (
        <PriceItemFormContent
          onSave={async (name, price) => {
            await createPriceItem({
              categoryId: selectedCategoryId,
              name,
              defaultPrice: price,
              sortOrder: activeItems.length,
            });
          }}
        />
      ),
    });
  };

  const handleEditItem = (item: PriceItem) => {
    showCustom({
      title: "품목 수정",
      hideFooter: true,
      customContent: (
        <PriceItemFormContent
          initial={{ name: item.name, defaultPrice: item.defaultPrice }}
          onSave={(name, price) => {
            updatePriceItem(item.id, { name, defaultPrice: price });
          }}
        />
      ),
    });
  };

  const handleDeleteItem = async (item: PriceItem) => {
    const ok = await showConfirm({
      title: "품목 삭제",
      message: `"${item.name}"을(를) 삭제하시겠습니까?`,
      confirmText: "삭제",
      isDestructive: true,
    });
    if (ok) await deletePriceItem(item.id);
  };

  const handleItemDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = activeItems.findIndex((i) => i.id === active.id);
    const newIndex = activeItems.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(activeItems, oldIndex, newIndex);
    if (selectedCategoryId !== null) reorderPriceItems(selectedCategoryId, reordered);
    await Promise.all(
      reordered.map((item, i) =>
        item.sortOrder !== i ? updatePriceItem(item.id, { sortOrder: i }) : Promise.resolve(item),
      ),
    );
  };

  const handleExport = async () => {
    try {
      const path = await save({
        filters: [{ name: "JSON", extensions: ["json"] }],
        defaultPath: "daolly_price_settings.json",
      });
      if (!path) return;
      await exportSettings(path);
      toast.success("단가표를 내보냈습니다.");
    } catch (e) {
      toast.error(`내보내기 실패: ${e}`);
    }
  };

  const handleImport = async () => {
    try {
      const path = await open({
        filters: [{ name: "JSON", extensions: ["json"] }],
        multiple: false,
      });
      if (!path || Array.isArray(path)) return;

      const ok = await showConfirm({
        title: "단가표 가져오기",
        message: "기존 단가표가 모두 삭제되고 선택한 파일의 내용으로 대체됩니다. 정말 진행하시겠습니까?",
        confirmText: "가져오기",
        isDestructive: true,
      });
      if (!ok) return;

      await importSettings(path);
      toast.success("단가표를 가져왔습니다.");
    } catch (e) {
      toast.error(`가져오기 실패: ${e}`);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div className="flex items-center gap-2">
          <Tag className="w-5 h-5 text-on-surface-muted" />
          <h3 className="text-lg font-bold text-on-surface">단가표 및 옵션 관리</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-on-surface bg-surface-card border border-border-default rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer"
          >
            <FileUp className="w-4 h-4" />
            내보내기
          </button>
          <button
            onClick={handleImport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-950/40 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors cursor-pointer"
          >
            <FileDown className="w-4 h-4" />
            가져오기
          </button>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* ---- Category panel (left) ---- */}
        <div className="w-64 shrink-0 bg-surface-card border border-border-default rounded-lg flex flex-col overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-surface-elevated border-b border-border-default flex items-center justify-between shrink-0">
            <h4 className="text-sm font-semibold text-on-surface">분류</h4>
            <button
              onClick={handleAddCategory}
              className="flex items-center gap-1 px-2 py-1 text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-950/40 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              추가
            </button>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleCategoryDragEnd}
          >
            <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <ul className="flex-1 overflow-y-auto">
                {categories.map((cat) => (
                  <SortableCategoryItem
                    key={cat.id}
                    cat={cat}
                    isActive={selectedCategoryId === cat.id}
                    onSelect={() => selectCategory(cat.id)}
                    onEdit={() => handleEditCategory(cat)}
                    onDelete={() => handleDeleteCategory(cat)}
                  />
                ))}
                {categories.length === 0 && (
                  <li className="p-8 text-center text-sm text-on-surface-muted">
                    카테고리가 없습니다.
                  </li>
                )}
                {categories.length > 1 && (
                  <li className="px-3 py-2 text-[0.65rem] text-on-surface-muted/60 text-center border-t border-border-default/50">
                    &#8942; 좌측 핸들을 드래그해서 순서를 변경할 수 있습니다
                  </li>
                )}
              </ul>
            </SortableContext>
          </DndContext>
        </div>

        {/* ---- Right panels ---- */}
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {/* Price items panel */}
          <div className="flex-1 bg-surface-card border border-border-default rounded-lg flex flex-col overflow-hidden shadow-sm min-h-0">
            <div className="px-4 py-3 bg-surface-elevated border-b border-border-default flex items-center justify-between shrink-0 gap-4">
              <h4 className="text-sm font-semibold text-on-surface flex items-center min-w-0">
                <span className="shrink-0">세부 품목 단가표</span>
                {activeCat && (
                  <span className="ml-1.5 text-primary-600 dark:text-primary-400 font-normal truncate" title={activeCat.name}>
                    [{activeCat.name}]
                  </span>
                )}
              </h4>
              <button
                onClick={handleAddItem}
                disabled={!selectedCategoryId}
                className="flex items-center gap-1 px-2 py-1 text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-950/40 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                품목 추가
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              {isLoading ? (
                <div className="p-8 text-center text-sm text-on-surface-muted">불러오는 중...</div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  modifiers={[restrictToVerticalAxis]}
                  onDragEnd={handleItemDragEnd}
                >
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface-elevated border-b border-border-default z-10">
                      <tr>
                        <th className="w-8 pl-3" />
                        <th className="px-4 py-3 text-left text-sm font-semibold text-on-surface-muted uppercase tracking-wide">
                          품목명
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-on-surface-muted uppercase tracking-wide w-36">
                          기본 단가
                        </th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-on-surface-muted uppercase tracking-wide w-20">
                          관리
                        </th>
                      </tr>
                    </thead>
                    <SortableContext
                      items={activeItems.map((i) => i.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <tbody>
                        {activeItems.map((item) => (
                          <SortablePriceItemRow
                            key={item.id}
                            item={item}
                            onEdit={() => handleEditItem(item)}
                            onDelete={() => handleDeleteItem(item)}
                          />
                        ))}
                        {(!selectedCategoryId || activeItems.length === 0) && (
                          <tr>
                            <td colSpan={4} className="p-10 text-center text-sm text-on-surface-muted">
                              {selectedCategoryId
                                ? "등록된 품목이 없습니다."
                                : "카테고리를 먼저 선택해주세요."}
                            </td>
                          </tr>
                        )}
                        {activeItems.length > 1 && (
                          <tr>
                            <td colSpan={4} className="px-3 py-2 text-[0.65rem] text-on-surface-muted/60 text-center border-t border-border-default/50">
                              &#8942; 좌측 핸들을 드래그하면 순서를 변경할 수 있습니다
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </SortableContext>
                  </table>
                </DndContext>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
