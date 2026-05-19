import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "@/test/api";
import { generateSecretKey, nip19 } from "nostr-tools";

import AuthDialog from "@/components/auth/AuthDialog";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLoginActions } from "@/hooks/useLoginActions";
import {
  clearUserNcryptsec,
  encryptNsec,
  hasUserNcryptsec,
  storeUserNcryptsec,
} from "@/lib/nip49Storage";

import { testKeys } from "./fixtures/nostr";
import { createRelayHarness, type RelayHarness } from "./harness/renderWithRelay";

const harnesses: RelayHarness[] = [];

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  clearUserNcryptsec();
});

afterEach(async () => {
  cleanup();
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
});

describe("auth flow integration", () => {
  it("creates a new operator account and makes it the active login", async () => {
    const harness = await createRelayHarness();
    harnesses.push(harness);

    render(<LoginActionsProbe />, { wrapper: harness.wrapper });
    await screen.findByTestId("current-user");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    });

    await waitFor(() =>
      expect(screen.getByTestId("current-user").textContent).not.toBe("none"),
    );
  });

  it("logs in with an existing nsec and makes that account active", async () => {
    const harness = await createRelayHarness();
    harnesses.push(harness);

    render(<LoginActionsProbe />, { wrapper: harness.wrapper });
    await screen.findByTestId("current-user");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Log in existing" }));
    });

    await waitFor(() =>
      expect(screen.getByTestId("current-user").textContent).toBe(
        testKeys.operator.pubkey,
      ),
    );
  });

  it("logs in with the saved local account and preserves its backup after logout", async () => {
    const passphrase = "correct horse battery staple";
    storeUserNcryptsec(encryptNsec(testKeys.operator.sk, passphrase, 8));
    const harness = await createRelayHarness();
    harnesses.push(harness);

    render(
      <>
        <SavedAccountDialogProbe />
        <LoginActionsProbe />
      </>,
      { wrapper: harness.wrapper },
    );

    await screen.findByTestId("current-user");
    fireEvent.click(await screen.findByRole("button", { name: /i already have an account/i }));
    fireEvent.click(await screen.findByRole("button", { name: /log in with saved account/i }));
    fireEvent.change(screen.getByLabelText(/^passphrase$/i), {
      target: { value: passphrase },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));
    });

    await waitFor(() =>
      expect(screen.getByTestId("current-user").textContent).toBe(
        testKeys.operator.pubkey,
      ),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    });

    await waitFor(() =>
      expect(screen.getByTestId("current-user").textContent).toBe("none"),
    );
    expect(hasUserNcryptsec()).toBe(true);
  });
});

function LoginActionsProbe() {
  const login = useLoginActions();
  const { user } = useCurrentUser();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          const nsec = nip19.nsecEncode(generateSecretKey());
          login.nsec(nsec);
        }}
      >
        Create account
      </button>
      <button type="button" onClick={() => login.nsec(testKeys.operator.nsec)}>
        Log in existing
      </button>
      <button type="button" onClick={() => void login.logout()}>
        Log out
      </button>
      <output data-testid="current-user">{user?.pubkey ?? "none"}</output>
    </>
  );
}

function SavedAccountDialogProbe() {
  const [open, setOpen] = useState(true);
  return <AuthDialog isOpen={open} onClose={() => setOpen(false)} />;
}
