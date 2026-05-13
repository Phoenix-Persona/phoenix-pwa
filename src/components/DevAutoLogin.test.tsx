import { render, waitFor } from "@testing-library/react";
import { nip19 } from "nostr-tools";
import { generateSecretKey } from "nostr-tools/pure";
import { beforeEach, describe, expect, it, vi } from "@/test/api";

import { DevAutoLogin } from "./DevAutoLogin";

const mocks = vi.hoisted(() => ({
  currentUser: undefined as { id: string; pubkey: string; metadata: Record<string, never> } | undefined,
  nsec: vi.fn(),
  readEnv: vi.fn(),
}));

vi.mock("@/hooks/useLoggedInAccounts", () => ({
  useLoggedInAccounts: () => ({
    authors: [],
    currentUser: mocks.currentUser,
  }),
}));

vi.mock("@/hooks/useLoginActions", () => ({
  useLoginActions: () => ({
    nsec: mocks.nsec,
  }),
}));

vi.mock("@/lib/env", () => ({
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
