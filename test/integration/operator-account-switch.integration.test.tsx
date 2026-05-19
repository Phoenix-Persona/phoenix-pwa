import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "@/test/api";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLoginActions } from "@/hooks/useLoginActions";
import { usePpqAccount } from "@/hooks/usePpqAccount";

import {
  loginFor,
  operatorEnvelopeEvent,
  testKeys,
} from "./fixtures/nostr";
import { renderWithRelay, type RelayHarness } from "./harness/renderWithRelay";

const harnesses: RelayHarness[] = [];

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
});

describe("operator PPQ login replacement", () => {
  it("does not render the previous operator PPQ credentials after login replacement", async () => {
    const consoleErrors: string[] = [];
    const consoleError = spyOn(console, "error").mockImplementation((...args) => {
      consoleErrors.push(args.map(String).join(" "));
    });
    try {
      const first = await operatorEnvelopeEvent({
        operator: testKeys.operator,
        dTag: "operator-one",
        ppq: { api_key: "api-first", credit_id: "credit-first" },
        createdAt: 1_700_000_000,
      });
      const second = await operatorEnvelopeEvent({
        operator: testKeys.operatorAlt,
        dTag: "operator-two",
        ppq: { api_key: "api-second", credit_id: "credit-second" },
        createdAt: 1_700_000_001,
      });
      const observations: Array<{ pubkey: string | null; apiKey: string | null }> = [];
      const harness = await renderWithRelay(
        <PpqSwitchProbe
          observations={observations}
        />,
        {
          events: [first.event, second.event],
          logins: [loginFor(testKeys.operator)],
        },
      );
      if (!harness) throw new Error("renderWithRelay did not return a harness");
      harnesses.push(harness);

      await waitFor(() =>
        expect(screen.getByTestId("ppq-account").textContent).toBe("api-first"),
      );
      consoleErrors.length = 0;

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Log in second operator" }));
      });

      await waitFor(() =>
        expect(screen.getByTestId("current-user").textContent).toBe(
          testKeys.operatorAlt.pubkey,
        ),
      );
      expect(screen.getByTestId("ppq-account").textContent).not.toBe("api-first");
      await waitFor(() =>
        expect(screen.getByTestId("ppq-account").textContent).toBe("api-second"),
      );
      expect(observations).not.toContainEqual({
        pubkey: testKeys.operatorAlt.pubkey,
        apiKey: "api-first",
      });
      expect(
        consoleErrors.filter(
          (message) =>
            message.includes("not wrapped in act") ||
            message.includes("not configured to support act"),
        ),
      ).toEqual([]);
    } finally {
      consoleError.mockRestore();
    }
  });
});

function PpqSwitchProbe({
  observations,
}: {
  observations: Array<{ pubkey: string | null; apiKey: string | null }>;
}) {
  const login = useLoginActions();
  const { user } = useCurrentUser();
  const { account } = usePpqAccount();
  const loginAsAlt = () => void login.nsec(testKeys.operatorAlt.nsec);
  observations.push({
    pubkey: user?.pubkey ?? null,
    apiKey: account?.api_key ?? null,
  });

  return (
    <>
      <button
        type="button"
        onClick={loginAsAlt}
      >
        Log in second operator
      </button>
      <output data-testid="current-user">{user?.pubkey ?? "none"}</output>
      <output data-testid="ppq-account">{account?.api_key ?? "none"}</output>
    </>
  );
}
