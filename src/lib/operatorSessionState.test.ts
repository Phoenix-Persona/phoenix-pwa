import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "@/test/api";

import { queryKeys } from "./queryKeys";
import {
  clearOperatorDeviceSecrets,
  clearOperatorRuntimeState,
  clearOperatorSessionState,
} from "./operatorSessionState";

const mocks = vi.hoisted(() => ({
  clearSessionUnlocked: vi.fn(),
  clearPersistedNostrLogin: vi.fn(),
  clearUserNcryptsec: vi.fn(),
  clearPersonaDecryptCache: vi.fn(),
  clearLegacyPpqAccountStorage: vi.fn(),
  clearAllVideoChains: vi.fn(async () => undefined),
}));

vi.mock("@/lib/nip49Storage", () => ({
  clearSessionUnlocked: mocks.clearSessionUnlocked,
  clearPersistedNostrLogin: mocks.clearPersistedNostrLogin,
  clearUserNcryptsec: mocks.clearUserNcryptsec,
}));

vi.mock("@/hooks/usePersona", () => ({
  clearPersonaDecryptCache: mocks.clearPersonaDecryptCache,
}));

vi.mock("@/lib/ppq/storage", () => ({
  clearLegacyPpqAccountStorage: mocks.clearLegacyPpqAccountStorage,
}));

vi.mock("@/lib/video/chainStore", () => ({
  clearAllVideoChains: mocks.clearAllVideoChains,
}));

describe("operatorSessionState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears operator runtime caches and transient sensitive state", async () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.ppq.account("operator-old"), {
      api_key: "api-old",
      credit_id: "credit-old",
    });
    qc.setQueryData(queryKeys.wallet.detail("operator:operator-old"), {
      balanceSats: 10,
    });
    qc.setQueryData(queryKeys.wallet.payments("operator:operator-old"), []);
    qc.setQueryData(queryKeys.operator.envelope("operator-old"), {
      envelope: { wallet: { seed: "old seed" } },
    });
    qc.setQueryData(queryKeys.persona.mine("operator-old"), []);
    qc.setQueryData(queryKeys.persona.detail("npub1old", "operator-old"), {
      envelope: { persona: { pubkey: "persona-old" } },
    });

    await clearOperatorRuntimeState(qc, "operator-old");

    expect(qc.getQueryData(queryKeys.ppq.account("operator-old"))).toBeUndefined();
    expect(qc.getQueryData(queryKeys.wallet.detail("operator:operator-old"))).toBeUndefined();
    expect(qc.getQueryData(queryKeys.wallet.payments("operator:operator-old"))).toBeUndefined();
    expect(qc.getQueryData(queryKeys.operator.envelope("operator-old"))).toBeUndefined();
    expect(qc.getQueryData(queryKeys.persona.mine("operator-old"))).toBeUndefined();
    expect(qc.getQueryData(queryKeys.persona.detail("npub1old", "operator-old"))).toBeUndefined();
    expect(mocks.clearLegacyPpqAccountStorage).toHaveBeenCalledOnce();
    expect(mocks.clearPersonaDecryptCache).toHaveBeenCalledOnce();
    expect(mocks.clearAllVideoChains).toHaveBeenCalledOnce();
  });

  it("clears device secrets for forget-device flows", async () => {
    await clearOperatorDeviceSecrets();

    expect(mocks.clearUserNcryptsec).toHaveBeenCalledOnce();
    expect(mocks.clearSessionUnlocked).toHaveBeenCalledOnce();
    expect(mocks.clearPersistedNostrLogin).toHaveBeenCalledOnce();
    expect(mocks.clearAllVideoChains).toHaveBeenCalledOnce();
  });

  it("clears active session state without deleting the encrypted device backup", async () => {
    const qc = new QueryClient();

    await clearOperatorSessionState(qc, "operator-old");

    expect(mocks.clearUserNcryptsec).not.toHaveBeenCalled();
    expect(mocks.clearSessionUnlocked).toHaveBeenCalledOnce();
    expect(mocks.clearPersistedNostrLogin).toHaveBeenCalledOnce();
    expect(mocks.clearPersonaDecryptCache).toHaveBeenCalledOnce();
  });
});
