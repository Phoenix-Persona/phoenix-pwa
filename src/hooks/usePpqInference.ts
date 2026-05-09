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
import { ppqAccountStore } from "@/lib/ppq/storage";
import type { PpqChatRequest, PpqChatResponse } from "@/lib/ppq/types";
import { createAccount } from "@/lib/ppq/client";

export const DEFAULT_INFERENCE_MODEL = "claude-sonnet-4.5";

export type PpqInferenceVars = Omit<PpqChatRequest, "model"> & {
  model?: string;
};

async function ensureAccountForCall() {
  const existing = ppqAccountStore.load();
  if (existing) return existing;
  const fresh = await createAccount();
  ppqAccountStore.save(fresh);
  return fresh;
}

export function usePpqInference(): UseMutationResult<
  PpqChatResponse,
  Error,
  PpqInferenceVars
> {
  return useMutation({
    mutationFn: async (vars) => {
      const { api_key } = await ensureAccountForCall();
      return chatCompletion(api_key, {
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
