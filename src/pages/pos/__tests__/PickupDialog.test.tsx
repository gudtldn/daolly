import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WorkItem, WorkItemFull } from "@/types";

const api = vi.hoisted(() => ({ pickup: vi.fn() }));
vi.mock("@/bindings", () => ({ workItemApi: api }));

import { PickupDialog } from "@/pages/pos/PickupDialog";

const item: WorkItem = {
  id: 7, customerId: 1, status: "Completed", description: "와이셔츠 x2", price: 6000, paidAmount: 1000, note: null,
  receivedAt: "2026-09-24T01:00:00.000Z", completedAt: "2026-09-24T05:00:00.000Z", pickedUpAt: null,
  createdAt: "2026-09-24T01:00:00.000Z", lastModifiedAt: "2026-09-24T05:00:00.000Z",
};
const receipt: WorkItemFull = { ...item, status: "PickedUp", paidAmount: 6000, details: [], payments: [] };

describe("PickupDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("남은 금액을 보여 주고, 받은 방법을 누르면 결제와 출고를 한 번에 요청한다", async () => {
    const user = userEvent.setup();
    api.pickup.mockResolvedValue(receipt);
    const onPickedUp = vi.fn();
    render(<PickupDialog item={item} onClose={vi.fn()} onPickedUp={onPickedUp} />);

    expect(screen.getByText("5,000원")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "현금" }));

    expect(api.pickup).toHaveBeenCalledWith(7, "cash");
    expect(onPickedUp).toHaveBeenCalledWith(receipt, "cash", 5000);
  });

  it("받지 않고 출고하면 미수금으로 둔다", async () => {
    const user = userEvent.setup();
    api.pickup.mockResolvedValue({ ...receipt, paidAmount: 1000 });
    const onPickedUp = vi.fn();
    render(<PickupDialog item={item} onClose={vi.fn()} onPickedUp={onPickedUp} />);

    await user.click(screen.getByRole("button", { name: /받지 않고 출고/ }));
    expect(api.pickup).toHaveBeenCalledWith(7, null);
    expect(onPickedUp).toHaveBeenCalledWith(expect.anything(), null, 0);
  });

  it("다 받은 세탁물은 출고만 하고, 실패하면 이유를 보여 준다", async () => {
    const user = userEvent.setup();
    api.pickup.mockRejectedValue({ code: "VALIDATION", message: "이미 출고한 세탁물입니다." });
    render(<PickupDialog item={{ ...item, paidAmount: 6000 }} onClose={vi.fn()} onPickedUp={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "현금" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "출고하기" }));
    expect(api.pickup).toHaveBeenCalledWith(7, null);
    expect(await screen.findByText("이미 출고한 세탁물입니다.")).toBeInTheDocument();
  });

  it("닫혀 있으면 아무것도 그리지 않는다", () => {
    const { container } = render(<PickupDialog item={null} onClose={vi.fn()} onPickedUp={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
