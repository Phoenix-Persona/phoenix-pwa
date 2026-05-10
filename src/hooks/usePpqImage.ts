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

import { generateImage } from "@/lib/ppq/client";
import type { PpqImageRequest, PpqImageResponse } from "@/lib/ppq/types";
import { usePpqAccount } from "./usePpqAccount";

export function usePpqImage(): UseMutationResult<
  PpqImageResponse,
  Error,
  PpqImageRequest
> {
  // Resolution lives in usePpqAccount: env > operator envelope > cache > mint.
  const { account, ensureAccount } = usePpqAccount();

  return useMutation({
    mutationFn: async (req) => {
      const acct = account ?? (await ensureAccount());
      return generateImage(acct.api_key, req);
    },
  });
}
