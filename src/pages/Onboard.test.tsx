import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, mockFn, hoisted, mockModule } from "@/test/api";

import Onboard from "./Onboard";

const mocks = hoisted(() => ({
  navigate: mockFn(),
  toast: mockFn(),
  mutateAsync: mockFn(),
  generatePersonaKeypair: mockFn(),
  createPersonaSigner: mockFn(),
  uploadFileToBlossom: mockFn(),
  inferenceMutateAsync: mockFn(),
  availability: { status: "idle" } as { status: "idle" } | { status: "taken"; username: string },
}));

mockModule("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
}));

mockModule("@/components/AppHeader", () => ({
  AppHeader: () => <header />,
}));

mockModule("@/components/ImigongoBand", () => ({
  FlagStripe: () => <div />,
  ImigongoSeal: () => <div />,
}));

mockModule("@/components/PersonaPictureStager", () => ({
  PersonaPictureStager: () => <div data-testid="picture-stager" />,
}));

mockModule("@/hooks/useToast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

mockModule("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    user: {
      pubkey: "operator-pubkey",
      signer: { signEvent: mockFn() },
    },
  }),
}));

mockModule("@/hooks/useCreatePersona", () => ({
  useCreatePersona: () => ({
    isPending: false,
    mutateAsync: mocks.mutateAsync,
  }),
}));

mockModule("@/hooks/useUsernameAvailability", () => ({
  useUsernameAvailability: () => mocks.availability,
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

mockModule("@/lib/personaKey", () => ({
  generatePersonaKeypair: mocks.generatePersonaKeypair,
}));

mockModule("@/lib/personaSigner", () => ({
  createPersonaSigner: mocks.createPersonaSigner,
}));

mockModule("@/lib/blossomUpload", () => ({
  uploadFileToBlossom: mocks.uploadFileToBlossom,
  urlFromUploadTags: mockFn(),
}));

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

describe("Onboard", () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.toast.mockReset();
    mocks.inferenceMutateAsync.mockReset();
    mocks.generatePersonaKeypair.mockReset().mockReturnValue({
      nsec: "nsec1persona",
      npub: "npub1persona",
      hex: {
        pk: "a".repeat(64),
        sk: "b".repeat(64),
      },
    });
    mocks.createPersonaSigner.mockReset();
    mocks.uploadFileToBlossom.mockReset();
    mocks.availability = { status: "idle" };
    mocks.mutateAsync.mockReset().mockResolvedValue({
      npub: "npub1persona",
      envelope: {
        persona: {
          name: "Voice of Rwanda",
        },
      },
    });
  });

  it("starts identity fields blank and derives handles from the display name", () => {
    render(<Onboard />);

    const name = screen.getByLabelText(/display name/i) as HTMLInputElement;
    const username = screen.getByLabelText(/^username$/i) as HTMLInputElement;
    const lightning = screen.getByLabelText(/lightning address/i) as HTMLInputElement;

    expect(name.value).toBe("");
    expect(username.value).toBe("");
    expect(lightning.value).toBe("");

    fireEvent.change(name, { target: { value: "Voice of Rwanda" } });

    expect(username.value).toBe("voice-of-rwanda");
    expect(lightning.value).toBe("voice-of-rwanda");
  });

  it("does not generate the persona keypair until Create is clicked", async () => {
    render(<Onboard />);

    expect(mocks.generatePersonaKeypair).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: "Voice of Rwanda" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next: profile picture/i }));

    expect(mocks.generatePersonaKeypair).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /create persona/i }));
    });

    expect(mocks.generatePersonaKeypair).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(mocks.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          keypair: expect.objectContaining({ nsec: "nsec1persona" }),
          username: "voice-of-rwanda",
          lightningUsername: "voice-of-rwanda",
          pictureUrl: undefined,
        }),
      ),
    );
  });

  it("shows direct copy when the Lightning address is taken", () => {
    mocks.availability = {
      status: "taken",
      username: "voice-of-rwanda",
    };

    render(<Onboard />);

    expect(screen.getByText("voice-of-rwanda@breez.tips")).toBeInTheDocument();
    expect(screen.getByText(/already taken\. Try another handle\./i)).toBeInTheDocument();
    expect(screen.queryByText(/before creating the persona/i)).not.toBeInTheDocument();
  });

  it("does not show a separate skip button on the picture step", () => {
    render(<Onboard />);

    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: "Voice of Rwanda" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next: profile picture/i }));

    expect(screen.getByRole("button", { name: /create persona/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /skip/i })).not.toBeInTheDocument();
  });

  it("shows AI Assist controls for Bio and System prompt", () => {
    render(<Onboard />);

    expect(screen.getAllByRole("button", { name: /ai assist/i })).toHaveLength(2);
  });

  it("uses AI Assist to replace only the bio field", async () => {
    mocks.inferenceMutateAsync.mockResolvedValue(
      ppqResponse("A sharper generated bio."),
    );
    render(<Onboard />);
    const bio = screen.getByLabelText(/bio \(public/i) as HTMLTextAreaElement;
    const systemPrompt = screen.getByLabelText(
      /system prompt/i,
    ) as HTMLTextAreaElement;
    const originalSystemPrompt = systemPrompt.value;

    fireEvent.click(screen.getAllByRole("button", { name: /ai assist/i })[0]);
    fireEvent.change(screen.getByLabelText(/instructions/i), {
      target: { value: "Rewrite the public bio." },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    expect(await screen.findByText("A sharper generated bio.")).toBeInTheDocument();
    expect(bio.value).not.toBe("A sharper generated bio.");

    fireEvent.click(screen.getByRole("button", { name: /replace field/i }));

    expect(bio.value).toBe("A sharper generated bio.");
    expect(systemPrompt.value).toBe(originalSystemPrompt);
  });

  it("uses AI Assist to replace only the system prompt field", async () => {
    mocks.inferenceMutateAsync.mockResolvedValue(
      ppqResponse("Generated private system prompt."),
    );
    render(<Onboard />);
    const bio = screen.getByLabelText(/bio \(public/i) as HTMLTextAreaElement;
    const systemPrompt = screen.getByLabelText(
      /system prompt/i,
    ) as HTMLTextAreaElement;
    const originalBio = bio.value;

    fireEvent.click(screen.getAllByRole("button", { name: /ai assist/i })[1]);
    fireEvent.change(screen.getByLabelText(/instructions/i), {
      target: { value: "Rewrite the private prompt." },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    expect(
      await screen.findByText("Generated private system prompt."),
    ).toBeInTheDocument();
    expect(systemPrompt.value).not.toBe("Generated private system prompt.");

    fireEvent.click(screen.getByRole("button", { name: /replace field/i }));

    expect(systemPrompt.value).toBe("Generated private system prompt.");
    expect(bio.value).toBe(originalBio);
  });
});
