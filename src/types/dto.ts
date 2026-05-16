// Tauri 커맨드 입력 DTO 타입

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

export interface CreateWorkItem {
  customerId: number;
  /** None이면 details에서 자동 생성 */
  description?: string | null;
  price: number;
  note?: string | null;
  receivedAt?: string | null;
  details: DetailInput[];
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
