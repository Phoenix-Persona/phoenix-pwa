import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";

import {
  beforeEach,
  describe,
  expect,
  hoisted,
  it,
  mockFn,
  mockModule,
} from "@/test/api";

import { useAuthor } from "./useAuthor";

const mocks = hoisted(() => ({
  query: mockFn<() => Promise<unknown[]>>(),
}));

mockModule("@nostrify/react", () => ({
  useNostr: () => ({
    nostr: {
      query: mocks.query,
    },
  }),
}));

let queryClient: QueryClient;

function wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useAuthor", () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    mocks.query.mockReset();
  });

  it("treats a missing kind 0 profile as an empty result instead of retrying", async () => {
    mocks.query.mockResolvedValue([]);

    const { result } = renderHook(
      () => useAuthor("f".repeat(64)),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({});
    expect(mocks.query).toHaveBeenCalledOnce();
  });
});
