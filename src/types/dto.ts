// Tauri 커맨드 입력 DTO 타입

import type { PaymentMethod, WorkItemStatus } from "./models";

export interface CreateCustomer {
  name: string;
  phoneNumber?: string | null;
  note?: string | null;
}

export interface UpdateCustomer {
  name: string;
  phoneNumber?: string | null;
  note?: string | null;
}

export interface CreateCategory {
  name: string;
  sortOrder: number;
}

export interface UpdateCategory {
  name: string;
  sortOrder: number;
}

export interface CreatePriceItem {
  categoryId: number;
  name: string;
  defaultPrice: number;
  sortOrder: number;
}

export interface UpdatePriceItem {
  name?: string | null;
  defaultPrice?: number | null;
  sortOrder?: number | null;
}

export interface DetailInput {
  /** 통계용 FK. 직접 입력시 null */
  priceItemId?: number | null;
  itemName: string;
  unitPrice: number;
  quantity: number;
  optionsMemo?: string | null;
}

/** 접수와 함께 받은 결제 */
export interface Prepayment {
  method: PaymentMethod;
  /** 없으면 전액 */
  amount?: number | null;
}

/** 접수 요청: 품목과 선결제를 한 번에 저장하고, 총액은 서버가 품목으로 계산 */
export interface ReceiveOrder {
  /** 같은 접수를 두 번 보내도 한 번만 저장되도록 화면이 만드는 ID */
  requestId: string;
  customerId: number;
  /** 없으면 품목으로 자동 생성 */
  description?: string | null;
  note?: string | null;
  receivedAt?: string | null;
  lines: DetailInput[];
  /** 가격을 직접 정한 경우. 없으면 품목 합계 */
  priceOverride?: number | null;
  /** 없으면 외상 */
  payment?: Prepayment | null;
  /** 처음 상태. 없으면 접수 */
  status?: WorkItemStatus | null;
  /** 상태가 수령일 때의 수령 일시 */
  pickedUpAt?: string | null;
}

export interface UpdateWorkItem {
  description?: string | null;
  price?: number | null;
  note?: string | null;
  receivedAt?: string | null;
  pickedUpAt?: string | null;
}

export interface CreatePayment {
  workItemId: number;
  amount: number;
  method?: string | null;
  paidAt?: string | null;
}

export interface UpdatePayment {
  amount: number;
  method?: string | null;
  paidAt?: string | null;
}
