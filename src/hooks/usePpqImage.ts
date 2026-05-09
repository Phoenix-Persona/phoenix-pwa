/**
 * Image generation via ppq.ai.
 *
 *   const { mutateAsync: gen } = usePpqImage();
 *   const result = await gen({ model: "...", prompt: "..." });
 *   const url = result.data[0]?.url;
 *
 * Caller picks the model (ppq.ai exposes many — `listModels("image")` is
 * available from the client if a UI wants to populate a dropdown).
 */

import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { createAccount, generateImage } from "@/lib/ppq/client";
import { ppqAccountStore } from "@/lib/ppq/storage";
import type { PpqImageRequest, PpqImageResponse } from "@/lib/ppq/types";

async function ensureAccountForCall() {
  const existing = ppqAccountStore.load();
  if (existing) return existing;
  const fresh = await createAccount();
  ppqAccountStore.save(fresh);
  return fresh;
}

export function usePpqImage(): UseMutationResult<
  PpqImageResponse,
  Error,
  PpqImageRequest
> {
  return useMutation({
    mutationFn: async (req) => {
      const { api_key } = await ensureAccountForCall();
      return generateImage(api_key, req);
    },
  });
}
