import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useOperatorWallet } from "./useOperatorWallet";

const mocks = vi.hoisted(() => ({
  useWallet: vi.fn(() => ({ handle: undefined })),
  readEnv: vi.fn(),
  currentUser: { user: { pubkey: "operator-pubkey" } },
  operator: {
    envelope: {
      wallet: {
        kind: "spark" as const,
        seed: "operator seed words",
      },
    },
  },
}));

vi.mock("@/hooks/useWallet", () => ({
  useWallet: mocks.useWallet,
}));

vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => mocks.currentUser,
}));

vi.mock("@/hooks/useOperatorEnvelope", () => ({
  useOperatorEnvelope: () => mocks.operator,
}));

vi.mock("@/lib/env", () => ({
  readEnv: mocks.readEnv,
}));

describe("useOperatorWallet", () => {
  beforeEach(() => {
    mocks.useWallet.mockClear();
    mocks.readEnv.mockReset().mockReturnValue(undefined);
  });

  it("does not pass the operator mnemonic to useWallet until enabled", () => {
    const { result } = renderHook(() => useOperatorWallet(false));

    expect(result.current.seed).toBe("operator seed words");
    expect(mocks.useWallet).toHaveBeenCalledWith({
      walletId: undefined,
      mnemonic: undefined,
    });
  });

  it("passes operator pubkey as walletId when enabled", () => {
    renderHook(() => useOperatorWallet(true));

    expect(mocks.useWallet).toHaveBeenCalledWith({
      walletId: "operator:operator-pubkey",
      mnemonic: "operator seed words",
    });
  });
});
