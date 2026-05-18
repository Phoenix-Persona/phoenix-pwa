import { QueryClient } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  clearAllMocks,
  describe,
  expect,
  hoisted,
  it,
  mockFn,
  mockModule,
} from "@/test/api";

import { useGenerateVideoPipeline } from "@/hooks/useGenerateVideoPipeline";

import {
  loginFor,
  operatorEnvelopeEvent,
  personaEnvelopeEvent,
  testKeys,
} from "./fixtures/nostr";
import {
  createServicesHarness,
  type ServicesHarness,
} from "./harness/renderWithServices";

const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const uploadMocks = hoisted(() => ({
  mutateAsync: mockFn(async (file: File) => [
    ["url", `https://blossom.test/${file.name}`],
  ]),
}));

const videoMocks = hoisted(() => ({
  generateMonologueScript: mockFn(async () => [
    {
      label: "1 - hook",
      duration: 10,
      dialog: "A short generated monologue segment.",
    },
  ]),
  runChain: mockFn(async () => [
    {
      id: "clip-1",
      url: "https://video.test/clip-1.mp4",
      costUsd: 0.01,
      blob: new Blob(["clip"], { type: "video/mp4" }),
    },
  ]),
  stitchClips: mockFn(async () => new Blob(["stitched"], { type: "video/mp4" })),
  generateCaption: mockFn(async () => "Generated caption."),
}));

const chainStoreMocks = hoisted(() => ({
  newChainId: mockFn(() => "chain-test"),
  saveChain: mockFn(async () => undefined),
  loadChain: mockFn(async () => null),
  deleteChain: mockFn(async () => undefined),
}));

mockModule("@/hooks/useUploadFile", () => ({
  useUploadFile: () => ({
    mutateAsync: uploadMocks.mutateAsync,
    isPending: false,
  }),
}));

mockModule("@/lib/video/generateMonologueScript", () => ({
  generateMonologueScript: videoMocks.generateMonologueScript,
}));

mockModule("@/lib/video/runChain", () => ({
  runChain: videoMocks.runChain,
}));

mockModule("@/lib/video/stitchClips", () => ({
  stitchClips: videoMocks.stitchClips,
}));

mockModule("@/lib/video/generateCaption", () => ({
  generateCaption: videoMocks.generateCaption,
}));

mockModule("@/lib/video/chainStore", () => ({
  newChainId: chainStoreMocks.newChainId,
  saveChain: chainStoreMocks.saveChain,
  loadChain: chainStoreMocks.loadChain,
  deleteChain: chainStoreMocks.deleteChain,
}));

