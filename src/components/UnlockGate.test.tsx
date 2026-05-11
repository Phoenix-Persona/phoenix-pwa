import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { UnlockGate } from "./UnlockGate";

const mocks = vi.hoisted(() => ({
  clearSessionUnlocked: vi.fn(),
  clearPersistedNostrLogin: vi.fn(),
  clearUserNcryptsec: vi.fn(),
  hasUserNcryptsec: vi.fn(() => true),
  clearPersonaDecryptCache: vi.fn(),
  clearAllVideoChains: vi.fn(async () => undefined),
}));

vi.mock("@nostrify/react/login", () => ({
  useNostrLogin: () => ({ logins: [] }),
}));

vi.mock("@/hooks/useLoginActions", () => ({
  useLoginActions: () => ({ nsec: vi.fn() }),
}));

vi.mock("@/lib/nip49Storage", () => ({
  clearSessionUnlocked: mocks.clearSessionUnlocked,
  clearPersistedNostrLogin: mocks.clearPersistedNostrLogin,
  clearUserNcryptsec: mocks.clearUserNcryptsec,
  decryptNcryptsec: vi.fn(),
  hasUserNcryptsec: mocks.hasUserNcryptsec,
  loadUserNcryptsec: vi.fn(),
  markSessionUnlocked: vi.fn(),
}));

vi.mock("@/hooks/usePersona", () => ({
  clearPersonaDecryptCache: mocks.clearPersonaDecryptCache,
}));

vi.mock("@/lib/video/chainStore", () => ({
  clearAllVideoChains: mocks.clearAllVideoChains,
}));

describe("UnlockGate", () => {
  it("clears sensitive local state when forgetting the device", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
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
