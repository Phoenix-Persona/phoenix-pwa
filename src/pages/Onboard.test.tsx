import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Onboard from "./Onboard";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  toast: vi.fn(),
  mutateAsync: vi.fn(),
  generatePersonaKeypair: vi.fn(),
  createPersonaSigner: vi.fn(),
  uploadFileToBlossom: vi.fn(),
}));

vi.mock("@unhead/react", () => ({
  useSeoMeta: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/components/AppHeader", () => ({
  AppHeader: () => <header />,
}));

vi.mock("@/components/ImigongoBand", () => ({
  FlagStripe: () => <div />,
  ImigongoSeal: () => <div />,
}));

vi.mock("@/components/PersonaPictureStager", () => ({
  PersonaPictureStager: () => <div data-testid="picture-stager" />,
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    user: {
      pubkey: "operator-pubkey",
      signer: { signEvent: vi.fn() },
    },
  }),
}));

vi.mock("@/hooks/useCreatePersona", () => ({
  useCreatePersona: () => ({
    isPending: false,
    mutateAsync: mocks.mutateAsync,
  }),
}));

vi.mock("@/hooks/useUsernameAvailability", () => ({
  useUsernameAvailability: () => ({ status: "idle" }),
}));

vi.mock("@/lib/personaKey", () => ({
  generatePersonaKeypair: mocks.generatePersonaKeypair,
}));

vi.mock("@/lib/personaSigner", () => ({
  createPersonaSigner: mocks.createPersonaSigner,
}));

vi.mock("@/lib/blossomUpload", () => ({
  uploadFileToBlossom: mocks.uploadFileToBlossom,
  urlFromUploadTags: vi.fn(),
}));

describe("Onboard", () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.toast.mockReset();
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
    mocks.mutateAsync.mockReset().mockResolvedValue({
      npub: "npub1persona",
      envelope: {
        persona: {
          name: "Voice of Rwanda",
        },
      },
    });
  });

  it("does not generate the persona keypair until Create is clicked", async () => {
    render(<Onboard />);

    expect(mocks.generatePersonaKeypair).not.toHaveBeenCalled();

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
          pictureUrl: undefined,
        }),
      ),
    );
  });
});
