import type { NostrSigner } from "@nostrify/types";

import { APP_BLOSSOM_SERVERS } from "@/lib/appBlossom";

export interface UploadFileToBlossomArgs {
  file: File;
  signer: NostrSigner;
  blossomServers?: string[];
  fetch?: typeof fetch;
  expiresIn?: number;
}

interface BlossomBlobDescriptor {
  url: string;
  sha256: string;
  size: number;
  type?: string;
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function parseBlobDescriptor(value: unknown): BlossomBlobDescriptor {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Blossom server returned invalid descriptor");
  }

  const descriptor = value as Record<string, unknown>;
  if (typeof descriptor.url !== "string") {
    throw new Error("Blossom server descriptor is missing url");
  }
  if (typeof descriptor.sha256 !== "string") {
    throw new Error("Blossom server descriptor is missing sha256");
  }
  if (typeof descriptor.size !== "number") {
    throw new Error("Blossom server descriptor is missing size");
  }
  if (descriptor.type !== undefined && typeof descriptor.type !== "string") {
    throw new Error("Blossom server descriptor has invalid type");
  }

  return descriptor as unknown as BlossomBlobDescriptor;
}

async function uploadToServer({
  server,
  file,
  authorization,
  fetch: fetchFn,
  signal,
}: {
  server: string;
  file: File;
  authorization: string;
  fetch: typeof fetch;
  signal?: AbortSignal;
}): Promise<string[][]> {
  const url = new URL("/upload", server);
  const response = await fetchFn(url, {
    method: "PUT",
    body: file,
    headers: {
      authorization,
      "content-type": file.type,
    },
    signal,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Blossom upload failed (${response.status}): ${text}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Blossom server returned non-JSON response: ${text}`);
  }

  const data = parseBlobDescriptor(json);
  const tags = [
    ["url", data.url],
    ["x", data.sha256],
    ["ox", data.sha256],
    ["size", data.size.toString()],
  ];
  if (data.type) tags.push(["m", data.type]);
  return tags;
}

/**
 * Upload a file to Blossom with an explicit signer.
 *
 * Persona uploads should call this with the persona signer. When no server
 * list is supplied, use app defaults rather than inheriting operator server
 * preferences.
 */
export async function uploadFileToBlossom({
  file,
  signer,
  blossomServers,
  fetch,
  expiresIn,
}: UploadFileToBlossomArgs): Promise<string[][]> {
  const servers =
    blossomServers && blossomServers.length > 0
      ? blossomServers
      : [...APP_BLOSSOM_SERVERS.servers];

  if (servers.length === 0) {
    throw new Error("No Blossom servers configured");
  }

  const now = Date.now();
  const expiration = now + (expiresIn ?? 60_000);
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const x = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const event = await signer.signEvent({
    kind: 24242,
    content: `Upload ${file.name}`,
    created_at: Math.floor(now / 1000),
    tags: [
      ["t", "upload"],
      ["x", x],
      ["size", file.size.toString()],
      ["expiration", Math.floor(expiration / 1000).toString()],
    ],
  });
  const authorization = `Nostr ${encodeBase64(JSON.stringify(event))}`;
  const fetchFn = fetch ?? globalThis.fetch.bind(globalThis);

  return Promise.any(
    servers.map((server) => uploadToServer({
      server,
      file,
      authorization,
      fetch: fetchFn,
    })),
  );
}

/**
 * Pull the canonical URL out of a Blossom upload result.
 */
export function urlFromUploadTags(tags: string[][]): string | null {
  for (const tag of tags) {
    if (tag[0] === "url" && tag[1]) return tag[1];
  }
  return null;
}
