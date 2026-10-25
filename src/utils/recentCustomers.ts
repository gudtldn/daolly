import { customerApi } from "@/bindings";
import type { Customer } from "@/types";
import { isAppError } from "@/utils/errors";

/**
 * POS의 '최근 선택 고객'
 *
 * 고객 번호와 등록 시각만 저장하고, 보여 줄 때마다 DB에서 다시 불러옵니다.
 * 그래서 삭제한 고객이나 초기화·복원·가져오기로 DB가 바뀌어 없어진 고객(번호만 같은 다른 고객 포함)은
 * 목록에서 빠지고, 이름·전화번호를 고치면 바로 반영됩니다.
 */

const STORAGE_KEY = "pos_recent_customer_ids";
/** 예전 버전이 고객 정보(이름·전화번호 포함)째 저장하던 키 */
const LEGACY_STORAGE_KEY = "pos_recent_customers";
export const RECENT_CUSTOMER_LIMIT = 5;

interface Entry {
  id: number;
  createdAt: string;
}

function isEntry(value: unknown): value is Entry {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Entry).id === "number" &&
    typeof (value as Entry).createdAt === "string"
  );
}

function parseEntries(json: string | null): Entry[] {
  const parsed: unknown = JSON.parse(json ?? "[]");
  return Array.isArray(parsed)
    ? parsed.filter(isEntry).map(({ id, createdAt }) => ({ id, createdAt }))
    : [];
}

function read(): Entry[] {
  try {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy !== null) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      const entries = parseEntries(legacy);
      write(entries);
      return entries;
    }
    return parseEntries(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

function write(entries: Entry[]) {
  try {
    const kept = entries.slice(0, RECENT_CUSTOMER_LIMIT).map(({ id, createdAt }) => ({ id, createdAt }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  } catch {
    // 저장하지 못해도 접수에는 지장 없음
  }
}

/** 같은 순간인지 (업데이트로 시각 저장 형식이 바뀌어도 같은 고객으로 봄) */
function sameInstant(a: string, b: string): boolean {
  if (a === b) return true;
  const time = Date.parse(a);
  return !Number.isNaN(time) && time === Date.parse(b);
}

/** 저장해 둔 고객 중 지금 DB에 그대로 있는 고객만, 최근 순으로 */
export async function loadRecentCustomers(): Promise<Customer[]> {
  const entries = read();
  // 고객 또는 null(없는 고객이라 목록에서 지움), undefined(잠깐의 오류라 이번에만 뺌)
  const found = await Promise.all(
    entries.map(async (entry): Promise<Customer | null | undefined> => {
      try {
        const customer = await customerApi.get(entry.id);
        return sameInstant(customer.createdAt, entry.createdAt) ? customer : null;
      } catch (e) {
        return isAppError(e) && e.code === "NOT_FOUND" ? null : undefined;
      }
    }),
  );
  const kept = entries.filter((_, i) => found[i] !== null);
  if (kept.length !== entries.length) write(kept);
  return found.filter((c): c is Customer => c != null);
}

/** 고객을 맨 앞에 저장하고, 화면에 보여 줄 새 목록을 돌려줍니다. */
export function rememberRecentCustomer(shown: Customer[], customer: Customer): Customer[] {
  write([customer, ...read().filter((e) => e.id !== customer.id)]);
  return [customer, ...shown.filter((c) => c.id !== customer.id)].slice(0, RECENT_CUSTOMER_LIMIT);
}
