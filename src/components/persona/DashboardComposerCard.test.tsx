import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardComposerCard } from "./DashboardComposerCard";
import type { Persona } from "@/lib/persona";

const mocks = vi.hoisted(() => ({
  inferenceMutateAsync: vi.fn(),
}));

vi.mock("@/hooks/usePpqInference", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/usePpqInference")>();
  return {
    ...actual,
    usePpqInference: () => ({
      mutateAsync: mocks.inferenceMutateAsync,
      isPending: false,
    }),
  };
});

vi.mock("@/components/persona/ResearchPanel", () => ({
  ResearchPanel: () => null,
}));

const crossPost: Persona["cross_post"] = undefined;

function renderComposer(overrides: Partial<Parameters<typeof DashboardComposerCard>[0]> = {}) {
  const props: Parameters<typeof DashboardComposerCard>[0] = {
    personaName: "Voice of Rwanda",
    personaBio: "Public persona bio",
    raw: "Original draft",
    sourcesInput: "https://example.com/source",
    hintsInput: "measured, short",
    crossPostEnabled: false,
    crossPost,
    walletSeed: "seed words",
    isPublishing: false,
    isStyling: false,
    onRawChange: vi.fn(),
    onSourcesInputChange: vi.fn(),
    onHintsInputChange: vi.fn(),
    onDiscard: vi.fn(),
    onStyle: vi.fn(),
    onOpenPostWizard: vi.fn(),
    onPost: vi.fn(),
    onOpenVideo: vi.fn(),
    onAppendSource: vi.fn(),
    onAppendIdea: vi.fn(),
    ...overrides,
  };

  render(<DashboardComposerCard {...props} />);
  return props;
}

function ppqResponse(content: string) {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 1,
    model: "test-model",
    choices: [
      {
        index: 0,
        message: { role: "assistant" as const, content },
        finish_reason: "stop",
      },
    ],
  };
}

function visibleButtonNames() {
  return screen
    .getAllByRole("button")
    .map((button) => button.textContent?.replace(/\s+/g, " ").trim() ?? "")
    .filter(Boolean);
}

function openVideoTab() {
  const tab = screen.getByRole("tab", { name: /compose a video/i });
  fireEvent.pointerDown(tab, { button: 0, ctrlKey: false });
  fireEvent.click(tab);
  fireEvent.keyDown(tab, { key: "Enter", code: "Enter" });
}

describe("DashboardComposerCard", () => {
  beforeEach(() => {
    mocks.inferenceMutateAsync.mockReset();
  });

  it("places AI Assist to the left of Style in voice on the post tab", () => {
    renderComposer();

    const names = visibleButtonNames();
    expect(names.indexOf("Post Wizard")).toBeLessThan(
      names.indexOf("AI Assist"),
    );
    expect(names.indexOf("AI Assist")).toBeLessThan(
      names.indexOf("Style in voice"),
    );
  });

  it("uses AI Assist to replace the post idea draft", async () => {
    mocks.inferenceMutateAsync.mockResolvedValue(
      ppqResponse("Generated post draft"),
    );
    const props = renderComposer();

    fireEvent.click(screen.getByRole("button", { name: /ai assist/i }));
    fireEvent.change(screen.getByLabelText(/instructions/i), {
      target: { value: "Draft a sharper post." },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() =>
      expect(mocks.inferenceMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining("Field: Post idea"),
            }),
            expect.objectContaining({
              content: expect.stringContaining("Original draft"),
            }),
            expect.objectContaining({
              content: expect.stringContaining("Sources: https://example.com/source"),
            }),
          ]),
        }),
      ),
    );
    expect(await screen.findByText("Generated post draft")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /replace field/i }));

    expect(props.onRawChange).toHaveBeenCalledWith("Generated post draft");
  });

  it("places AI Assist to the left of Style in voice on the video tab", () => {
    renderComposer();

    openVideoTab();

    const names = visibleButtonNames();
    expect(names.indexOf("Post Wizard")).toBeLessThan(
      names.indexOf("AI Assist"),
    );
    expect(names.indexOf("AI Assist")).toBeLessThan(
      names.indexOf("Style in voice"),
    );
  });

  it("uses AI Assist to replace the video idea draft", async () => {
    mocks.inferenceMutateAsync.mockResolvedValue(
      ppqResponse("Generated video brief"),
    );
    const props = renderComposer();

    openVideoTab();
    fireEvent.click(screen.getByRole("button", { name: /ai assist/i }));
    fireEvent.change(screen.getByLabelText(/instructions/i), {
      target: { value: "Draft a short vertical video brief." },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() =>
      expect(mocks.inferenceMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining("Field: Video idea"),
            }),
            expect.objectContaining({
              content: expect.stringContaining("Style hints: measured, short"),
            }),
          ]),
        }),
      ),
    );
    expect(await screen.findByText("Generated video brief")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /replace field/i }));

    expect(props.onRawChange).toHaveBeenCalledWith("Generated video brief");
  });
});
