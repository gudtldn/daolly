import { useState, useEffect, useCallback, useRef } from "react";
import { useDebounce } from "./useDebounce";

interface UseSearchOptions<T> {
  delay?: number;
  initialQuery?: string;
  allowEmpty?: boolean;
  onBeforeSearch?: (query: string) => void;
  onSuccess?: (results: T[]) => void;
  onError?: (error: unknown) => void;
  onClear?: () => void;
}

export function useSearch<T>(
  searchFn: (query: string) => Promise<T[]>,
  options: UseSearchOptions<T> = {}
) {
  const { delay = 300, initialQuery = "", allowEmpty = false, onBeforeSearch, onSuccess, onError, onClear } = options;

  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebounce(query, delay);
  const [results, setResults] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 콜백들이 매번 새로 생성되어도 무한 루프를 타지 않도록 ref로 관리
  const callbacks = useRef({ onBeforeSearch, onSuccess, onError, onClear });
  useEffect(() => {
    callbacks.current = { onBeforeSearch, onSuccess, onError, onClear };
  }, [onBeforeSearch, onSuccess, onError, onClear]);

  const performSearch = useCallback(
    async (searchQuery: string) => {
      const trimmed = searchQuery.trim();
      if (!trimmed && !allowEmpty) {
        setResults([]);
        callbacks.current.onClear?.();
        return;
      }

      setIsLoading(true);
      callbacks.current.onBeforeSearch?.(trimmed);
      try {
        const data = await searchFn(trimmed);
        setResults(data);
        callbacks.current.onSuccess?.(data);
      } catch (err) {
        callbacks.current.onError?.(err);
      } finally {
        setIsLoading(false);
      }
    },
    [searchFn, allowEmpty]
  );

  useEffect(() => {
    performSearch(debouncedQuery);
  }, [debouncedQuery, performSearch]);

  const clear = useCallback(() => {
    setQuery("");
    setResults([]);
  }, []);

  return {
    query,
    setQuery,
    debouncedQuery,
    results,
    setResults,
    isLoading,
    clear,
    performSearch, // 수동 호출이 필요할 때 사용 (e.g. 등록 후 재검색)
  };
}
