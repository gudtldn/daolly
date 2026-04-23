import { useState, useEffect } from "react";

/**
 * 값이 변경된 후 지정된 지연 시간(delay) 동안 추가 변경이 없을 때만 최신 값을 반환합니다.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
