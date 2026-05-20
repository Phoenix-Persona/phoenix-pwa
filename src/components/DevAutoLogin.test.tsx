import { render, waitFor } from "@testing-library/react";
import { nip19 } from "nostr-tools";
import { generateSecretKey } from "nostr-tools/pure";
import { beforeEach, describe, expect, it, mockFn, hoisted, mockModule } from "@/test/api";

import { DevAutoLogin } from "./DevAutoLogin";

const mocks = hoisted(() => ({
  currentUser: undefined as { id: string; pubkey: string; metadata: Record<string, never> } | undefined,
  nsec: mockFn(),
  readEnv: mockFn(),
}));

mockModule("@/hooks/useLoggedInAccounts", () => ({
  useLoggedInAccounts: () => ({
    authors: [],
    currentUser: mocks.currentUser,
  }),
}));

mockModule("@/hooks/useLoginActions", () => ({
  useLoginActions: () => ({
    nsec: mocks.nsec,
  }),
}));

mockModule("@/lib/env", () => ({
  readEnv: mocks.readEnv,
}));

describe("DevAutoLogin", () => {
  beforeEach(() => {
    mocks.currentUser = undefined;
    mocks.nsec.mockReset();
    mocks.readEnv.mockReset().mockReturnValue(nip19.nsecEncode(generateSecretKey()));
  });

  it("does not auto-login when a login already exists but author metadata is still loading", async () => {
    mocks.currentUser = {
      id: "current-login",
      pubkey: "operator-pubkey",
      metadata: {},
    };

    render(<DevAutoLogin />);

    await waitFor(() => expect(mocks.nsec).not.toHaveBeenCalled());
  });
});
