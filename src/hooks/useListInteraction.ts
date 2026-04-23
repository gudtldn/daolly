import { useState, useRef, useEffect, useCallback } from "react";

export type InteractionSource = "keyboard" | "mouse";

export interface UseListInteractionOptions {
  initialIndex?: number;
  /**
   * 외부에서 `source` 상태를 주입받아 사용할 때 사용합니다. (e.g., 전역 상태)
   */
  externalSource?: InteractionSource;
  /**
   * 외부 `source`가 변경되어야 할 때 호출되는 콜백입니다.
   */
  onSourceChange?: (source: InteractionSource) => void;
  /**
   * 기본 scrollIntoView 대신 사용할 커스텀 스크롤 동작을 정의합니다.
   */
  onScroll?: (el: HTMLElement, index: number) => void;
}

export function useListInteraction(options: UseListInteractionOptions = {}) {
  const { initialIndex = 0, externalSource, onSourceChange, onScroll } = options;

  const [internalSource, setInternalSource] = useState<InteractionSource>("keyboard");
  const source = externalSource !== undefined ? externalSource : internalSource;

  const [highlightIdx, setHighlightIdx] = useState(initialIndex);
  const itemRefs = useRef<Map<number, HTMLElement>>(new Map());

  const setSource = useCallback(
    (newSource: InteractionSource) => {
      if (newSource !== source) {
        if (externalSource === undefined) {
          setInternalSource(newSource);
        }
        onSourceChange?.(newSource);
      }
    },
    [source, externalSource, onSourceChange]
  );

  const setItemRef = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      if (el) {
        itemRefs.current.set(index, el);
      } else {
        itemRefs.current.delete(index);
      }
    },
    []
  );

  useEffect(() => {
    if (source === "keyboard") {
      const el = itemRefs.current.get(highlightIdx);
      if (el) {
        if (onScroll) {
          onScroll(el, highlightIdx);
        } else {
          el.scrollIntoView({ block: "nearest" });
        }
      }
    }
  }, [highlightIdx, source, onScroll]);

  return {
    source,
    setSource,
    highlightIdx,
    setHighlightIdx,
    setItemRef,
    itemRefs,
  };
}
