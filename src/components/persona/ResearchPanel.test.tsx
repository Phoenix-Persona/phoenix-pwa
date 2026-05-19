import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  beforeEach,
  describe,
  expect,
  it,
  mockFn,
  hoisted,
  mockModule,
} from "@/test/api";

import { ResearchPanel } from "./ResearchPanel";

const mocks = hoisted(() => ({
  mutateAsync: mockFn(),
}));

mockModule("@/hooks/useResearchSearch", () => ({
  useResearchSearch: () => ({
    mutateAsync: mocks.mutateAsync,
    isPending: false,
  }),
}));

mockModule("@/hooks/useToast", () => ({
  useToast: () => ({ toast: mockFn() }),
}));

describe("ResearchPanel", () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset().mockResolvedValue([]);
  });

  it("routes bare topic searches to web search instead of X user lookup", async () => {
    render(
      <ResearchPanel
        open
        onOpenChange={mockFn()}
        onAddSource={mockFn()}
        onQuoteIntoIdea={mockFn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/@handle/i), {
      target: { value: "Rwanda" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));

    await waitFor(() =>
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        source: "web",
        query: "Rwanda",
      }),
    );
  });

  it("routes explicit @handle searches to X user lookup", async () => {
    render(
      <ResearchPanel
        open
        onOpenChange={mockFn()}
        onAddSource={mockFn()}
        onQuoteIntoIdea={mockFn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/@handle/i), {
      target: { value: "@ChroniclesRW" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));

    await waitFor(() =>
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        source: "x-user",
        handle: "ChroniclesRW",
      }),
    );
  });
});
