import { NostrLoginProvider, useNostrLogin } from "@nostrify/react/login";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NLogin } from "@nostrify/react/login";
import { generateSecretKey, nip19 } from "nostr-tools";

import { createMemoryNostrLoginStorage } from "./nostrLoginStorage";

function LoginButton() {
  const { addLogin, logins } = useNostrLogin();
  return (
    <button
      type="button"
      onClick={() => {
        const nsec = nip19.nsecEncode(generateSecretKey());
        addLogin(NLogin.fromNsec(nsec));
      }}
    >
      logins:{logins.length}
    </button>
  );
}

describe("createMemoryNostrLoginStorage", () => {
  it("keeps Nostrify login state out of localStorage", async () => {
    window.localStorage.clear();
    const storage = createMemoryNostrLoginStorage();

    render(
      <NostrLoginProvider storageKey="nostr:login" storage={storage}>
        <LoginButton />
      </NostrLoginProvider>,
    );

    await screen.findByRole("button", { name: "logins:0" });
    fireEvent.click(screen.getByRole("button", { name: "logins:0" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "logins:1" })).toBeInTheDocument(),
    );
    expect(window.localStorage.getItem("nostr:login")).toBeNull();
    expect(await storage.getItem("nostr:login")).toContain('"type":"nsec"');
  });
});
