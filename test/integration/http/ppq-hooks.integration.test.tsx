import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "@/test/api";

import { getInferenceText, usePpqInference } from "@/hooks/usePpqInference";
import { usePpqImage } from "@/hooks/usePpqImage";
import {
  usePpqLightningTopup,
  usePpqTopupStatus,
} from "@/hooks/usePpqTopup";
import {
  DEFAULT_VIDEO_MODEL,
  usePpqVideoJob,
  usePpqVideoSubmit,
} from "@/hooks/usePpqVideo";
import { PpqError } from "@/lib/ppq/types";
import type { PpqAccount } from "@/lib/ppq/types";

import { TestHttpServer } from "./TestHttpServer";

const account: PpqAccount = {
  api_key: "api-local",
  credit_id: "credit-local",
};
const openServers: TestHttpServer[] = [];

vi.mock("@/hooks/usePpqAccount", () => ({
  usePpqAccount: () => ({
    account,
    ensureAccount: async () => account,
  }),
}));

function wrapper({ children }: PropsWithChildren) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("PPQ hooks against local HTTP mock", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    for (const server of openServers.splice(0)) {
      await server.close();
    }
  });

  it("runs chat inference through the real PPQ client", async () => {
    const server = await startServer();
    vi.stubEnv("VITE_PPQ_BASE_URL", server.url);
    server.on("POST", "/chat/completions", (req) => ({
      json: {
        id: "chatcmpl-local",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "local answer" },
            finish_reason: "stop",
          },
        ],
        request: JSON.parse(req.bodyText),
      },
    }));

    const { result } = renderHook(() => usePpqInference(), { wrapper });
    let response: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      response = await result.current.mutateAsync({
        messages: [{ role: "user", content: "hello" }],
      });
    });

    expect(getInferenceText(response!)).toBe("local answer");
    expect(server.requests[0]?.headers.authorization).toBe("Bearer api-local");
    expect(JSON.parse(server.requests[0]!.bodyText)).toEqual(
      expect.objectContaining({
        model: "claude-sonnet-4.5",
        messages: [{ role: "user", content: "hello" }],
      }),
    );
  });

  it("surfaces PPQ payment-required errors from inference", async () => {
    const server = await startServer();
    vi.stubEnv("VITE_PPQ_BASE_URL", server.url);
    server.on("POST", "/chat/completions", () => ({
      status: 402,
      json: {
        error: {
          type: "payment_required",
          message: "insufficient balance",
        },
      },
    }));

    const { result } = renderHook(() => usePpqInference(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          messages: [{ role: "user", content: "hello" }],
        }),
      ).rejects.toMatchObject({
        name: "PpqError",
        status: 402,
        message: "payment_required: insufficient balance",
      } satisfies Partial<PpqError>);
    });
  });

  it("surfaces malformed JSON responses from inference", async () => {
    const server = await startServer();
    vi.stubEnv("VITE_PPQ_BASE_URL", server.url);
    server.on("POST", "/chat/completions", () => ({
      text: "not-json",
    }));

    const { result } = renderHook(() => usePpqInference(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          messages: [{ role: "user", content: "hello" }],
        }),
      ).rejects.toMatchObject({
        name: "PpqError",
        status: 200,
        message: "Malformed JSON from ppq.ai",
      } satisfies Partial<PpqError>);
    });
  });

  it("runs image generation through the real PPQ client", async () => {
    const server = await startServer();
    vi.stubEnv("VITE_PPQ_BASE_URL", server.url);
    server.on("POST", "/v1/images/generations", (req) => ({
      json: {
        created: 1,
        data: [{ url: `${server.url}/image.png` }],
        request: JSON.parse(req.bodyText),
      },
    }));

    const { result } = renderHook(() => usePpqImage(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          model: "image-local",
          prompt: "draw a local test",
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          data: [{ url: `${server.url}/image.png` }],
        }),
      );
    });

    expect(server.requests[0]?.headers.authorization).toBe("Bearer api-local");
  });

  it("submits and polls video jobs through the real PPQ client", async () => {
    const server = await startServer();
    vi.stubEnv("VITE_PPQ_BASE_URL", server.url);
    server.on("POST", "/v1/videos", (req) => ({
      status: 202,
      json: {
        id: "video-local",
        status: "queued",
        request: JSON.parse(req.bodyText),
      },
    }));
    server.on("GET", "/v1/videos/video-local", () => ({
      json: {
        id: "video-local",
        model: DEFAULT_VIDEO_MODEL,
        status: "completed",
        created: 1,
        data: {
          url: `${server.url}/video.mp4`,
          content_type: "video/mp4",
        },
      },
    }));

    const submitHook = renderHook(() => usePpqVideoSubmit(), { wrapper });
    await act(async () => {
      await expect(
        submitHook.result.current.mutateAsync({
          prompt: "make a local video",
        }),
      ).resolves.toEqual(expect.objectContaining({ id: "video-local" }));
    });
    expect(JSON.parse(server.requests[0]!.bodyText)).toEqual(
      expect.objectContaining({ model: DEFAULT_VIDEO_MODEL }),
    );

    const statusHook = renderHook(() => usePpqVideoJob("video-local", 60_000), {
      wrapper,
    });
    await waitFor(() => expect(statusHook.result.current.isSuccess).toBe(true));
    expect(statusHook.result.current.data?.data?.url).toBe(`${server.url}/video.mp4`);
  });

  it("creates Lightning topups and reads topup status through the real PPQ client", async () => {
    const server = await startServer();
    vi.stubEnv("VITE_PPQ_BASE_URL", server.url);
    server.on("POST", "/topup/create/btc-lightning", (req) => ({
      json: {
        id: "invoice-local",
        status: "New",
        lightning_invoice: "lnbc1localinvoice",
        request: JSON.parse(req.bodyText),
      },
    }));
    server.on("GET", "/topup/status/invoice-local", () => ({
      json: {
        id: "invoice-local",
        status: "Settled",
      },
    }));

    const topupHook = renderHook(() => usePpqLightningTopup(), { wrapper });
    await act(async () => {
      await expect(
        topupHook.result.current.mutateAsync({ amount: 2.5 }),
      ).resolves.toEqual(
        expect.objectContaining({
          bolt11: "lnbc1localinvoice",
          invoice: expect.objectContaining({ id: "invoice-local" }),
        }),
      );
    });
    expect(server.requests[0]?.headers.authorization).toBe("Bearer api-local");
    expect(JSON.parse(server.requests[0]!.bodyText)).toEqual({
      amount: 2.5,
      currency: "USD",
    });

    const statusHook = renderHook(
      () => usePpqTopupStatus("invoice-local", 60_000),
      { wrapper },
    );
    await waitFor(() => expect(statusHook.result.current.isSettled).toBe(true));
    expect(statusHook.result.current.isTerminal).toBe(true);
  });

  it("surfaces PPQ auth failures from Lightning topups", async () => {
    const server = await startServer();
    vi.stubEnv("VITE_PPQ_BASE_URL", server.url);
    server.on("POST", "/topup/create/btc-lightning", () => ({
      status: 401,
      json: {
        error: {
          type: "auth_error",
          message: "bad api key",
        },
      },
    }));

    const topupHook = renderHook(() => usePpqLightningTopup(), { wrapper });
    await act(async () => {
      await expect(
        topupHook.result.current.mutateAsync({ amount: 2.5 }),
      ).rejects.toMatchObject({
        name: "PpqError",
        status: 401,
        message: "auth_error: bad api key",
      } satisfies Partial<PpqError>);
    });
  });
});

async function startServer(): Promise<TestHttpServer> {
  const server = await TestHttpServer.start();
  openServers.push(server);
  return server;
}
