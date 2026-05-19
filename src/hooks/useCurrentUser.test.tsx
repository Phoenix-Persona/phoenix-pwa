import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { NLogin, NostrLoginProvider } from "@nostrify/react/login";
import { hexToBytes } from "@noble/hashes/utils.js";
import { getPublicKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";
import type { PropsWithChildren } from "react";
import { describe, expect, it, mockModule } from "@/test/api";

import { createMemoryNostrLoginStorage } from "@/lib/nostrLoginStorage";
import { useCurrentUser } from "./useCurrentUser";

mockModule("@nostrify/react", () => ({
  useNostr: () => ({ nostr: {} }),
}));

mockModule("./useAuthor.ts", () => ({
  useAuthor: () => ({ data: { metadata: {} } }),
}));

const OPERATOR_SECRET = hexToBytes(
  "0000000000000000000000000000000000000000000000000000000000000001",
);
const OPERATOR_NSEC = nip19.nsecEncode(OPERATOR_SECRET);
const OPERATOR_PUBKEY = getPublicKey(OPERATOR_SECRET);

function wrapper({ children }: PropsWithChildren) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const loginStorage = createMemoryNostrLoginStorage();
  loginStorage.setItem(
    "test-login",
    JSON.stringify([NLogin.fromNsec(OPERATOR_NSEC)]),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <NostrLoginProvider storageKey="test-login" storage={loginStorage}>
        {children}
      </NostrLoginProvider>
    </QueryClientProvider>
  );
}

describe("useCurrentUser", () => {
  it("exposes only the single active user, not a multi-user list", async () => {
    const { result } = renderHook(() => useCurrentUser(), { wrapper });

    await waitFor(() =>
      expect(result.current?.user?.pubkey).toBe(OPERATOR_PUBKEY),
    );
    expect("users" in result.current).toBe(false);
  });
});
