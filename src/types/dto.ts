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
  itemName: string;
  unitPrice: number;
  quantity: number;
  optionsMemo?: string | null;
}

export interface CreateWorkItem {
  customerId: number;
  description: string;
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
}
