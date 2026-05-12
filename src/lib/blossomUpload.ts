import { BlossomUploader } from "@nostrify/nostrify/uploaders";
import type { NostrSigner } from "@nostrify/types";

import { APP_BLOSSOM_SERVERS } from "@/lib/appBlossom";

export interface UploadFileToBlossomArgs {
  file: File;
  signer: NostrSigner;
  blossomServers?: string[];
  fetch?: typeof fetch;
  expiresIn?: number;
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

  const uploader = new BlossomUploader({
    servers,
    signer,
    fetch,
    expiresIn,
  });

  return uploader.upload(file);
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
