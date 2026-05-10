/**
 * Research search hook — wraps PPQ's data-enrichment / web-search via
 * `searchWeb()`.
 *
 * Pulls the operator's PPQ api_key from `usePpqAccount` (env →
 * envelope → cache → mint, same path as image / video / inference) so
 * the Research sheet doesn't need to thread credentials.
 *
 *   const research = useResearchSearch();
 *   const results = await research.mutateAsync({
 *     query: "Rwanda human rights",
 *     lens: "last 7 days",
 *   });
 */

import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { searchWeb, type SearchResult } from "@/lib/ppq/search";

import { usePpqAccount } from "./usePpqAccount";

export interface ResearchSearchInput {
  query: string;
  lens?: string;
  maxResults?: number;
  signal?: AbortSignal;
}

export function useResearchSearch(): UseMutationResult<
  SearchResult[],
  Error,
  ResearchSearchInput
> {
  const { account, ensureAccount } = usePpqAccount();

  return useMutation({
    mutationFn: async (input) => {
      const acct = account ?? (await ensureAccount());
      return searchWeb({
        apiKey: acct.api_key,
        query: input.query,
        lens: input.lens,
        maxResults: input.maxResults,
        options: input.signal ? { signal: input.signal } : undefined,
      });
    },
  });
}
