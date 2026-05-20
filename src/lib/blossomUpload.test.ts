import type { NostrSigner } from "@nostrify/types";
import { beforeEach, describe, expect, it, mockFn } from "@/test/api";

import { APP_BLOSSOM_SERVERS } from "@/lib/appBlossom";
import { uploadFileToBlossom, urlFromUploadTags } from "./blossomUpload";

const blobDescriptor = {
  url: "https://blossom.example/hello.txt",
  sha256: "f".repeat(64),
  size: 5,
  type: "text/plain",
};

function makeSigner() {
  const signEvent = mockFn().mockImplementation(async (event: unknown) => {
    const template = event as Parameters<NostrSigner["signEvent"]>[0];
    return {
      ...template,
      id: "b".repeat(64),
      pubkey: "a".repeat(64),
      sig: "c".repeat(128),
    };
  });
  return {
    signEvent,
    getPublicKey: mockFn(async () => "a".repeat(64)),
  };
}

function makeFetch() {
  return mockFn(async () => new Response(JSON.stringify(blobDescriptor), {
    headers: { "content-type": "application/json" },
  }));
}

function makeFile() {
  return new File(["hello"], "hello.txt", { type: "text/plain" });
}

describe("blossomUpload", () => {
  beforeEach(() => {
    blobDescriptor.url = "https://blossom.example/hello.txt";
  });

  it("uploads with the supplied signer and Blossom servers", async () => {
    const signer = makeSigner();
    const file = makeFile();
    const fetch = makeFetch();

    const tags = await uploadFileToBlossom({
      file,
      signer: signer as unknown as NostrSigner,
      blossomServers: ["https://media.example/"],
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    expect(fetch).toHaveBeenCalledWith(
      new URL("https://media.example/upload"),
      expect.objectContaining({
        method: "PUT",
        body: file,
        headers: expect.objectContaining({
          authorization: expect.stringMatching(/^Nostr /),
          "content-type": "text/plain",
        }),
      }),
    );
    expect(signer.signEvent).toHaveBeenCalledWith(expect.objectContaining({
      kind: 24242,
      content: "Upload hello.txt",
    }));
    expect(tags).toContainEqual(["url", "https://blossom.example/hello.txt"]);
  });

  it("uses app Blossom servers when no explicit persona upload servers are provided", async () => {
    const signer = makeSigner();
    const fetch = makeFetch();

    await uploadFileToBlossom({
      file: makeFile(),
      signer: signer as unknown as NostrSigner,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    expect(fetch).toHaveBeenCalledWith(
      new URL("/upload", APP_BLOSSOM_SERVERS.servers[0]),
      expect.anything(),
    );
  });

  it("extracts the canonical URL tag from upload metadata", () => {
    expect(
      urlFromUploadTags([
        ["m", "image/png"],
        ["url", "https://blossom.example/pic.png"],
      ]),
    ).toBe("https://blossom.example/pic.png");

    expect(urlFromUploadTags([["m", "image/png"]])).toBeNull();
  });
});
