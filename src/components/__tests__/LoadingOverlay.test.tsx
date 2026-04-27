import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadingOverlay } from "../LoadingOverlay";

describe("LoadingOverlay", () => {
  it("should not render when isLoading is false", () => {
    const { container } = render(<LoadingOverlay isLoading={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("should render with default message when isLoading is true", () => {
    render(<LoadingOverlay isLoading={true} />);
    expect(screen.getByText("데이터를 불러오는 중...")).toBeDefined();
  });

  it("should render with custom message", () => {
    const customMessage = "잠시만 기다려주세요";
    render(<LoadingOverlay isLoading={true} message={customMessage} />);
    expect(screen.getByText(customMessage)).toBeDefined();
  });

  it("should have absolute class by default", () => {
    const { container } = render(<LoadingOverlay isLoading={true} />);
    const overlay = container.firstChild as HTMLElement;
    expect(overlay.className).toContain("absolute");
  });

  it("should have fixed class when absolute is false", () => {
    const { container } = render(<LoadingOverlay isLoading={true} absolute={false} />);
    const overlay = container.firstChild as HTMLElement;
    expect(overlay.className).toContain("fixed");
  });
});
