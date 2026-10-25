import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CreditPayment } from "@/types";

const payments = vi.hoisted(() => ({ listCredit: vi.fn(), delete: vi.fn() }));
vi.mock("@/bindings", () => ({ paymentApi: payments }));

import { CreditPaymentReview } from "@/pages/settings/CreditPaymentReview";
import { useDialogStore } from "@/stores/dialogStore";

const credit: CreditPayment = {
  paymentId: 11,
  workItemId: 5,
  customerId: 1,
  customerName: "김고객",
  description: "와이셔츠 x2",
  amount: 7000,
  paidAt: "2026-09-20T01:00:00.000Z",
};

describe("CreditPaymentReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("정리할 외상 결제가 없으면 아무것도 보이지 않는다", async () => {
    payments.listCredit.mockResolvedValue([]);
    const { container } = render(<CreditPaymentReview />);
    await waitFor(() => expect(payments.listCredit).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("확인하면 결제에서 빼고 목록을 다시 불러온다", async () => {
    const user = userEvent.setup();
    payments.listCredit.mockResolvedValueOnce([credit]).mockResolvedValueOnce([]);
    payments.delete.mockResolvedValue(undefined);
    render(<CreditPaymentReview />);

    expect(await screen.findByText("외상으로 기록된 결제 1건")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "결제에서 빼기" }));
    await waitFor(() => expect(useDialogStore.getState().isOpen).toBe(true));
    act(() => useDialogStore.getState().close(true));

    await waitFor(() => expect(payments.delete).toHaveBeenCalledWith(11));
    await waitFor(() => expect(screen.queryByText("외상으로 기록된 결제 1건")).not.toBeInTheDocument());
  });

  it("취소하면 지우지 않는다", async () => {
    const user = userEvent.setup();
    payments.listCredit.mockResolvedValue([credit]);
    render(<CreditPaymentReview />);

    await user.click(await screen.findByRole("button", { name: "결제에서 빼기" }));
    await waitFor(() => expect(useDialogStore.getState().isOpen).toBe(true));
    act(() => useDialogStore.getState().close(false));

    await waitFor(() => expect(useDialogStore.getState().isOpen).toBe(false));
    expect(payments.delete).not.toHaveBeenCalled();
  });
});
