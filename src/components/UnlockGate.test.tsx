import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, mockFn, hoisted, mockModule, spyOn } from "@/test/api";

import { UnlockGate } from "./UnlockGate";

const mocks = hoisted(() => ({
  clearSessionUnlocked: mockFn(),
  clearPersistedNostrLogin: mockFn(),
  clearUserNcryptsec: mockFn(),
  hasUserNcryptsec: mockFn(() => true),
  clearPersonaDecryptCache: mockFn(),
  clearAllVideoChains: mockFn(async () => undefined),
}));

mockModule("@nostrify/react/login", () => ({
  useNostrLogin: () => ({ logins: [] }),
}));

mockModule("@/hooks/useLoginActions", () => ({
  useLoginActions: () => ({ nsec: mockFn() }),
}));

mockModule("@/lib/nip49Storage", () => ({
  clearSessionUnlocked: mocks.clearSessionUnlocked,
  clearPersistedNostrLogin: mocks.clearPersistedNostrLogin,
  clearUserNcryptsec: mocks.clearUserNcryptsec,
  decryptNcryptsec: mockFn(),
  hasUserNcryptsec: mocks.hasUserNcryptsec,
  loadUserNcryptsec: mockFn(),
  markSessionUnlocked: mockFn(),
}));

mockModule("@/hooks/usePersona", () => ({
  clearPersonaDecryptCache: mocks.clearPersonaDecryptCache,
}));

mockModule("@/lib/video/chainStore", () => ({
  clearAllVideoChains: mocks.clearAllVideoChains,
}));

describe("UnlockGate", () => {
  it("clears sensitive local state when forgetting the device", async () => {
    spyOn(window, "confirm").mockReturnValue(true);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <UnlockGate>
          <main>locked app</main>
        </UnlockGate>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /forget this device/i }));

    await waitFor(() => expect(mocks.clearAllVideoChains).toHaveBeenCalledOnce());
    expect(mocks.clearUserNcryptsec).toHaveBeenCalledOnce();
    expect(mocks.clearSessionUnlocked).toHaveBeenCalledOnce();
    expect(mocks.clearPersistedNostrLogin).toHaveBeenCalled();
    expect(mocks.clearPersonaDecryptCache).toHaveBeenCalledOnce();
  });
});
