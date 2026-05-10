/**
 * Helpers for uploading a Blob to Blossom and getting back a single URL.
 *
 * The underlying [`useUploadFile`](../../hooks/useUploadFile.ts) hook
 * returns a NIP-94-style `string[][]` tag array (the first entry is
 * typically `["url", "<url>"]`). The video pipeline only ever needs the
 * URL string, so this module:
 *
 *   - wraps the hook into a `useBlobUploader()` that takes a Blob,
 *     promotes it to a File, runs the existing mutation, and returns
 *     just the URL string;
 *   - exposes a pure `extractUrlFromTags(tags)` helper for callers that
 *     have tags but not a hook context (e.g. unit tests).
 */

import { useCallback } from "react";

import { useUploadFile } from "@/hooks/useUploadFile";

/**
 * Pull the `url` value out of a NIP-94-style tag array. Returns
 * undefined if no `["url", ...]` tag is present or its value is empty.
 */
export function extractUrlFromTags(tags: string[][]): string | undefined {
  for (const t of tags) {
    if (Array.isArray(t) && t[0] === "url" && typeof t[1] === "string" && t[1].length > 0) {
      return t[1];
    }
  }
  return undefined;
}

/**
 * Hook returning `uploadBlob(blob, filename?)` — uploads to Blossom via
 * the user's signer and resolves to the single URL string. Throws if
 * the upload mutation rejects or the returned tags don't carry a URL.
 *
 * Use this from React components / hooks. For a non-React caller, lift
 * the underlying `useUploadFile` mutation up and pass `extractUrlFromTags`
 * the resulting tags directly.
 */
export function useBlobUploader(): {
  uploadBlob: (blob: Blob, filename?: string) => Promise<string>;
  isUploading: boolean;
} {
  const upload = useUploadFile();

  const uploadBlob = useCallback(
    async (blob: Blob, filename = "frame.png"): Promise<string> => {
      const file = new File([blob], filename, {
        type: blob.type || "application/octet-stream",
      });
      const tags = await upload.mutateAsync(file);
      const url = extractUrlFromTags(tags);
      if (!url) {
        throw new Error(
          "Blossom upload returned tags without a `url` entry: " +
            JSON.stringify(tags),
        );
      }
      return url;
    },
    [upload],
  );

  return { uploadBlob, isUploading: upload.isPending };
}
