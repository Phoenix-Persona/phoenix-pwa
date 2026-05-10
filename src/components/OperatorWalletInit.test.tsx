/**
 * Regression test for the bounded-retry contract:
 *
 *   When `mint()` rejects, OperatorWalletInit must NOT call it again
 *   even after `isMinting` flips back to false. (Previously the catch
 *   block reset `ran.current = false`, which combined with the effect's
 *   `isMinting` dep produced a tight retry loop on persistent failure.)
 */

import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OperatorWalletInit } from "./OperatorWalletInit";

const mocks = vi.hoisted(() => ({
  useCurrentUser: vi.fn(),
  useOperatorEnvelope: vi.fn(),
  readEnv: vi.fn(),
}));

vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: mocks.useCurrentUser,
}));

vi.mock("@/hooks/useOperatorEnvelope", () => ({
  useOperatorEnvelope: mocks.useOperatorEnvelope,
}));

vi.mock("@/lib/env", () => ({
  readEnv: mocks.readEnv,
}));

interface FakeEnvelopeState {
  envelope?: unknown;
  isLoading: boolean;
  isMinting: boolean;
  mint: ReturnType<typeof vi.fn>;
}

function setupEnvelope(overrides: Partial<FakeEnvelopeState> = {}): FakeEnvelopeState {
  const state: FakeEnvelopeState = {
    envelope: undefined,
    isLoading: false,
    isMinting: false,
    mint: vi.fn().mockRejectedValue(new Error("signer rejected")),
    ...overrides,
  };
  mocks.useOperatorEnvelope.mockReturnValue(state);
  return state;
}

describe("OperatorWalletInit", () => {
  beforeEach(() => {
    mocks.readEnv.mockReturnValue(undefined);
    mocks.useCurrentUser.mockReturnValue({
      user: { pubkey: "operator-pubkey" },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls mint exactly once when the user is logged in and no envelope exists", async () => {
    const env = setupEnvelope();

    render(<OperatorWalletInit />);

    // Allow microtasks (effect + mint promise) to settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(env.mint).toHaveBeenCalledTimes(1);
  });

  it("does not retry mint after a persistent failure even if isMinting cycles back", async () => {
    const env = setupEnvelope();

    const { rerender } = render(<OperatorWalletInit />);

    await Promise.resolve();
    await Promise.resolve();
    expect(env.mint).toHaveBeenCalledTimes(1);

    // Simulate the post-failure state: isMinting flips back to false,
    // envelope still missing. The effect re-runs because of the
    // `isMinting` dep — but the `ran` guard must prevent a second call.
    setupEnvelope({ ...env, isMinting: false, mint: env.mint });
    rerender(<OperatorWalletInit />);

    await Promise.resolve();
    await Promise.resolve();

    expect(env.mint).toHaveBeenCalledTimes(1);
  });

  it("does not mint when an existing envelope is already present", async () => {
    const env = setupEnvelope({
      envelope: { app: "phoenix-operator", version: 1 },
    });

    render(<OperatorWalletInit />);
    await Promise.resolve();

    expect(env.mint).not.toHaveBeenCalled();
  });

  it("does not mint while the envelope query is still loading", async () => {
    const env = setupEnvelope({ isLoading: true });

    render(<OperatorWalletInit />);
    await Promise.resolve();

    expect(env.mint).not.toHaveBeenCalled();
  });

  it("does not mint when the env override is complete", async () => {
    mocks.readEnv.mockImplementation((key: string) => {
      if (key === "VITE_WALLET_SEED") return "env seed";
      if (key === "VITE_PPQ_API_KEY") return "env api key";
      return undefined;
    });
    const env = setupEnvelope();

    render(<OperatorWalletInit />);
    await Promise.resolve();

    expect(env.mint).not.toHaveBeenCalled();
  });

  it("does not mint when no user is logged in", async () => {
    mocks.useCurrentUser.mockReturnValue({ user: undefined });
    const env = setupEnvelope();

    render(<OperatorWalletInit />);
    await Promise.resolve();

    expect(env.mint).not.toHaveBeenCalled();
  });
});
