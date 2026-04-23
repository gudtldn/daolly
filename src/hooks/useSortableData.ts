import { useState, useMemo, useCallback } from "react";

export type SortDirection = "asc" | "desc" | null;

export interface SortConfig<T> {
  key: keyof T | null;
  direction: SortDirection;
}

export function useSortableData<T>(
  items: T[],
  initialConfig: SortConfig<T> = { key: null, direction: null }
) {
  const [sortConfig, setSortConfig] = useState<SortConfig<T>>(initialConfig);

  const requestSort = useCallback((key: keyof T) => {
    setSortConfig((prev) => {
      if (prev.key !== key) {
        return { key, direction: "asc" };
      }
      if (prev.direction === "asc") {
        return { key, direction: "desc" };
      }
      if (prev.direction === "desc") {
        return { key: null, direction: null };
      }
      return { key, direction: "asc" };
    });
  }, []);

  const sortedItems = useMemo(() => {
    const { key, direction } = sortConfig;
    if (!key || !direction) {
      return items;
    }

    return [...items].sort((a, b) => {
      const av = a[key];
      const bv = b[key];

      if (av === null || av === undefined) return direction === "asc" ? 1 : -1;
      if (bv === null || bv === undefined) return direction === "asc" ? -1 : 1;

      if (av < bv) {
        return direction === "asc" ? -1 : 1;
      }
      if (av > bv) {
        return direction === "asc" ? 1 : -1;
      }
      return 0;
    });
  }, [items, sortConfig]);

  return { sortedItems, requestSort, sortConfig };
}
