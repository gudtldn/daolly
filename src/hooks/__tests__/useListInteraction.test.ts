import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useListInteraction } from "../useListInteraction";

describe("useListInteraction", () => {
  it("should initialize with default values", () => {
    const { result } = renderHook(() => useListInteraction());

    expect(result.current.source).toBe("keyboard");
    expect(result.current.highlightIdx).toBe(0);
  });

  it("should handle custom initial index", () => {
    const { result } = renderHook(() => useListInteraction({ initialIndex: 5 }));
    expect(result.current.highlightIdx).toBe(5);
  });

  it("should change internal source when setSource is called", () => {
    const { result } = renderHook(() => useListInteraction());

    act(() => {
      result.current.setSource("mouse");
    });

    expect(result.current.source).toBe("mouse");
  });

  it("should respect external source if provided", () => {
    const onSourceChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ source }) =>
        useListInteraction({
          externalSource: source as "keyboard" | "mouse",
          onSourceChange,
        }),
      { initialProps: { source: "keyboard" } }
    );

    expect(result.current.source).toBe("keyboard");

    // external source 업데이트
    rerender({ source: "mouse" });
    expect(result.current.source).toBe("mouse");

    // setSource 호출 시 onSourceChange만 호출되고 내부 상태는 안 바뀜
    act(() => {
      result.current.setSource("keyboard");
    });

    expect(onSourceChange).toHaveBeenCalledWith("keyboard");
    expect(result.current.source).toBe("mouse"); // rerender 전이므로 외부 주입값 유지
  });

  it("should call scrollIntoView on the referenced element when source is keyboard and index changes", () => {
    const { result } = renderHook(() => useListInteraction());

    const mockElement = document.createElement("div");
    mockElement.scrollIntoView = vi.fn();

    // element 등록
    act(() => {
      result.current.setItemRef(1)(mockElement);
    });

    act(() => {
      result.current.setHighlightIdx(1);
    });

    // keyboard source이므로 scrollIntoView가 호출되어야 함
    expect(mockElement.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("should not call scrollIntoView when source is mouse", () => {
    const { result } = renderHook(() => useListInteraction());

    const mockElement = document.createElement("div");
    mockElement.scrollIntoView = vi.fn();

    act(() => {
      result.current.setSource("mouse");
      result.current.setItemRef(1)(mockElement);
    });

    act(() => {
      result.current.setHighlightIdx(1);
    });

    expect(mockElement.scrollIntoView).not.toHaveBeenCalled();
  });
});
