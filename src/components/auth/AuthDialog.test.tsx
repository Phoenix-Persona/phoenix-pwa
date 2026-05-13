import { fireEvent, render, screen } from "@testing-library/react";
import { generateSecretKey, nip19 } from "nostr-tools";
import { describe, expect, it, vi } from "@/test/api";

import AuthDialog from "./AuthDialog";

const mocks = vi.hoisted(() => ({
  nsec: vi.fn(),
}));

vi.mock("@/hooks/useLoginActions", () => ({
  useLoginActions: () => ({
    nsec: mocks.nsec,
    bunker: vi.fn(),
    extension: vi.fn(),
    nostrconnect: vi.fn(),
    getRelayUrls: () => ["wss://relay.example"],
  }),
  generateNostrConnectParams: () => ({
    clientSecret: "secret",
    clientPubkey: "pubkey",
    relays: ["wss://relay.example"],
  }),
  generateNostrConnectURI: () => "nostrconnect://example",
}));

vi.mock("@/hooks/useNostrPublish", () => ({
  useNostrPublish: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useUploadFile", () => ({
  useUploadFile: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useIsMobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/lib/downloadFile", () => ({
  downloadTextFile: vi.fn(),
}));

describe("AuthDialog", () => {
  it("requires passphrase encryption for pasted nsec logins", () => {
    const nsec = nip19.nsecEncode(generateSecretKey());
    render(<AuthDialog isOpen onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /i already have an account/i }));
    fireEvent.change(screen.getByPlaceholderText(/^nsec1/), {
      target: { value: nsec },
    });
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));

    expect(screen.getByText(/set a passphrase and zuka will encrypt/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /skip.*without encryption/i }),
    ).not.toBeInTheDocument();
    expect(mocks.nsec).not.toHaveBeenCalled();
  });
});
