import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/react";
import { DateRangePicker } from "@/pages/sales/DateRangePicker";

// fixed 포지션 계산을 위한 mock (jsdom에서 getBoundingClientRect는 항상 0 반환)
beforeEach(() => {
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    top: 100,
    bottom: 130,
    left: 50,
    right: 200,
    width: 150,
    height: 30,
    x: 50,
    y: 100,
    toJSON: () => {},
  }));
});

describe("DateRangePicker", () => {
  it("value가 없을 때 '기간 직접 지정' 버튼이 렌더링된다", () => {
    render(<DateRangePicker value={null} onApply={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText("기간 직접 지정")).toBeInTheDocument();
  });

  it("value가 있을 때 날짜 범위 배지가 표시된다", () => {
    render(
      <DateRangePicker
        value={{ from: "2026-04-01", to: "2026-04-22" }}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByText("4/1 - 4/22")).toBeInTheDocument();
  });

  it("버튼 클릭 시 팝오버가 열린다", async () => {
    const user = userEvent.setup();
    render(<DateRangePicker value={null} onApply={vi.fn()} onClear={vi.fn()} />);

    await user.click(screen.getByText("기간 직접 지정"));
    expect(screen.getByText("기간 직접 지정", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByLabelText("시작일")).toBeInTheDocument();
    expect(screen.getByLabelText("종료일")).toBeInTheDocument();
  });

  it("'취소' 클릭 시 팝오버가 닫힌다", async () => {
    const user = userEvent.setup();
    render(<DateRangePicker value={null} onApply={vi.fn()} onClear={vi.fn()} />);

    await user.click(screen.getByText("기간 직접 지정"));
    expect(screen.getByLabelText("시작일")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByLabelText("시작일")).not.toBeInTheDocument();
  });

  it("'적용' 클릭 시 onApply가 올바른 범위로 호출된다", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<DateRangePicker value={null} onApply={onApply} onClear={vi.fn()} />);

    await user.click(screen.getByText("기간 직접 지정"));

    const fromInput = screen.getByLabelText("시작일");
    const toInput = screen.getByLabelText("종료일");
    await user.clear(fromInput);
    await user.type(fromInput, "2026-04-01");
    await user.clear(toInput);
    await user.type(toInput, "2026-04-15");

    await user.click(screen.getByRole("button", { name: "적용" }));
    expect(onApply).toHaveBeenCalledWith({ from: "2026-04-01", to: "2026-04-15" });
  });

  it("X 버튼 클릭 시 onClear가 호출된다", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <DateRangePicker
        value={{ from: "2026-04-01", to: "2026-04-22" }}
        onApply={vi.fn()}
        onClear={onClear}
      />
    );

    await user.click(screen.getByTitle("기간 초기화"));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
