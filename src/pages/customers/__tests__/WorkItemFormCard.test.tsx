import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkItemFormCard } from "../WorkItemFormCard";
import type { ComponentProps } from "react";
import type { AmendOrder, ReceiveOrder, WorkItemFull } from "@/types";

type OnSave = ComponentProps<typeof WorkItemFormCard>["onSave"];

vi.mock("@/bindings", () => ({
  paymentApi: { create: vi.fn(), list: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

import { paymentApi } from "@/bindings";
import { useDialogStore } from "@/stores/dialogStore";

const workItem: WorkItemFull = {
  id: 7,
  customerId: 1,
  status: "Received",
  description: "와이셔츠",
  price: 3000,
  paidAmount: 0,
  note: null,
  receivedAt: "2026-09-24T01:15:37.123Z",
  completedAt: null,
  pickedUpAt: null,
  createdAt: "2026-09-24T01:15:37.123Z",
  lastModifiedAt: "2026-09-24T01:15:37.123Z",
  details: [
    { id: 1, workItemId: 7, priceItemId: 3, itemName: "와이셔츠", unitPrice: 3000, quantity: 1, optionsMemo: null },
  ],
  payments: [],
};

function renderEdit(onSave = vi.fn().mockResolvedValue(undefined)) {
  render(
    <WorkItemFormCard open mode="edit" customerId={1} workItem={workItem} onSave={onSave} onClose={vi.fn()} />,
  );
  return onSave;
}

describe("WorkItemFormCard 날짜 전송", () => {
  it("날짜를 건드리지 않고 저장하면 접수/수령 일시를 보내지 않는다", async () => {
    const user = userEvent.setup();
    const onSave = renderEdit();

    await user.type(screen.getByPlaceholderText("작업 관련 메모"), "메모만 수정");
    await user.click(screen.getByRole("button", { name: "저장" }));

    const data = onSave.mock.calls[0][0];
    expect(data.note).toBe("메모만 수정");
    expect(data.receivedAt).toBeNull();
    expect(data.pickedUpAt).toBeNull();
  });

  it("접수 일시를 바꾸면 UTC ISO 형식으로 보낸다", async () => {
    const user = userEvent.setup();
    const onSave = renderEdit();

    const input = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-09-24T20:00" } });
    await user.click(screen.getByRole("button", { name: "저장" }));

    const data = onSave.mock.calls[0][0];
    expect(data.receivedAt).toBe(new Date("2026-09-24T20:00").toISOString());
    expect(data.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("접수 일시 칸을 비우고 저장하면 바꾸지 않은 것으로 본다", async () => {
    const user = userEvent.setup();
    const onSave = renderEdit();

    const input = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(onSave.mock.calls[0][0].receivedAt).toBeNull();
  });
});

describe("WorkItemFormCard 수정", () => {
  it("상태·내용·품목을 한 번에 보내고 단가표 품목 연결을 유지한다", async () => {
    const user = userEvent.setup();
    const onSave = renderEdit();

    await user.click(screen.getByRole("button", { name: "저장" }));

    const amendment = onSave.mock.calls[0][0] as AmendOrder;
    expect(amendment.lines).toEqual([
      { priceItemId: 3, itemName: "와이셔츠", unitPrice: 3000, quantity: 1, optionsMemo: null },
    ]);
    expect(amendment.priceOverride).toBeNull();
    expect(amendment.status).toBeNull();
  });

  it("품목명을 바꾸면 단가표 품목 연결을 끊는다", async () => {
    const user = userEvent.setup();
    const onSave = renderEdit();

    const name = screen.getByPlaceholderText("품목명");
    await user.clear(name);
    await user.type(name, "블라우스");
    await user.click(screen.getByRole("button", { name: "저장" }));

    const amendment = onSave.mock.calls[0][0] as AmendOrder;
    expect(amendment.lines?.[0]).toMatchObject({ priceItemId: null, itemName: "블라우스" });
  });

  it("결제 취소는 확인을 받은 뒤에만 한다", async () => {
    const user = userEvent.setup();
    vi.mocked(paymentApi.list).mockResolvedValue([]);
    const withPayment: WorkItemFull = {
      ...workItem,
      paidAmount: 1000,
      payments: [{ id: 9, workItemId: 7, amount: 1000, method: "cash", paidAt: "2026-09-24T01:20:00.000Z", createdAt: "2026-09-24T01:20:00.000Z" }],
    };
    render(
      <WorkItemFormCard open mode="edit" customerId={1} workItem={withPayment} initialTab="payment" onSave={vi.fn()} onClose={vi.fn()} />,
    );

    await user.click(screen.getByTitle("결제 취소"));
    await waitFor(() => expect(useDialogStore.getState().isOpen).toBe(true));
    act(() => useDialogStore.getState().close(false));
    expect(paymentApi.delete).not.toHaveBeenCalled();

    await user.click(screen.getByTitle("결제 취소"));
    await waitFor(() => expect(useDialogStore.getState().isOpen).toBe(true));
    act(() => useDialogStore.getState().close(true));
    await waitFor(() => expect(paymentApi.delete).toHaveBeenCalledWith(9));
  });

  it("결제 수단에 외상이 없다 (외상은 결제를 기록하지 않음)", () => {
    render(
      <WorkItemFormCard open mode="edit" customerId={1} workItem={workItem} initialTab="payment" onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByRole("option", { name: "현금" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "외상" })).not.toBeInTheDocument();
  });
});

describe("WorkItemFormCard 새 접수", () => {
  async function fillAndSubmit(onSave: OnSave) {
    const user = userEvent.setup();
    render(<WorkItemFormCard open mode="create" customerId={1} onSave={onSave} onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText("작업 내용 요약"), "와이셔츠");
    await user.type(screen.getByPlaceholderText("품목명"), "와이셔츠");
    await user.click(screen.getByRole("button", { name: "접수" }));
    return user;
  }

  it("품목과 요청 ID를 한 번에 보내고, 가격은 서버가 품목으로 계산하게 둔다", async () => {
    const onSave = vi.fn<OnSave>().mockResolvedValue(undefined);
    await fillAndSubmit(onSave);

    expect(onSave).toHaveBeenCalledTimes(1);
    const order = onSave.mock.calls[0][0] as ReceiveOrder;
    expect(order).toMatchObject({
      customerId: 1,
      description: "와이셔츠",
      lines: [{ itemName: "와이셔츠", unitPrice: 0, quantity: 1 }],
      priceOverride: null,
      status: "Received",
      receivedAt: null,
      pickedUpAt: null,
    });
    expect(order.requestId).toEqual(expect.any(String));
    expect(order).not.toHaveProperty("price");
  });

  it("실패하면 오류 문장을 보여주고, 다시 눌러도 같은 요청 ID로 보낸다", async () => {
    const onSave = vi
      .fn<OnSave>()
      .mockRejectedValueOnce({ code: "BUSY", message: "다른 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요." })
      .mockResolvedValue(undefined);
    const user = await fillAndSubmit(onSave);

    expect(await screen.findByText("다른 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "접수" }));

    expect(onSave).toHaveBeenCalledTimes(2);
    const [first, retry] = onSave.mock.calls.map((c) => (c[0] as ReceiveOrder).requestId);
    expect(retry).toBe(first);
  });
});
