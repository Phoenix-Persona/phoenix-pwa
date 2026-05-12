import { afterEach, describe, expect, it } from "vitest";

import { uploadFileToBlossom, urlFromUploadTags } from "@/lib/blossomUpload";

import { testKeys } from "../fixtures/nostr";
import { TestHttpServer } from "./TestHttpServer";

const openServers: TestHttpServer[] = [];

describe("uploadFileToBlossom", () => {
  afterEach(async () => {
    for (const server of openServers.splice(0)) {
      await server.close();
    }
  });

  it("uploads through BlossomUploader to a local Blossom-shaped server", async () => {
    const server = await startServer();
    const file = new File(["hello blossom"], "hello.txt", {
      type: "text/plain",
    });
    const sha256 = await fileSha256(file);
    server.on("PUT", "/upload", (req) => ({
      json: {
        url: `${server.url}/blob/${sha256}`,
        sha256,
        size: req.body.length,
        type: req.headers["content-type"],
      },
    }));

    const tags = await uploadFileToBlossom({
      file,
      signer: testKeys.persona.signer,
      blossomServers: [server.url],
      fetch: fileAwareFetch,
      expiresIn: 30_000,
    });

    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]?.method).toBe("PUT");
    expect(server.requests[0]?.path).toBe("/upload");
    expect(server.requests[0]?.bodyText).toBe("hello blossom");
    expect(server.requests[0]?.headers["content-type"]).toBe("text/plain");
    expect(server.requests[0]?.headers.authorization).toMatch(/^Nostr /);
    expect(tags).toEqual([
      ["url", `${server.url}/blob/${sha256}`],
      ["x", sha256],
      ["ox", sha256],
      ["size", "13"],
      ["m", "text/plain"],
    ]);
    expect(urlFromUploadTags(tags)).toBe(`${server.url}/blob/${sha256}`);
  });
});

async function startServer(): Promise<TestHttpServer> {
  const server = await TestHttpServer.start();
  openServers.push(server);
  return server;
}

async function fileSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const fileAwareFetch: typeof fetch = async (input, init) => {
  const body = init?.body instanceof File
    ? new Uint8Array(await init.body.arrayBuffer())
    : init?.body;
  return fetch(input, { ...init, body });
};
