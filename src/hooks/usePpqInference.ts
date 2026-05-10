/**
 * General-purpose inference hook (ppq.ai chat completions).
 *
 *   const { mutateAsync: infer } = usePpqInference();
 *   const reply = await infer({
 *     model: "claude-sonnet-4.5",
 *     messages: [{ role: "user", content: "hello" }],
 *   });
 *
 * The hook will auto-create a ppq.ai account on first use if one hasn't been
 * persisted yet, so callers don't need to coordinate with `usePpqAccount`.
 */

import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { chatCompletion } from "@/lib/ppq/client";
import type { PpqChatRequest, PpqChatResponse } from "@/lib/ppq/types";
import { usePpqAccount } from "./usePpqAccount";

export const DEFAULT_INFERENCE_MODEL = "claude-sonnet-4.5";

export type PpqInferenceVars = Omit<PpqChatRequest, "model"> & {
  model?: string;
};

export function usePpqInference(): UseMutationResult<
  PpqChatResponse,
  Error,
  PpqInferenceVars
> {
  // Resolution lives in usePpqAccount: env > operator envelope > cache > mint.
  const { account, ensureAccount } = usePpqAccount();

  return useMutation({
    mutationFn: async (vars) => {
      const acct = account ?? (await ensureAccount());
      return chatCompletion(acct.api_key, {
        model: vars.model ?? DEFAULT_INFERENCE_MODEL,
        messages: vars.messages,
        plugins: vars.plugins,
        temperature: vars.temperature,
        max_tokens: vars.max_tokens,
      });
    },
  });
}

/**
 * Convenience extractor — most callers just want the assistant's text.
 */
export function getInferenceText(res: PpqChatResponse): string {
  return res.choices?.[0]?.message?.content ?? "";
}
