import { fireEvent, render, screen } from "@testing-library/react";
import { generateSecretKey, nip19 } from "nostr-tools";
import { beforeEach, describe, expect, it, mockFn, hoisted, mockModule } from "@/test/api";

import AuthDialog from "./AuthDialog";

const mocks = hoisted(() => ({
  nsec: mockFn(),
  decryptNcryptsec: mockFn(() => generateSecretKey()),
  hasUserNcryptsec: mockFn(() => false),
  loadUserNcryptsec: mockFn(() => "ncryptsec1stored"),
  markSessionUnlocked: mockFn(),
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

mockModule("@/lib/nip49Storage", () => ({
  decryptNcryptsec: mocks.decryptNcryptsec,
  encryptNsec: mockFn(() => "ncryptsec1encrypted"),
  hasUserNcryptsec: mocks.hasUserNcryptsec,
  loadUserNcryptsec: mocks.loadUserNcryptsec,
  markSessionUnlocked: mocks.markSessionUnlocked,
  storeUserNcryptsec: mockFn(),
}));

describe("AuthDialog", () => {
  beforeEach(() => {
    mocks.nsec.mockReset();
    mocks.decryptNcryptsec.mockReset().mockReturnValue(generateSecretKey());
    mocks.hasUserNcryptsec.mockReset().mockReturnValue(false);
    mocks.loadUserNcryptsec.mockReset().mockReturnValue("ncryptsec1stored");
    mocks.markSessionUnlocked.mockReset();
  });

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

  it("offers the stored local account as a normal login option", () => {
    mocks.hasUserNcryptsec.mockReturnValue(true);
    render(<AuthDialog isOpen onClose={mockFn()} />);

    fireEvent.click(screen.getByRole("button", { name: /i already have an account/i }));

    expect(
      screen.getByRole("button", { name: /log in with saved account/i }),
    ).toBeInTheDocument();
  });
});
