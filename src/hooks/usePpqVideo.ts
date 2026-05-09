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
 *   const job = await submit({ model: "veo3", prompt: "..." });
 *   const status = usePpqVideoJob(job.id); // polls automatically
 *
 * Defaults to `veo3-fast` if the caller omits the model — Veo 3 quality is
 * available by passing `model: "veo3"` explicitly.
 */

import { useMutation, useQuery, type UseMutationResult } from "@tanstack/react-query";

import { createAccount, getVideoStatus, submitVideo } from "@/lib/ppq/client";
import { ppqAccountStore } from "@/lib/ppq/storage";
import type {
  PpqVideoRequest,
  PpqVideoStatusResponse,
  PpqVideoSubmitResponse,
} from "@/lib/ppq/types";

export const DEFAULT_VIDEO_MODEL = "veo3-fast";

async function ensureAccountForCall() {
  const existing = ppqAccountStore.load();
  if (existing) return existing;
  const fresh = await createAccount();
  ppqAccountStore.save(fresh);
  return fresh;
}

export type PpqVideoSubmitVars = Omit<PpqVideoRequest, "model"> & {
  model?: string;
};

export function usePpqVideoSubmit(): UseMutationResult<
  PpqVideoSubmitResponse,
  Error,
  PpqVideoSubmitVars
> {
  return useMutation({
    mutationFn: async (vars) => {
      const { api_key } = await ensureAccountForCall();
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
  const query = useQuery<PpqVideoStatusResponse>({
    queryKey: ["ppq", "video", id],
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      if (!id) throw new Error("missing video id");
      const acct = ppqAccountStore.load();
      if (!acct) throw new Error("no ppq account");
      return getVideoStatus(acct.api_key, id, { signal });
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
