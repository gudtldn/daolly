import { invoke, type InvokeArgs } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { isAppError } from "@/utils/errors";

/**
 * 사용 기록
 *
 * 프로그램을 어떻게 쓰는지(화면 이동, 누른 버튼, 단축키, 명령 처리 시간과 실패, 확인 창 응답)를
 * 이 컴퓨터의 로그 폴더(usage/)에만 남깁니다. 개발자가 한동안 손을 못 대도 나중에 어디가
 * 불편했는지 찾아 고치기 위함입니다. (Rust `usage.rs`가 날짜별 파일로 저장·압축)
 *
 * 고객 이름·전화번호·금액·입력한 글자가 섞이지 않도록:
 * - 입력칸의 값은 읽지 않습니다. (어느 칸인지만)
 * - 글자는 버튼·링크·탭에서만 읽고, 숫자는 #으로 바꿉니다. 목록 행 같은 나머지는 종류만 남깁니다.
 * - 고객 정보를 글자로 보여 주는 버튼에는 data-track="이름"을 달아 그 이름만 남깁니다.
 * - 명령 인자는 값 대신 종류와 길이만 남깁니다. (예: search=digits:4)
 */

type Prop = string | number | boolean | null | undefined;
export type UsageProps = Record<string, Prop>;

// Tauri 환경 여부 확인 (테스트/브라우저에서는 기록하지 않음)
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_SIZE = 50;
const IDLE_AFTER_MS = 5 * 60_000;
const RAPID_CLICK_MS = 700;
const RAPID_CLICK_COUNT = 3;
const LABEL_MAX = 40;

const INTERACTIVE = [
  "[data-track]", "button", "a", "input", "select", "textarea", "label", "summary",
  '[role="button"]', '[role="tab"]', '[role="option"]', '[role="menuitem"]',
  '[role="checkbox"]', '[role="switch"]', ".cursor-pointer",
].join(", ");
/** 보이는 글자를 이름으로 써도 되는 요소 (목록 행 등은 고객 정보가 들어 있어 제외) */
const TEXT_LABELED = 'button, a, label, summary, [role="button"], [role="tab"], [role="menuitem"]';
const KEYS = new Set(["Enter", "Escape", "Tab", "Delete", "PageUp", "PageDown", "Home", "End"]);

let enabled = false;
const session = Math.random().toString(36).slice(2, 10);
let buffer: Record<string, Prop>[] = [];
let screen = "";
let screenSince = Date.now();
let dialogSince = 0;

/** 현지 시각 (가게 영업 시간대를 보기 쉽도록 시간대 표기 포함) */
function localTime(d = new Date()): string {
  const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, "0");
  const off = -d.getTimezoneOffset();
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}` +
    `${off >= 0 ? "+" : "-"}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
  );
}

