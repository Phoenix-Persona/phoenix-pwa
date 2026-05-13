import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, mockFn, hoisted, mockModule } from "@/test/api";

import { useOperatorWallet } from "./useOperatorWallet";

const mocks = hoisted(() => ({
  useWallet: mockFn(() => ({ handle: undefined })),
  readEnv: mockFn(),
  readDevEnv: mockFn(),
  currentUser: {
    user: { pubkey: "operator-pubkey" } as { pubkey: string } | undefined,
  },
  operator: {
    envelope: {
      wallet: {
        kind: "spark" as const,
        seed: "operator seed words",
      },
    } as { wallet?: { kind: "spark"; seed: string } } | undefined,
  },
}));

mockModule("@/hooks/useWallet", () => ({
  useWallet: mocks.useWallet,
}));

mockModule("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => mocks.currentUser,
}));

mockModule("@/hooks/useOperatorEnvelope", () => ({
  useOperatorEnvelope: () => mocks.operator,
}));

mockModule("@/lib/env", () => ({
  readEnv: mocks.readEnv,
  readDevEnv: mocks.readDevEnv,
}));

describe("useOperatorWallet", () => {
  beforeEach(() => {
    mocks.useWallet.mockClear();
    mocks.readEnv.mockReset().mockReturnValue(undefined);
    mocks.readDevEnv.mockReset().mockReturnValue(undefined);
    mocks.currentUser.user = { pubkey: "operator-pubkey" };
    mocks.operator.envelope = {
      wallet: { kind: "spark", seed: "operator seed words" },
    };
  });

  it("connects eagerly with the operator envelope seed when available", () => {
    const { result } = renderHook(() => useOperatorWallet());

    expect(result.current.seed).toBe("operator seed words");
    expect(mocks.useWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: "operator:operator-pubkey",
        mnemonic: "operator seed words",
        autoTopup: expect.objectContaining({
          enabled: false,
          fundingSource: "operator",
        }),
      }),
    );
  });

  it("prefers the dev-only VITE_WALLET_SEED env override over the envelope", () => {
    mocks.readDevEnv.mockReturnValue("env override seed");

    const { result } = renderHook(() => useOperatorWallet());

    expect(result.current.seed).toBe("env override seed");
    expect(mocks.useWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: "operator:operator-pubkey",
        mnemonic: "env override seed",
      }),
    );
  });

  it("ignores production env wallet seed values and uses the operator envelope", () => {
    mocks.readEnv.mockReturnValue("production env seed");
    mocks.readDevEnv.mockReturnValue(undefined);

    const { result } = renderHook(() => useOperatorWallet());

    expect(result.current.seed).toBe("operator seed words");
    expect(mocks.useWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: "operator:operator-pubkey",
        mnemonic: "operator seed words",
      }),
    );
  });

  it("does not connect when no seed is available", () => {
    mocks.operator.envelope = undefined;

    renderHook(() => useOperatorWallet());

    expect(mocks.useWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: undefined,
        mnemonic: undefined,
      }),
    );
  });

  it("does not assign a walletId when no user is logged in", () => {
    mocks.currentUser.user = undefined;

    renderHook(() => useOperatorWallet());

    // Mnemonic still passes so the SDK can preload, but the walletId
    // is omitted — the badge is gated on `isLoggedIn` upstream so this
    // path is rare in practice.
    expect(mocks.useWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: undefined,
        mnemonic: "operator seed words",
      }),
    );
  });
});
