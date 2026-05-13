import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, mockFn, hoisted, mockModule } from "@/test/api";

import { EditPersonaSystemPromptField } from "./EditPersonaSystemPromptField";

const mocks = hoisted(() => ({
  inferenceMutateAsync: mockFn(),
}));

mockModule("@/hooks/usePpqInference", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/usePpqInference")>();
  return {
    ...actual,
    usePpqInference: () => ({
      mutateAsync: mocks.inferenceMutateAsync,
      isPending: false,
    }),
  };
});

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

describe("EditPersonaSystemPromptField", () => {
  beforeEach(() => {
    mocks.inferenceMutateAsync.mockReset();
  });

  it("uses AI Assist to replace the private system prompt", async () => {
    const onSystemPromptChange = mockFn();
    mocks.inferenceMutateAsync.mockResolvedValue(
      ppqResponse("Generated private prompt."),
    );

    render(
      <EditPersonaSystemPromptField
        name="Voice"
        username="voice"
        lightningUsername="voice"
        bio="Public bio"
        systemPrompt="Current private prompt"
        onSystemPromptChange={onSystemPromptChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /ai assist/i }));
    fireEvent.change(screen.getByLabelText(/instructions/i), {
      target: { value: "Tighten the private prompt." },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() =>
      expect(mocks.inferenceMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining("Field: System prompt"),
            }),
            expect.objectContaining({
              content: expect.stringContaining("Current private prompt"),
            }),
            expect.objectContaining({
              content: expect.stringContaining("Public bio"),
            }),
          ]),
        }),
      ),
    );

    expect(
      await screen.findByText("Generated private prompt."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /replace field/i }));

    expect(onSystemPromptChange).toHaveBeenCalledWith(
      "Generated private prompt.",
    );
  });
});
