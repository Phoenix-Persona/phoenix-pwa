import { fireEvent, render, screen } from "@testing-library/react";
import { generateSecretKey, nip19 } from "nostr-tools";
import { describe, expect, it, mockFn, hoisted, mockModule } from "@/test/api";

import AuthDialog from "./AuthDialog";

const mocks = hoisted(() => ({
  nsec: mockFn(),
}));

mockModule("@/hooks/useLoginActions", () => ({
  useLoginActions: () => ({
    nsec: mocks.nsec,
    bunker: mockFn(),
    extension: mockFn(),
    nostrconnect: mockFn(),
    getRelayUrls: () => ["wss://relay.example"],
  }),
  generateNostrConnectParams: () => ({
    clientSecret: "secret",
    clientPubkey: "pubkey",
    relays: ["wss://relay.example"],
  }),
  generateNostrConnectURI: () => "nostrconnect://example",
}));

mockModule("@/hooks/useNostrPublish", () => ({
  useNostrPublish: () => ({ mutateAsync: mockFn(), isPending: false }),
}));

mockModule("@/hooks/useUploadFile", () => ({
  useUploadFile: () => ({ mutateAsync: mockFn(), isPending: false }),
}));

mockModule("@/hooks/useIsMobile", () => ({
  useIsMobile: () => false,
}));

mockModule("@/lib/downloadFile", () => ({
  downloadTextFile: mockFn(),
}));

describe("AuthDialog", () => {
  it("requires passphrase encryption for pasted nsec logins", () => {
    const nsec = nip19.nsecEncode(generateSecretKey());
    render(<AuthDialog isOpen onClose={mockFn()} />);

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
