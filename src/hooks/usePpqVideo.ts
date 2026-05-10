/**
 * Video generation via ppq.ai.
 *
 * Two layers:
 *
 *   1. `usePpqVideoSubmit()` — POSTs `/v1/videos` and returns the job id.
 *      Use this when the UI wants explicit control over polling.
 *   2. `usePpqVideoJob(id)` — TanStack `useQuery` that polls
 *      `/v1/videos/{id}` every few seconds until the status is `completed`
 *      or `failed`. The result `data?.url` is a signed URL the caller can
 *      drop into a `<video>` tag.
 *
 *   const { mutateAsync: submit } = usePpqVideoSubmit();
 *   const job = await submit({ model: "seedance-2-fast", prompt: "..." });
 *   const status = usePpqVideoJob(job.id); // polls automatically
 *
 * Defaults to `seedance-2-fast` — the Seedance 2 family is empirically
 * the only path on ppq.ai that produces all three of (a) image-to-video
 * conditioning that actually routes (Veo i2v returns 502, Kling i2v
 * works but is silent), (b) native lip-synced audio, and (c) character
 * + setting continuity across the seam from a conditioning frame.
 * `-fast` over `seedance-2` for dev iteration speed and lower cost;
 * promote to `seedance-2` only for hero / final renders. See
 * `tests/ai-services/probe-seedance-i2v-with-speech.ts` for the
 * minimum-reproducible test that established this.
 *
 * Override via `model` on the request to use any other catalog id.
 */

import { useMutation, useQuery, type UseMutationResult } from "@tanstack/react-query";

import { getVideoStatus, submitVideo } from "@/lib/ppq/client";
import { queryKeys } from "@/lib/queryKeys";
import type {
  PpqVideoRequest,
  PpqVideoStatusResponse,
  PpqVideoSubmitResponse,
} from "@/lib/ppq/types";
import { usePpqAccount } from "./usePpqAccount";

export const DEFAULT_VIDEO_MODEL = "seedance-2-fast";

export type PpqVideoSubmitVars = Omit<PpqVideoRequest, "model"> & {
  model?: string;
};

export function usePpqVideoSubmit(): UseMutationResult<
  PpqVideoSubmitResponse,
  Error,
  PpqVideoSubmitVars
> {
  const { ensureAccount } = usePpqAccount();

  return useMutation({
    mutationFn: async (vars) => {
      const { api_key } = await ensureAccount();
      return submitVideo(api_key, {
        ...vars,
        model: vars.model ?? DEFAULT_VIDEO_MODEL,
      });
    },
  });
}

/**
 * Poll a single video job until it terminates. Returns the standard react-
 * query state plus a derived `isTerminal` boolean.
 *
 * Polling cadence: 4s while pending. Stops automatically once the status is
 * `completed` or `failed`.
 */
export function usePpqVideoJob(id: string | undefined, intervalMs = 4_000) {
  const { account } = usePpqAccount();

  const query = useQuery<PpqVideoStatusResponse>({
    queryKey: queryKeys.ppq.video(account?.credit_id, id),
    enabled: Boolean(id && account?.api_key),
    queryFn: async ({ signal }) => {
      if (!id) throw new Error("missing video id");
      if (!account) throw new Error("no ppq account");
      return getVideoStatus(account.api_key, id, { signal });
    },
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (status === "completed" || status === "failed") return false;
      return intervalMs;
    },
  });

  const status = query.data?.status;
  return {
    ...query,
    isTerminal: status === "completed" || status === "failed",
  };
}
