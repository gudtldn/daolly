import { describe, it, expect, vi } from "vitest";
import { screen, render } from "@testing-library/react";
import { CustomerFormCard } from "../CustomerFormCard";
import type { Customer } from "@/types";

describe("CustomerFormCard", () => {
  const mockOnSave = vi.fn();
  const mockOnClose = vi.fn();

  const mockCustomer: Customer = {
    id: 1,
    name: "홍길동",
    phoneNumber: "010-1234-5678",
    note: "메모테스트",
    createdAt: "2024-01-01T00:00:00Z",
    lastModifiedAt: "2024-01-01T00:00:00Z",
  };

  it("create 모드일 때 입력 필드가 비어있어야 한다", () => {
    render(
      <CustomerFormCard
        open={true}
        mode="create"
        customer={null}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByLabelText(/^이름/)).toHaveValue("");
    expect(screen.getByLabelText(/전화번호/)).toHaveValue("");
    expect(screen.getByLabelText(/메모/)).toHaveValue("");
  });

  it("create 모드에서 검색어가 포함된 dummy customer 객체가 전달되면 필드가 자동 완성되어야 한다", () => {
    const dummyCustomer: Customer = {
      id: 0,
      name: "이순신",
      phoneNumber: "01011112222", // 포맷팅되지 않은 번호
      note: null,
      createdAt: "",
      lastModifiedAt: "",
    };

    render(
      <CustomerFormCard
        open={true}
        mode="create"
        customer={dummyCustomer}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByLabelText(/^이름/)).toHaveValue("이순신");
    // 초기 렌더링 시 formatPhone이 적용되어야 함
    expect(screen.getByLabelText(/전화번호/)).toHaveValue("010-1111-2222");
  });

  it("edit 모드일 때 전달된 고객 정보가 입력되어 있어야 한다", () => {
    render(
      <CustomerFormCard
        open={true}
        mode="edit"
        customer={mockCustomer}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByLabelText(/이름/)).toHaveValue("홍길동");
    expect(screen.getByLabelText(/전화번호/)).toHaveValue("010-1234-5678");
    expect(screen.getByLabelText(/메모/)).toHaveValue("메모테스트");
  });

  it("create 모드에서 customer 객체가 전달되더라도 (버그 상황), 외부에서 null로 처리하면 비어있어야 한다", () => {
    // CustomersPage.tsx에서 수정한 로직: cardMode === "edit" ? selectedCustomer : null
    render(
      <CustomerFormCard
        open={true}
        mode="create"
        customer={null} // 수정된 로직에 따라 null 전달
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByLabelText(/^이름/)).toHaveValue("");
    expect(screen.getByLabelText(/전화번호/)).toHaveValue("");
    expect(screen.getByLabelText(/메모/)).toHaveValue("");
  });
});
