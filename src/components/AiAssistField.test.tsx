import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AiAssistButton } from "./AiAssistField";

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

function renderAiAssist(onReplace = vi.fn()) {
  render(
    <AiAssistButton
      fieldLabel="Bio"
      fieldPurpose="A short public profile bio for the persona."
      currentValue="Original bio"
      surroundingContext={[
        "Display name: Voice of Rwanda",
        "Username: voice-of-rwanda",
      ]}
      defaultInstruction="Draft a concise public bio."
      onReplace={onReplace}
    />,
  );
  return { onReplace };
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

describe("AiAssistButton", () => {
  beforeEach(() => {
    mocks.inferenceMutateAsync.mockReset();
  });

  it("opens with an empty instructions field", () => {
    renderAiAssist();

    fireEvent.click(screen.getByRole("button", { name: /ai assist/i }));

    expect(screen.getByLabelText(/instructions/i)).toHaveValue("");
  });

  it("does not render a redundant cancel button", () => {
    renderAiAssist();

    fireEvent.click(screen.getByRole("button", { name: /ai assist/i }));

    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("sends field context and previews the generated replacement before applying it", async () => {
    mocks.inferenceMutateAsync.mockResolvedValue(
      ppqResponse("Generated public bio"),
    );
    const { onReplace } = renderAiAssist();

    fireEvent.click(screen.getByRole("button", { name: /ai assist/i }));
    fireEvent.change(screen.getByLabelText(/instructions/i), {
      target: { value: "Make it sharper and more specific." },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() =>
      expect(mocks.inferenceMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.5,
          max_tokens: 700,
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: "system",
              content: expect.stringContaining(
                "Return only the replacement field text.",
              ),
            }),
            expect.objectContaining({
              role: "user",
              content: expect.stringContaining("Field: Bio"),
            }),
          ]),
        }),
      ),
    );
    expect(mocks.inferenceMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining("Original bio"),
          }),
          expect.objectContaining({
            content: expect.stringContaining("Display name: Voice of Rwanda"),
          }),
          expect.objectContaining({
            content: expect.stringContaining("Make it sharper"),
          }),
        ]),
      }),
    );
    expect(await screen.findByText("Generated public bio")).toBeInTheDocument();
    expect(onReplace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /replace field/i }));

    expect(onReplace).toHaveBeenCalledWith("Generated public bio");
  });

  it("discards the preview when canceled", async () => {
    mocks.inferenceMutateAsync.mockResolvedValue(
      ppqResponse("Generated public bio"),
    );
    const { onReplace } = renderAiAssist();

    fireEvent.click(screen.getByRole("button", { name: /ai assist/i }));
    fireEvent.change(screen.getByLabelText(/instructions/i), {
      target: { value: "Draft a concise public bio." },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    expect(await screen.findByText("Generated public bio")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(onReplace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /ai assist/i }));

    expect(screen.queryByText("Generated public bio")).not.toBeInTheDocument();
  });

  it("shows an error when the model returns an empty response", async () => {
    mocks.inferenceMutateAsync.mockResolvedValue(ppqResponse(""));
    renderAiAssist();

    fireEvent.click(screen.getByRole("button", { name: /ai assist/i }));
    fireEvent.change(screen.getByLabelText(/instructions/i), {
      target: { value: "Draft a concise public bio." },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    expect(
      await screen.findByText(/model response was empty/i),
    ).toBeInTheDocument();
  });
});
