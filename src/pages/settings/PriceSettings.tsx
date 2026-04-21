import { useState, useEffect } from "react";
import { Tag, Plus, Pen, Trash2, GripVertical } from "lucide-react";
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
import type { Category, PriceItem, PriceOption } from "@/types";

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
          autoFocus
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
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border border-border-default rounded-lg bg-surface text-on-surface focus:border-primary-500 outline-none transition-colors"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface mb-1">단가 (원)</label>
        <input
          type="number"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
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

function PriceOptionFormContent({
  initial,
  onSave,
}: {
  initial?: { name: string; price: number };
  onSave: (name: string, price: number) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const { close } = useDialogStore();

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
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border border-border-default rounded-lg bg-surface text-on-surface focus:border-primary-500 outline-none transition-colors"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface mb-1">추가 금액 (원)</label>
        <input
          type="number"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
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
      className={`flex items-center border-b border-border-default last:border-0 group ${
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
        className={`flex-1 text-left px-2 py-3 text-sm transition-colors cursor-pointer ${
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
            className="p-1.5 text-on-surface-muted hover:text-primary-600 hover:bg-primary-100 dark:hover:bg-primary-950/50 rounded transition-colors cursor-pointer"
          >
            <Pen className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-on-surface-muted hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-950/50 rounded transition-colors cursor-pointer"
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
            className="p-1.5 text-on-surface-muted hover:text-primary-600 hover:bg-primary-100 dark:hover:bg-primary-950/50 rounded transition-colors cursor-pointer"
          >
            <Pen className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-on-surface-muted hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-950/50 rounded transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function SortablePriceOptionRow({
  opt,
  onEdit,
  onDelete,
}: {
  opt: PriceOption;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: opt.id,
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
      <td className="pl-3 pr-1 py-2.5 w-8">
        <span
          {...attributes}
          {...listeners}
          className="text-on-surface-muted opacity-0 group-hover:opacity-60 cursor-grab active:cursor-grabbing transition-opacity block"
        >
          <GripVertical className="w-4 h-4" />
        </span>
      </td>
      <td className="px-4 py-2.5 text-sm font-medium text-on-surface">{opt.name}</td>
      <td className="px-4 py-2.5 text-sm text-right font-medium text-primary-600 dark:text-primary-400 tabular-nums">
        +{opt.price.toLocaleString()} 원
      </td>
      <td className="px-4 py-2.5 text-center w-20">
        <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-1.5 text-on-surface-muted hover:text-primary-600 hover:bg-primary-100 dark:hover:bg-primary-950/50 rounded transition-colors cursor-pointer"
          >
            <Pen className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-on-surface-muted hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-950/50 rounded transition-colors cursor-pointer"
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
    priceOptions,
    selectedCategoryId,
    isLoading,
    loadCategories,
    loadPriceOptions,
    selectCategory,
    createCategory,
    updateCategory,
    deleteCategory,
    createPriceItem,
    updatePriceItem,
    deletePriceItem,
    createPriceOption,
    updatePriceOption,
    deletePriceOption,
  } = usePriceStore();

  const { showCustom, showConfirm } = useDialogStore();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    loadCategories();
    loadPriceOptions();
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
          onSave={(name) => {
            createCategory({ name, sortOrder: categories.length });
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
    // optimistic update
    usePriceStore.setState({ categories: reordered });
    // persist new sortOrders (only changed items)
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
          onSave={(name, price) => {
            createPriceItem({
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
    // optimistic update: merge reordered items back into priceItems
    const otherItems = priceItems.filter((p) => p.categoryId !== selectedCategoryId);
    usePriceStore.setState({ priceItems: [...otherItems, ...reordered] });
    // persist
    await Promise.all(
      reordered.map((item, i) =>
        item.sortOrder !== i ? updatePriceItem(item.id, { sortOrder: i }) : Promise.resolve(item),
      ),
    );
  };

  // ---- PriceOption handlers ----

  const handleAddOption = () => {
    showCustom({
      title: "옵션 추가",
      hideFooter: true,
      customContent: (
        <PriceOptionFormContent
          onSave={(name, price) => {
            createPriceOption({ name, price, sortOrder: priceOptions.length });
          }}
        />
      ),
    });
  };

  const handleEditOption = (opt: PriceOption) => {
    showCustom({
      title: "옵션 수정",
      hideFooter: true,
      customContent: (
        <PriceOptionFormContent
          initial={{ name: opt.name, price: opt.price }}
          onSave={(name, price) => {
            updatePriceOption(opt.id, { name, price });
          }}
        />
      ),
    });
  };

  const handleDeleteOption = async (opt: PriceOption) => {
    const ok = await showConfirm({
      title: "옵션 삭제",
      message: `"${opt.name}" 옵션을 삭제하시겠습니까?`,
      confirmText: "삭제",
      isDestructive: true,
    });
    if (ok) await deletePriceOption(opt.id);
  };

  const handleOptionDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = priceOptions.findIndex((o) => o.id === active.id);
    const newIndex = priceOptions.findIndex((o) => o.id === over.id);
    const reordered = arrayMove(priceOptions, oldIndex, newIndex);
    usePriceStore.setState({ priceOptions: reordered });
    await Promise.all(
      reordered.map((opt, i) =>
        opt.sortOrder !== i ? updatePriceOption(opt.id, { sortOrder: i }) : Promise.resolve(opt),
      ),
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-6 shrink-0">
        <Tag className="w-5 h-5 text-on-surface-muted" />
        <h3 className="text-lg font-bold text-on-surface">단가표 및 옵션 관리</h3>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* ---- Category panel (left) ---- */}
        <div className="w-52 shrink-0 bg-surface-card border border-border-default rounded-lg flex flex-col overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-surface-elevated border-b border-border-default flex items-center justify-between shrink-0">
            <h4 className="text-sm font-semibold text-on-surface">분류</h4>
            <button
              onClick={handleAddCategory}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-950/40 border border-primary-200 dark:border-primary-800 rounded hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors cursor-pointer"
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
                  <li className="p-8 text-center text-xs text-on-surface-muted">
                    카테고리가 없습니다.
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
            <div className="px-4 py-3 bg-surface-elevated border-b border-border-default flex items-center justify-between shrink-0">
              <h4 className="text-sm font-semibold text-on-surface">
                <span className="text-primary-600 dark:text-primary-400 mr-1.5">
                  [{activeCat?.name ?? "선택 안됨"}]
                </span>
                세부 품목 단가표
              </h4>
              <button
                onClick={handleAddItem}
                disabled={!selectedCategoryId}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-950/40 border border-primary-200 dark:border-primary-800 rounded hover:bg-primary-100 dark:hover:bg-primary-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
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
                        <th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-muted uppercase tracking-wide">
                          품목명
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-on-surface-muted uppercase tracking-wide w-36">
                          기본 단가
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-on-surface-muted uppercase tracking-wide w-20">
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
                      </tbody>
                    </SortableContext>
                  </table>
                </DndContext>
              )}
            </div>
          </div>

          {/* Price options panel */}
          <div className="h-60 shrink-0 bg-surface-card border border-border-default rounded-lg flex flex-col overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-surface-elevated border-b border-border-default flex items-center justify-between shrink-0">
              <div>
                <h4 className="text-sm font-semibold text-on-surface">공통 추가 옵션</h4>
                <p className="text-xs text-on-surface-muted mt-0.5">
                  모든 품목에 공통으로 추가할 수 있는 옵션입니다.
                </p>
              </div>
              <button
                onClick={handleAddOption}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-on-surface bg-surface-card border border-border-default rounded hover:bg-surface-elevated transition-colors cursor-pointer self-start"
              >
                <Plus className="w-3.5 h-3.5" />
                옵션 추가
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis]}
                onDragEnd={handleOptionDragEnd}
              >
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface-elevated border-b border-border-default z-10">
                    <tr>
                      <th className="w-8 pl-3" />
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-on-surface-muted uppercase tracking-wide">
                        옵션명
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-on-surface-muted uppercase tracking-wide w-36">
                        추가 금액
                      </th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-on-surface-muted uppercase tracking-wide w-20">
                        관리
                      </th>
                    </tr>
                  </thead>
                  <SortableContext
                    items={priceOptions.map((o) => o.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <tbody>
                      {priceOptions.map((opt) => (
                        <SortablePriceOptionRow
                          key={opt.id}
                          opt={opt}
                          onEdit={() => handleEditOption(opt)}
                          onDelete={() => handleDeleteOption(opt)}
                        />
                      ))}
                      {priceOptions.length === 0 && (
                        <tr>
                          <td colSpan={4} className="p-8 text-center text-sm text-on-surface-muted">
                            등록된 옵션이 없습니다.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </SortableContext>
                </table>
              </DndContext>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
