import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EditPersonaPublicProfileFields } from "./EditPersonaPublicProfileFields";

const mocks = vi.hoisted(() => ({
  inferenceMutateAsync: vi.fn(),
}));

vi.mock("@/components/PersonaPictureField", () => ({
  PersonaPictureField: () => <div data-testid="persona-picture-field" />,
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

describe("EditPersonaPublicProfileFields", () => {
  beforeEach(() => {
    mocks.inferenceMutateAsync.mockReset();
  });

  it("uses AI Assist to replace the public bio", async () => {
    const onBioChange = vi.fn();
    mocks.inferenceMutateAsync.mockResolvedValue(ppqResponse("Generated bio."));

    render(
      <EditPersonaPublicProfileFields
        bio="Current bio"
        pictureUrl=""
        name="Voice"
        username="voice"
        lightningUsername="voice"
        systemPrompt="Private prompt"
        loadingBio={false}
        onBioChange={onBioChange}
        onPictureUrlChange={vi.fn()}
        pictureSigner={{} as never}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /ai assist/i }));
    fireEvent.change(screen.getByLabelText(/instructions/i), {
      target: { value: "Make the bio sharper." },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() =>
      expect(mocks.inferenceMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining("Field: Bio"),
            }),
            expect.objectContaining({
              content: expect.stringContaining("Current bio"),
            }),
            expect.objectContaining({
              content: expect.stringContaining("Private prompt"),
            }),
          ]),
        }),
      ),
    );

    expect(await screen.findByText("Generated bio.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /replace field/i }));

    expect(onBioChange).toHaveBeenCalledWith("Generated bio.");
  });
});
