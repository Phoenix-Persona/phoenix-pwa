import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { NostrEvent } from "@nostrify/nostrify";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePersonaPublicProfile } from "./usePersonaPublicProfile";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("@nostrify/react", () => ({
  useNostr: () => ({ nostr: { query: mocks.query } }),
}));

function wrapper({ children }: PropsWithChildren) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function kind0(content: string): NostrEvent {
  return {
    id: "event-id",
    pubkey: "a".repeat(64),
    created_at: 1,
    kind: 0,
    tags: [],
    content,
    sig: "sig",
  };
}

describe("usePersonaPublicProfile", () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it("fetches bio and picture from the persona kind 0 profile", async () => {
    mocks.query.mockResolvedValueOnce([
      kind0(JSON.stringify({ about: "Bio", picture: "https://example.com/a.png" })),
    ]);

    const { result } = renderHook(
      () => usePersonaPublicProfile("a".repeat(64)),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      bio: "Bio",
      picture: "https://example.com/a.png",
    });
    expect(mocks.query).toHaveBeenCalledWith(
      [{ kinds: [0], authors: ["a".repeat(64)], limit: 1 }],
      expect.objectContaining({ signal: expect.any(AbortSignal) as AbortSignal }),
    );
  });

  it("returns empty fields for invalid profile JSON", async () => {
    mocks.query.mockResolvedValueOnce([kind0("{")]);

    const { result } = renderHook(
      () => usePersonaPublicProfile("b".repeat(64)),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ bio: "", picture: "" });
  });

  it("does not query without a pubkey", () => {
    renderHook(() => usePersonaPublicProfile(undefined), { wrapper });

    expect(mocks.query).not.toHaveBeenCalled();
  });
});
