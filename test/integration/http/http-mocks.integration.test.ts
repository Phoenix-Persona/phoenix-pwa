import { afterEach, describe, expect, it } from "@/test/api";

import {
  createAccount,
  getBalance,
  request,
} from "@/lib/ppq/client";
import type { PpqError } from "@/lib/ppq/types";

import { TestHttpServer } from "./TestHttpServer";

const openServers: TestHttpServer[] = [];

describe("TestHttpServer", () => {
  afterEach(async () => {
    for (const server of openServers.splice(0)) {
      await server.close();
    }
  });

  it("serves local PPQ account and balance responses", async () => {
    const server = await startServer();
    server.on("POST", "/accounts/create", () => ({
      json: { api_key: "ppq_api_fixture", credit_id: "credit_fixture" },
    }));
    server.on("POST", "/credits/balance", (req) => ({
      json: {
        ok: true,
        data: {
          balance_usd:
            JSON.parse(req.bodyText).credit_id === "credit_fixture"
              ? "12.34"
              : "0",
        },
      },
    }));

    const account = await createAccount({ baseUrl: server.url });
    const balance = await getBalance(account.credit_id, { baseUrl: server.url });

    expect(account).toEqual({
      api_key: "ppq_api_fixture",
      credit_id: "credit_fixture",
    });
    expect(balance.balance_usd).toBe(12.34);
    expect(server.requests.map((req) => `${req.method} ${req.path}`)).toEqual([
      "POST /accounts/create",
      "POST /credits/balance",
    ]);
  });

  it("normalizes local PPQ error responses", async () => {
    const server = await startServer();
    server.on("POST", "/fail", () => ({
      status: 402,
      json: { error: "insufficient balance" },
    }));

    await expect(
      request<unknown>("/fail", {
        baseUrl: server.url,
        method: "POST",
        body: { model: "fixture" },
      }),
    ).rejects.toMatchObject({
      status: 402,
    } satisfies Partial<PpqError>);
  });

  it("records binary upload requests for Blossom-shaped mock endpoints", async () => {
    const server = await startServer();
    server.on("PUT", "/upload", (req) => ({
      json: {
        accepted: true,
        bytes: req.body.length,
        tags: [["url", `${server.url}/blob/fixture`]],
      },
    }));

    const response = await fetch(`${server.url}/upload`, {
      method: "PUT",
      headers: { "content-type": "text/plain" },
      body: new TextEncoder().encode("hello blossom"),
    });
    const payload = await response.json() as {
      accepted: boolean;
      bytes: number;
      tags: string[][];
    };

    expect(payload).toEqual({
      accepted: true,
      bytes: 13,
      tags: [["url", `${server.url}/blob/fixture`]],
    });
    expect(server.requests[0]?.bodyText).toBe("hello blossom");
    expect(server.requests[0]?.headers["content-type"]).toBe("text/plain");
  });
});

async function startServer(): Promise<TestHttpServer> {
  const server = await TestHttpServer.start();
  openServers.push(server);
  return server;
}
