import { render, type RenderOptions } from "@testing-library/react";
import { MemoryRouter, type MemoryRouterProps } from "react-router";
import type { ReactElement } from "react";

interface RouterRenderOptions extends RenderOptions {
  initialEntries?: MemoryRouterProps["initialEntries"];
}

export function renderWithRouter(
  ui: ReactElement,
  { initialEntries = ["/"], ...options }: RouterRenderOptions = {},
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>,
    options,
  );
}
