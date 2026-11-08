import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import {
  describeArgs,
  describeElement,
  flushUsage,
  maskText,
  startUsageTracking,
  trackCommand,
  trackScreen,
} from "@/utils/usage";

function html(markup: string): HTMLElement {
  document.body.innerHTML = markup;
  return document.body;
}

async function recorded(): Promise<Record<string, unknown>[]> {
  await flushUsage();
  return invoke.mock.calls.flatMap(([, args]) => (args as { events: Record<string, unknown>[] }).events);
}

describe("maskText", () => {
  it("숫자(전화번호·금액)를 가리고 길이를 자른다", () => {
    expect(maskText("  010-1234-5678\n 출고 ")).toBe("###-####-#### 출고");
    expect(maskText("가".repeat(50), 5)).toBe("가가가가가…");
  });
});

describe("describeArgs", () => {
  it("값 대신 종류와 길이만 남긴다", () => {
    expect(describeArgs({ search: "5678", name: "홍길동", q: "ㅎㄱㄷ", id: 3, flag: true, data: { name: "x" } }))
      .toBe("search=digits:4,name=hangul:3,q=jamo:3,id=num,flag=true,data=obj");
    expect(describeArgs({ search: null })).toBe("search=null");
    expect(describeArgs(undefined)).toBeUndefined();
  });
});

describe("describeElement", () => {
  it("data-track 이름을 버튼 글자보다 먼저 쓴다", () => {
    html(`<button data-track="고객 검색 결과"><span id="t">홍길동 010-1234-5678</span></button>`);
    expect(describeElement(document.getElementById("t"))).toEqual({ kind: "button", label: "고객 검색 결과" });
  });

  it("목록 행은 글자를 읽지 않는다", () => {
    html(`<div class="cursor-pointer"><span id="t">홍길동</span></div>`);
    expect(describeElement(document.getElementById("t"))).toEqual({ kind: "div" });
  });

  it("입력칸은 값이 아니라 안내 문구로 구분한다", () => {
    html(`<input id="t" placeholder="이름, 전화번호 뒷자리..." value="홍길동" />`);
    expect(describeElement(document.getElementById("t"))).toEqual({
      kind: "input:text",
      label: "이름, 전화번호 뒷자리...",
    });
  });

  it("버튼 글자의 숫자는 가린다", () => {
    html(`<button id="t">5,000원 결제</button>`);
    expect(describeElement(document.getElementById("t"))).toEqual({ kind: "button", label: "#,###원 결제" });
  });

  it("누를 수 없는 곳이면 null", () => {
    html(`<p id="t">안내</p>`);
    expect(describeElement(document.getElementById("t"))).toBeNull();
  });
});

describe("startUsageTracking", () => {
  let stop: () => void;

  beforeEach(() => {
    invoke.mockReset().mockResolvedValue(undefined);
    stop = startUsageTracking();
  });

  afterEach(() => stop());

  it("클릭·단축키·화면 이동을 고객 정보 없이 남긴다", async () => {
    html(`
      <button id="r" data-track="고객 검색 결과">홍길동 010-1234-5678</button>
      <input id="i" placeholder="검색" value="홍길동" />
      <table><thead><tr><th>고객</th></tr></thead><tbody><tr><td id="c">홍길동</td></tr></tbody></table>
    `);
    trackScreen("/pos");
    document.getElementById("r")!.click();
    document.getElementById("c")!.click();
    document.getElementById("i")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    document.getElementById("i")!.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    trackCommand("list_customers", { search: "홍길동" }, 12.4, { result: [1, 2] });
    trackCommand("receive_order", { data: {} }, 30, { error: { code: "VALIDATION", message: "금액은 0보다 커야 합니다." } });

    const events = await recorded();
    expect(JSON.stringify(events)).not.toMatch(/홍길동|1234/);
    expect(events.map((e) => e.e).filter((e) => e !== "app.start")).toEqual([
      "screen", "click", "click.none", "key", "cmd", "cmd",
    ]);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ e: "screen", to: "/pos", screen: "" }),
      expect.objectContaining({ e: "click", label: "고객 검색 결과", screen: "/pos" }),
      expect.objectContaining({ e: "click.none", column: "고객" }),
      expect.objectContaining({ e: "key", key: "Enter", on: "검색" }),
      expect.objectContaining({ e: "cmd", cmd: "list_customers", ok: true, n: 2, ms: 12, args: "search=hangul:3" }),
      expect.objectContaining({ e: "cmd", ok: false, code: "VALIDATION", err: "금액은 #보다 커야 합니다." }),
    ]));
  });

  it("같은 곳을 빠르게 세 번 누르면 따로 표시한다", async () => {
    html(`<button id="b">저장</button>`);
    const b = document.getElementById("b")!;
    b.click();
    b.click();
    b.click();
    const events = await recorded();
    expect(events.filter((e) => e.e === "click")).toHaveLength(3);
    expect(events.filter((e) => e.e === "click.rapid")).toEqual([
      expect.objectContaining({ label: "저장" }),
    ]);
  });

  it("기록을 보내지 못해도 오류를 내지 않는다", async () => {
    invoke.mockRejectedValue(new Error("no"));
    html(`<button id="b">저장</button>`);
    document.getElementById("b")!.click();
    await expect(flushUsage()).resolves.toBeUndefined();
  });
});