describe("AI video pipeline integration", () => {
  let harness: ServicesHarness | undefined;

  beforeEach(() => {
    clearAllMocks();
  });

  afterEach(async () => {
    cleanup();
    await harness?.cleanup();
    harness = undefined;
  });

  it("generates a PPQ preview, uploads media with the persona signer path, and prepares a caption", async () => {
    const operator = await operatorEnvelopeEvent({
      operator: testKeys.operator,
      wallet: { kind: "spark", seed: MNEMONIC },
      ppq: { api_key: "api-video", credit_id: "credit-video" },
    });
    const persona = await personaEnvelopeEvent({
      operator: testKeys.operator,
      persona: testKeys.persona,
      name: "Video Voice",
    });
    harness = await createServicesHarness({
      events: [operator.event, persona.event],
      logins: [loginFor(testKeys.operator)],
      queryClient: testQueryClient(),
      withHttp: true,
    });
    if (!harness.http) throw new Error("HTTP harness was not started.");
    harness.http.on("POST", "/credits/balance", () => ({
      json: { balance_usd: 10 },
    }));
    harness.http.on("POST", "/v1/images/generations", (req) => ({
      json: {
        created: 1_800_000_000,
        model: "grok-imagine-edit",
        cost: 0.05,
        data: [
          {
            url: `${harness?.httpUrl}/preview.png`,
            content_type: "image/png",
          },
        ],
        request: JSON.parse(req.bodyText),
      },
    }));
    harness.http.on("GET", "/preview.png", () => ({
      headers: { "content-type": "image/png" },
      body: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    }));

    const pipeline = renderHook(
      () =>
        useGenerateVideoPipeline({
          persona: persona.envelope.persona,
          idea: "Explain why local journalism matters.",
          sources: ["https://example.test/source"],
          hints: "measured and direct",
          personaAvatarUrl: "https://example.test/avatar.png",
        }),
      { wrapper: harness.wrapper },
    );
    await waitFor(() => expect(pipeline.result.current).toBeTruthy());

    await act(async () => {
      await pipeline.result.current.generatePreview();
    });
    await waitFor(() =>
      expect(pipeline.result.current.phase).toMatchObject({
        type: "preview-ready",
        previewUrl: `${harness?.httpUrl}/preview.png`,
      }),
    );
    const previewRequest = harness.http.requests.find(
      (req) => req.path === "/v1/images/generations",
    );
    expect(previewRequest?.headers.authorization).toBe("Bearer api-video");
    expect(JSON.parse(previewRequest!.bodyText)).toEqual(
      expect.objectContaining({
        model: "grok-imagine-edit",
        image_url: "https://example.test/avatar.png",
        size: "9:16",
        n: 1,
        output_format: "png",
      }),
    );

    await act(async () => {
      await pipeline.result.current.confirmAndGenerate(10);
    });
    await waitFor(() =>
      expect(pipeline.result.current.phase).toMatchObject({
        type: "ready-to-post",
        stitchedUrl: "https://blossom.test/stitched.mp4",
        captionDraft: "Generated caption.",
      }),
    );
    expect((uploadMocks.mutateAsync.mock.calls[0]?.[0] as File).name).toBe(
      "preview-seed.png",
    );
    expect((uploadMocks.mutateAsync.mock.calls[1]?.[0] as File).name).toBe(
      "stitched.mp4",
    );
    expect(videoMocks.generateMonologueScript).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "api-video",
        persona: persona.envelope.persona,
        idea: "Explain why local journalism matters.",
        sources: ["https://example.test/source"],
        hints: "measured and direct",
        totalDurationSecs: 10,
      }),
    );
    expect(videoMocks.runChain).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "api-video",
        seedImageUrl: "https://blossom.test/preview-seed.png",
      }),
    );
    expect(videoMocks.stitchClips).toHaveBeenCalledOnce();
    expect(videoMocks.generateCaption).toHaveBeenCalledOnce();
  });

  it("surfaces script-generation failure before any persona post is published", async () => {
    videoMocks.generateMonologueScript.mockRejectedValueOnce(
      new Error("script failed"),
    );
    const operator = await operatorEnvelopeEvent({
      operator: testKeys.operator,
      wallet: { kind: "spark", seed: MNEMONIC },
      ppq: { api_key: "api-video-error", credit_id: "credit-video-error" },
    });
    const persona = await personaEnvelopeEvent({
      operator: testKeys.operator,
      persona: testKeys.persona,
    });
    harness = await createServicesHarness({
      events: [operator.event, persona.event],
      logins: [loginFor(testKeys.operator)],
      queryClient: testQueryClient(),
      withHttp: true,
    });
    if (!harness.http) throw new Error("HTTP harness was not started.");
    harness.http.on("POST", "/credits/balance", () => ({
      json: { balance_usd: 10 },
    }));
    harness.http.on("POST", "/v1/images/generations", () => ({
      json: {
        created: 1_800_000_000,
        model: "grok-imagine-edit",
        cost: 0.05,
        data: [
          {
            url: `${harness?.httpUrl}/preview.png`,
            content_type: "image/png",
          },
        ],
      },
    }));
    harness.http.on("GET", "/preview.png", () => ({
      headers: { "content-type": "image/png" },
      body: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    }));

    const pipeline = renderHook(
      () =>
        useGenerateVideoPipeline({
          persona: persona.envelope.persona,
          idea: "Make a short update.",
        }),
      { wrapper: harness.wrapper },
    );
    await waitFor(() => expect(pipeline.result.current).toBeTruthy());

    await act(async () => {
      await pipeline.result.current.generatePreview();
    });
    await waitFor(() =>
      expect(pipeline.result.current.phase).toMatchObject({
        type: "preview-ready",
      }),
    );
    await act(async () => {
      await pipeline.result.current.confirmAndGenerate(10);
    });
    await waitFor(() =>
      expect(pipeline.result.current.phase).toMatchObject({
        type: "error",
        message: "script failed",
      }),
    );
    expect(videoMocks.runChain).not.toHaveBeenCalled();
    expect(
      harness.relay.getEvents({
        authors: [testKeys.persona.pubkey],
        kinds: [1],
      }),
    ).toHaveLength(0);
  });
});

function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}
