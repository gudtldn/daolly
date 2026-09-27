import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Customer } from "@/types";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/bindings", () => ({ customerApi: api }));

import { loadRecentCustomers, rememberRecentCustomer } from "@/utils/recentCustomers";

const customer = (id: number, name = `고객${id}`, createdAt = `2026-09-0${id}T01:00:00.000Z`): Customer => ({
  id, name, phoneNumber: "010-1234-5678", note: null, createdAt, lastModifiedAt: createdAt,
});
const notFound = { code: "NOT_FOUND", message: "고객을 찾을 수 없습니다." };
const stored = () => localStorage.getItem("pos_recent_customer_ids") ?? "";

describe("최근 선택 고객", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("고객 번호와 등록 시각만 저장하고, 보여 줄 때 DB의 최신 정보를 쓴다", async () => {
    let shown = rememberRecentCustomer([], customer(1));
    shown = rememberRecentCustomer(shown, customer(2));
    shown = rememberRecentCustomer(shown, customer(1));
    expect(shown.map((c) => c.id)).toEqual([1, 2]);
    expect(stored()).not.toContain("고객");
    expect(stored()).not.toContain("010");

    api.get.mockImplementation(async (id: number) => customer(id, `바뀐 이름${id}`));
    const loaded = await loadRecentCustomers();
    expect(loaded.map((c) => c.name)).toEqual(["바뀐 이름1", "바뀐 이름2"]);
  });

  it("5명까지만 남긴다", () => {
    let shown: Customer[] = [];
    for (let id = 1; id <= 7; id++) shown = rememberRecentCustomer(shown, customer(id));
    expect(shown.map((c) => c.id)).toEqual([7, 6, 5, 4, 3]);
    expect(JSON.parse(stored())).toHaveLength(5);
  });

  it("초기화·삭제로 없어진 고객과, 복원으로 번호만 같은 다른 고객은 목록에서 지운다", async () => {
    for (const id of [3, 2, 1]) rememberRecentCustomer([], customer(id));
    api.get.mockImplementation(async (id: number) => {
      if (id === 1) throw notFound;
      if (id === 2) return customer(2, "다른 DB의 고객", "2025-01-01T00:00:00.000Z");
      return customer(id);
    });

    expect((await loadRecentCustomers()).map((c) => c.id)).toEqual([3]);
    expect(JSON.parse(stored())).toEqual([{ id: 3, createdAt: customer(3).createdAt }]);
  });

  it("잠깐의 오류로 못 불러온 고객은 이번에만 빼고 목록에는 남겨 둔다", async () => {
    for (const id of [2, 1]) rememberRecentCustomer([], customer(id));
    api.get.mockImplementation(async (id: number) => {
      if (id === 1) throw { code: "BUSY", message: "잠시 후 다시 시도해 주세요." };
      return customer(id);
    });

    expect((await loadRecentCustomers()).map((c) => c.id)).toEqual([2]);
    expect(JSON.parse(stored()).map((e: { id: number }) => e.id)).toEqual([1, 2]);
  });

  it("업데이트로 시각 저장 형식이 바뀌어도 같은 고객으로 본다", async () => {
    rememberRecentCustomer([], customer(1, "고객1", "2026-09-01T10:00:00+09:00"));
    api.get.mockResolvedValue(customer(1, "고객1", "2026-09-01T01:00:00.000Z"));
    expect((await loadRecentCustomers()).map((c) => c.id)).toEqual([1]);
  });

  it("예전 버전이 고객 정보째 저장한 목록은 번호와 등록 시각만 남기고 지운다", async () => {
    localStorage.setItem("pos_recent_customers", JSON.stringify([customer(2), customer(1)]));
    api.get.mockImplementation(async (id: number) => customer(id));

    expect((await loadRecentCustomers()).map((c) => c.id)).toEqual([2, 1]);
    expect(localStorage.getItem("pos_recent_customers")).toBeNull();
    expect(stored()).not.toContain("010");
  });
});
