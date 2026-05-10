import type { NostrSigner } from "@nostrify/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { APP_BLOSSOM_SERVERS } from "@/lib/appBlossom";
import { uploadFileToBlossom, urlFromUploadTags } from "./blossomUpload";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  constructors: [] as Array<{ servers: string[]; signer: NostrSigner }>,
}));

vi.mock("@nostrify/nostrify/uploaders", () => ({
  BlossomUploader: class {
    constructor(args: { servers: string[]; signer: NostrSigner }) {
      mocks.constructors.push(args);
    }

    upload(file: File) {
      return mocks.upload(file);
    }
  },
}));

function makeSigner(): NostrSigner {
  return {
    getPublicKey: vi.fn(async () => "a".repeat(64)),
    signEvent: vi.fn(),
  } satisfies NostrSigner;
}

function makeFile() {
  return new File(["hello"], "hello.txt", { type: "text/plain" });
}

describe("blossomUpload", () => {
  beforeEach(() => {
    mocks.upload.mockReset().mockResolvedValue([
      ["url", "https://blossom.example/hello.txt"],
    ]);
    mocks.constructors.length = 0;
  });

  it("uploads with the supplied signer and Blossom servers", async () => {
    const signer = makeSigner();
    const file = makeFile();

    await uploadFileToBlossom({
      file,
      signer,
      blossomServers: ["https://media.example/"],
    });

    expect(mocks.constructors).toEqual([
      { servers: ["https://media.example/"], signer },
    ]);
    expect(mocks.upload).toHaveBeenCalledWith(file);
  });

  it("uses app Blossom servers when no explicit persona upload servers are provided", async () => {
    const signer = makeSigner();

    await uploadFileToBlossom({
      file: makeFile(),
      signer,
    });

    expect(mocks.constructors[0]).toEqual({
      servers: APP_BLOSSOM_SERVERS.servers,
      signer,
    });
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
