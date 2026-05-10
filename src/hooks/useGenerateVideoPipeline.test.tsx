import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Persona } from "@/lib/persona";
import { generatePersonaKeypair } from "@/lib/personaKey";
import { useGenerateVideoPipeline } from "./useGenerateVideoPipeline";

const mocks = vi.hoisted(() => ({
  uploadOptions: [] as unknown[],
}));

vi.mock("@/hooks/useUploadFile", () => ({
  useUploadFile: (options?: unknown) => {
    mocks.uploadOptions.push(options);
    return {
      mutateAsync: vi.fn(),
      isPending: false,
    };
  },
}));

vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    user: {
      pubkey: "operator-pubkey",
      signer: { signEvent: vi.fn() },
    },
  }),
}));

vi.mock("@/hooks/usePpqAccount", () => ({
  usePpqAccount: () => ({
    account: { api_key: "ppq_test", credit_id: "credit" },
    ensureAccount: vi.fn(),
  }),
}));

vi.mock("./usePersonaPublish", () => ({
  usePersonaPublish: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

let queryClient: QueryClient;

function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function resetQueryClient() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function makePersona(): Persona {
  const keypair = generatePersonaKeypair();
  return {
    pubkey: keypair.hex.pk,
    nsec: keypair.nsec,
    dTag: "persona-dtag",
    name: "Persona",
    display_name: "Persona",
    username: "persona",
    system_prompt: "Speak plainly.",
    created_at: 1,
  };
}

describe("useGenerateVideoPipeline", () => {
  beforeEach(() => {
    resetQueryClient();
    mocks.uploadOptions.length = 0;
  });

  it("configures Blossom uploads with a persona signer", () => {
    renderHook(
      () =>
        useGenerateVideoPipeline({
          persona: makePersona(),
          idea: "Make a short post",
          sources: [],
          hints: "",
          personaAvatarUrl: "https://example.com/avatar.png",
        }),
      { wrapper },
    );

    expect(mocks.uploadOptions).toHaveLength(1);
    expect(mocks.uploadOptions[0]).toEqual({
      signer: expect.objectContaining({
        signEvent: expect.any(Function),
      }),
    });
  });
});
