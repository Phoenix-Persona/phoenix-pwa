import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "@/test/api";
import { generateSecretKey, nip19 } from "nostr-tools";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLoginActions } from "@/hooks/useLoginActions";

import { testKeys } from "./fixtures/nostr";
import { createRelayHarness, type RelayHarness } from "./harness/renderWithRelay";

const harnesses: RelayHarness[] = [];

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
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
      <output data-testid="current-user">{user?.pubkey ?? "none"}</output>
    </>
  );
}
