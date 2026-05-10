import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { NostrEvent } from "@nostrify/nostrify";
import type { PropsWithChildren } from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";

import type { Persona } from "@/lib/persona";
import {
  type PublishTextOnlyResult,
  usePersonaComposer,
} from "./usePersonaComposer";

const mocks = vi.hoisted(() => ({
  publishMutateAsync: vi.fn(),
  crossPostMutateAsync: vi.fn(),
  inferenceMutateAsync: vi.fn(),
}));

vi.mock("./useCurrentUser", () => ({
  useCurrentUser: () => ({ user: { pubkey: "operator-pubkey" } }),
}));

vi.mock("./usePersonaPublish", () => ({
  usePersonaPublish: () => ({
    mutateAsync: mocks.publishMutateAsync,
    isPending: false,
  }),
}));

vi.mock("./useCrossPost", () => ({
  useCrossPost: () => ({
    mutateAsync: mocks.crossPostMutateAsync,
    isPending: false,
  }),
}));

vi.mock("./usePpqInference", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./usePpqInference")>();
  return {
    ...actual,
    usePpqInference: () => ({
      mutateAsync: mocks.inferenceMutateAsync,
      isPending: false,
    }),
  };
});

function wrapper({ children }: PropsWithChildren) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function makePersona(overrides: Partial<Persona> = {}): Persona {
  return {
    pubkey: "persona-pubkey",
    nsec: "nsec1persona",
    dTag: "persona-dtag",
    name: "Voice",
    display_name: "Voice",
    username: "voice",
    system_prompt: "Speak plainly.",
    voice_id: "alloy",
    languages: ["en"],
    tags: ["rwanda", "press-freedom"],
    created_at: 1,
    ...overrides,
  };
}

describe("usePersonaComposer", () => {
  beforeEach(() => {
    mocks.publishMutateAsync.mockReset().mockResolvedValue({
      id: "event-id",
      kind: 1,
      pubkey: "persona-pubkey",
      created_at: 1,
      tags: [],
      content: "Published",
      sig: "sig",
    } satisfies NostrEvent);
    mocks.crossPostMutateAsync.mockReset().mockResolvedValue({
      skipped: false,
      status: 200,
    });
    mocks.inferenceMutateAsync.mockReset().mockResolvedValue({
      choices: [{ message: { content: "Styled post" } }],
    });
  });

  it("styles text with the persona system prompt and refreshes wallet state", async () => {
    const wallet = {
      refreshInfo: vi.fn(),
      refreshPpqBalance: vi.fn(),
    };
    const { result } = renderHook(
      () =>
        usePersonaComposer({
          persona: makePersona(),
          stylingModel: "test-model",
          wallet,
        }),
      { wrapper },
    );

    let styled: string | null = null;
    await act(async () => {
      styled = await result.current.styleInVoice("raw brief");
    });

    expect(styled).toBe("Styled post");
    expect(mocks.inferenceMutateAsync).toHaveBeenCalledWith({
      model: "test-model",
      messages: [
        { role: "system", content: "Speak plainly." },
        { role: "user", content: "raw brief" },
      ],
    });
    expect(wallet.refreshPpqBalance).toHaveBeenCalledOnce();
    expect(wallet.refreshInfo).toHaveBeenCalledOnce();
  });

  it("publishes text-only posts with topic and source tags", async () => {
    const onPublished = vi.fn();
    const { result } = renderHook(
      () =>
        usePersonaComposer({
          persona: makePersona(),
          stylingModel: "test-model",
          onPublished,
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.publishTextOnly({
        text: "  Publish this  ",
        sourcesInput: "https://example.com/a, https://example.com/b",
      });
    });

    expect(mocks.publishMutateAsync).toHaveBeenCalledWith({
      personaNsec: "nsec1persona",
      template: expect.objectContaining({
        kind: 1,
        content: "Publish this",
        tags: [
          ["t", "rwanda"],
          ["t", "press-freedom"],
          ["r", "https://example.com/a"],
          ["r", "https://example.com/b"],
        ],
      }),
    });
    expect(mocks.crossPostMutateAsync).not.toHaveBeenCalled();
    expect(onPublished).toHaveBeenCalledOnce();
  });

  it("returns cross-post failures without failing the publish", async () => {
    mocks.crossPostMutateAsync.mockRejectedValueOnce(
      new Error("webhook failed"),
    );
    const { result } = renderHook(
      () =>
        usePersonaComposer({
          persona: makePersona({
            cross_post: { webhook_url: "https://hooks.example.com" },
          }),
          stylingModel: "test-model",
          crossPostEnabled: true,
        }),
      { wrapper },
    );

    const publishResult = await act(async (): Promise<PublishTextOnlyResult | null> => {
      return result.current.publishTextOnly({
        text: "Publish this",
        sourcesInput: "",
      });
    });

    expect(publishResult).not.toBeNull();
    if (!publishResult) throw new Error("Expected publish result");
    expect(publishResult?.crossPost).toBe("failed");
    expect(publishResult?.event.id).toBe("event-id");
    expect(publishResult?.crossPostError?.message).toBe("webhook failed");
  });
});
