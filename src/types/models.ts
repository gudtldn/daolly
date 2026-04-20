// Rust Entity Model 1:1 매핑 타입

export interface Customer {
  id: number;
  name: string;
  phoneNumber: string | null;
  note: string | null;
  createdAt: string;
  lastModifiedAt: string;
}

export interface Category {
  id: number;
  name: string;
  sortOrder: number;
}

export interface PriceItem {
  id: number;
  categoryId: number;
  name: string;
  defaultPrice: number;
  sortOrder: number;
}

export type WorkItemStatus = "Received" | "Completed" | "PickedUp";

export interface WorkItem {
  id: number;
  customerId: number;
  status: WorkItemStatus;
  description: string;
  price: number;
  paidAmount: number;
  note: string | null;
  receivedAt: string;
  completedAt: string | null;
  pickedUpAt: string | null;
  createdAt: string;
  lastModifiedAt: string;
}

export interface WorkItemDetail {
  id: number;
  workItemId: number;
  itemName: string;
  unitPrice: number;
  quantity: number;
  optionsMemo: string | null;
}

export interface Payment {
  id: number;
  workItemId: number;
  amount: number;
  method: string | null;
  paidAt: string;
  createdAt: string;
}

// WorkItem + 관계 데이터 합산 DTO
export interface WorkItemFull extends WorkItem {
  details: WorkItemDetail[];
  payments: Payment[];
}
