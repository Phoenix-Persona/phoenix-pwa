/**
 * Research search hook — wraps PPQ's data-enrichment family.
 *
 * Discriminated input so the caller picks the source:
 *   - `{ source: "web", query, lens? }`
 *       Routes to `searchWeb` (Claude + the `web` plugin against
 *       Exa.AI). Best for institutional sources that publish HTML
 *       articles — HRW, Amnesty, Reuters, etc.
 *   - `{ source: "x-user", handle }`
 *       Routes to `searchXUser` → `/v1/data/x/tweets/user`. Returns
 *       real recent tweets from the handle, with article URLs from
 *       the entity entries when present.
 *   - `{ source: "x-query", query }`
 *       Routes to `searchXQuery` → `/v1/data/x/tweets/search` with
 *       the `words` filter. Best for cross-handle X search like
 *       "Rwanda human rights".
 *
 * Pulls the operator's PPQ api_key from `usePpqAccount` (env →
 * envelope → cache → mint) so callers don't thread credentials.
 */

import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import {
  searchWeb,
  searchXQuery,
  searchXUser,
  type SearchResult,
} from "@/lib/ppq/search";

import { usePpqAccount } from "./usePpqAccount";

export type ResearchSearchInput =
  | {
      source: "web";
      query: string;
      lens?: string;
      maxResults?: number;
      signal?: AbortSignal;
    }
  | {
      source: "x-user";
      handle: string;
      maxResults?: number;
      signal?: AbortSignal;
    }
  | {
      source: "x-query";
      query: string;
      maxResults?: number;
      signal?: AbortSignal;
    };

export function useResearchSearch(): UseMutationResult<
  SearchResult[],
  Error,
  ResearchSearchInput
> {
  const { account, ensureAccount } = usePpqAccount();

  return useMutation({
    mutationFn: async (input) => {
      const acct = account ?? (await ensureAccount());
      const options = input.signal ? { signal: input.signal } : undefined;
      switch (input.source) {
        case "web":
          return searchWeb({
            apiKey: acct.api_key,
            query: input.query,
            lens: input.lens,
            maxResults: input.maxResults,
            options,
          });
        case "x-user":
          return searchXUser({
            apiKey: acct.api_key,
            handle: input.handle,
            maxResults: input.maxResults,
            options,
          });
        case "x-query":
          return searchXQuery({
            apiKey: acct.api_key,
            query: input.query,
            maxResults: input.maxResults,
            options,
          });
      }
    },
  });
}