/** 공백을 정리하고 숫자(전화번호·금액)를 #으로 바꾼 뒤 길이를 자릅니다. */
export function maskText(text: string, max = LABEL_MAX): string {
  const s = text.replace(/\s+/g, " ").trim().replace(/\d/g, "#");
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** 문자열 값 대신 남길 종류와 길이 */
function shape(value: string): string {
  const v = value.trim();
  if (!v) return "empty";
  if (/^\d+$/.test(v)) return `digits:${v.length}`;
  if (/^[ㄱ-ㅎㅏ-ㅣ\s]+$/.test(v)) return `jamo:${v.length}`;
  if (/^[가-힣\s]+$/.test(v)) return `hangul:${v.length}`;
  return `text:${v.length}`;
}

/** 명령 인자를 값 없이 요약합니다. (예: "search=digits:4,id=num") */
export function describeArgs(args: InvokeArgs | undefined): string | undefined {
  if (!args || typeof args !== "object" || Array.isArray(args) || args instanceof ArrayBuffer) {
    return undefined;
  }
  const parts = Object.entries(args).map(([key, v]) => {
    if (typeof v === "string") return `${key}=${shape(v)}`;
    if (typeof v === "number") return `${key}=num`;
    if (typeof v === "boolean" || v === null || v === undefined) return `${key}=${v}`;
    if (Array.isArray(v)) return `${key}=list:${v.length}`;
    return `${key}=obj`;
  });
  return parts.length ? parts.join(",") : undefined;
}

/** 누른 요소가 무엇인지 (고객 정보 없이) */
export function describeElement(target: Element | null): { kind: string; label?: string } | null {
  const el = target?.closest(INTERACTIVE);
  if (!el) return null;

  const tag = el.tagName.toLowerCase();
  const kind = el.getAttribute("role") ?? (tag === "input" ? `input:${(el as HTMLInputElement).type}` : tag);
  const isField = tag === "input" || tag === "textarea" || tag === "select";
  const label =
    el.getAttribute("data-track") ??
    el.getAttribute("aria-label") ??
    (isField ? el.getAttribute("placeholder") ?? el.getAttribute("name") : null) ??
    el.getAttribute("title") ??
    (el.matches(TEXT_LABELED) ? el.textContent : null);
  const masked = label ? maskText(label) : "";
  return masked ? { kind, label: masked } : { kind };
}

/** 누를 수 없는 곳을 누른 경우: 표 칸이면 그 열 제목만 남깁니다. */
function describeDeadClick(target: Element): UsageProps {
  const cell = target.closest("td, th");
  const table = cell?.closest("table");
  if (cell && table) {
    const index = (cell as HTMLTableCellElement).cellIndex;
    const header = table.querySelector("thead tr")?.children[index]?.textContent;
    return { tag: "td", column: header ? maskText(header) : index };
  }
  return { tag: target.tagName.toLowerCase() };
}

export function track(event: string, props: UsageProps = {}): void {
  if (!enabled) return;
  buffer.push({ t: localTime(), sid: session, screen, e: event, ...props });
  if (buffer.length >= FLUSH_SIZE) void flushUsage();
}

export async function flushUsage(): Promise<void> {
  if (buffer.length === 0) return;
  const events = buffer;
  buffer = [];
  try {
    await invoke("record_usage", { events });
  } catch {
    // 기록하지 못해도 프로그램 사용에는 영향을 주지 않음
  }
}

/** 화면 이동 (직전 화면에 머문 시간 포함) */
export function trackScreen(path: string): void {
  if (path === screen) return;
  const now = Date.now();
  track("screen", {
    from: screen || null,
    to: path,
    stayedSec: screen ? Math.round((now - screenSince) / 1000) : null,
  });
  screen = path;
  screenSince = now;
}

/** 명령(invoke) 처리 시간과 결과 */
export function trackCommand(
  cmd: string,
  args: InvokeArgs | undefined,
  ms: number,
  outcome: { result: unknown } | { error: unknown },
): void {
  if (!enabled) return;
  const props: UsageProps = { cmd, ms: Math.round(ms), args: describeArgs(args) };
  if ("error" in outcome) {
    const e = outcome.error;
    props.ok = false;
    props.code = isAppError(e) ? e.code : undefined;
    props.err = maskText(isAppError(e) ? e.message : e instanceof Error ? e.message : String(e), 120);
  } else {
    props.ok = true;
    if (Array.isArray(outcome.result)) props.n = outcome.result.length;
  }
  track("cmd", props);
}

/** 확인 창이 열리고 닫힘 (제목과 응답, 고민한 시간) */
export function trackDialog(phase: "open" | "close", props: UsageProps): void {
  if (phase === "open") {
    dialogSince = Date.now();
    track("dialog.open", props);
  } else {
    track("dialog.close", { ...props, sec: Math.round((Date.now() - dialogSince) / 100) / 10 });
  }
}

function windowSize(): UsageProps {
  return {
    winW: window.innerWidth,
    winH: window.innerHeight,
    screenW: window.screen?.width,
    screenH: window.screen?.height,
    dpr: window.devicePixelRatio,
  };
}

/** 기록을 시작합니다. (테스트용으로 정리 함수를 돌려줌) */
export function startUsageTracking(): () => void {
  enabled = true;
  void getVersion()
    .catch(() => "unknown")
    .then((version) => track("app.start", { version, ...windowSize() }));

  let lastClick: { el: Element; at: number; count: number } | null = null;
  let lastInputAt = Date.now();
  let idle = false;

  const noteInput = () => {
    const now = Date.now();
    if (idle) {
      idle = false;
      track("app.active", { idleMin: Math.round((now - lastInputAt) / 60_000) });
    }
    lastInputAt = now;
  };

  const onClick = (e: MouseEvent) => {
    noteInput();
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const info = describeElement(target);
    if (!info) {
      track("click.none", describeDeadClick(target));
      return;
    }
    const el = target.closest(INTERACTIVE)!;
    const props: UsageProps = { ...info };
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      props.checked = el.checked;
    }
    if (el.matches(":disabled, [aria-disabled='true']")) props.disabled = true;
    track("click", props);

    // 같은 곳을 빠르게 여러 번 누름 (반응이 없다고 느꼈을 가능성)
    const now = Date.now();
    lastClick = lastClick && lastClick.el === el && now - lastClick.at < RAPID_CLICK_MS
      ? { el, at: now, count: lastClick.count + 1 }
      : { el, at: now, count: 1 };
    if (lastClick.count === RAPID_CLICK_COUNT) track("click.rapid", info);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    noteInput();
    const combo = e.ctrlKey || e.altKey || e.metaKey;
    const isModifierOnly = ["Control", "Alt", "Meta", "Shift"].includes(e.key);
    if (isModifierOnly || !(combo || KEYS.has(e.key) || /^F\d{1,2}$/.test(e.key))) return;
    const key = `${e.ctrlKey ? "Ctrl+" : ""}${e.altKey ? "Alt+" : ""}${e.metaKey ? "Meta+" : ""}${
      e.shiftKey && combo ? "Shift+" : ""
    }${e.key}`;
    const on = describeElement(e.target instanceof Element ? e.target : null);
    track("key", { key, on: on?.label ?? on?.kind ?? null });
  };

  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => track("app.resize", windowSize()), 2_000);
  };
  const onFocus = () => track("app.focus");
  const onBlur = () => track("app.blur");
  const onHide = () => void flushUsage();
  const onVisibility = () => {
    if (document.visibilityState === "hidden") void flushUsage();
  };

  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("resize", onResize);
  window.addEventListener("focus", onFocus);
  window.addEventListener("blur", onBlur);
  window.addEventListener("pagehide", onHide);

  const flushTimer = setInterval(() => {
    // 5분 넘게 아무 입력이 없으면 자리를 비운 것으로 봄 (화면에 머문 시간을 해석할 때 참고)
    if (!idle && Date.now() - lastInputAt > IDLE_AFTER_MS) {
      idle = true;
      track("app.idle");
    }
    void flushUsage();
  }, FLUSH_INTERVAL_MS);

  return () => {
    enabled = false;
    clearInterval(flushTimer);
    clearTimeout(resizeTimer);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("pagehide", onHide);
    buffer = [];
    screen = "";
  };
}

/** 앱 시작 시 한 번 호출합니다. (Tauri 밖에서는 아무것도 하지 않음) */
export function installUsageTracking(): void {
  if (!isTauri) return;
  startUsageTracking();
}
