/**
 * Thin client for PPQ's data-enrichment endpoints (the `/v1/data/...`
 * family that wraps real third-party data sources — X, Apollo, Exa,
 * Reddit, Firecrawl, etc.).
 *
 * Today this only exposes the X / Twitter slice we need for the
 * Research panel. Full catalog at `GET /v1/data/endpoints`; add
 * wrappers here as we wire more.
 *
 * Per the PPQ docs:
 *   "Prepend /v1/data to each path. POST endpoints accept a JSON
 *    body; GET endpoints use query parameters."
 *
 * Pricing as of writing: $0.0115 per X call, much cheaper than the
 * `web` plugin's $0.02 Exa fallback AND it returns structured tweet
 * objects instead of LLM prose around aggregator results.
 */

import { request, type PpqRequestOptions } from "./client";

const DATA_BASE = "/v1/data";

/* ---------- response shapes ---------- */

/**
 * A single tweet as returned by `/v1/data/x/tweets/...` endpoints.
 * Mirrors the X v2 API tweet object shape. Fields we don't currently
 * use are still typed so the response can be passed around without
 * lossy `unknown` casts at the call sites.
 */
export interface XTweet {
  id: string;
  text: string;
  /** Twitter-format timestamp, e.g. "Sun May 10 15:15:25 +0000 2026". */
  created_at: string;
  author_id: string;
  conversation_id?: string;
  lang?: string;
  possibly_sensitive?: boolean;
  reply_settings?: string;
  in_reply_to_user_id?: string;
  edit_history_tweet_ids?: string[];
  public_metrics?: {
    retweet_count?: number;
    reply_count?: number;
    like_count?: number;
    quote_count?: number;
    bookmark_count?: number;
    impression_count?: number;
  };
  entities?: {
    urls?: Array<{
      start?: number;
      end?: number;
      url: string;
      expanded_url?: string;
      display_url?: string;
    }>;
    mentions?: Array<{ username: string }>;
    hashtags?: Array<{ tag: string }>;
  };
  media_metadata?: Array<{
    media_key: string;
    media_url?: string;
  }>;
  referenced_tweets?: Array<{ type: string; id: string }>;
}

export interface XTweetListResponse {
  data?: XTweet[];
  /** Optional cursor for pagination — not used yet. */
  meta?: { next_token?: string; result_count?: number };
}

export interface XUser {
  id: string;
  name: string;
  username: string;
  description?: string;
  profile_image_url?: string;
  verified?: boolean;
  public_metrics?: {
    followers_count?: number;
    following_count?: number;
    tweet_count?: number;
    listed_count?: number;
  };
}

export interface XUserResponse {
  data?: XUser;
}

/* ---------- functions ---------- */

/**
 * Recent tweets from a single handle.
 * GET /v1/data/x/tweets/user?username=<handle>&max_results=<n>
 */
export async function getXUserTweets(
  apiKey: string,
  args: {
    username: string;
    /** 1..100. Server caps; 5–10 is a good default for the Research UI. */
    maxResults?: number;
    /** Optional pagination cursor. */
    paginationToken?: string;
  },
  options: PpqRequestOptions = {},
): Promise<XTweetListResponse> {
  const params = new URLSearchParams({ username: args.username });
  if (args.maxResults != null) {
    params.set("max_results", String(args.maxResults));
  }
  if (args.paginationToken) {
    params.set("pagination_token", args.paginationToken);
  }
  const { data } = await request<XTweetListResponse>(
    `${DATA_BASE}/x/tweets/user?${params.toString()}`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}` },
      ...options,
    },
  );
  return data ?? {};
}

/**
 * Free-form X search.
 * GET /v1/data/x/tweets/search?<filters>&max_results=<n>
 *
 * The upstream provider rejects a bare `query` param — it requires
 * structured filters: at least one of `words`, `phrase`, `anyWords`,
 * `noneWords`, `hashtags`, `from`, `to`, `mentioning`, `minReplies`,
 * `minLikes`, `minReposts`, `since`, `until`.
 */
export interface XSearchFilters {
  words?: string;
  phrase?: string;
  anyWords?: string;
  noneWords?: string;
  hashtags?: string;
  from?: string;
  to?: string;
  mentioning?: string;
  minReplies?: number;
  minLikes?: number;
  minReposts?: number;
  since?: string;
  until?: string;
  maxResults?: number;
}

export async function searchXTweets(
  apiKey: string,
  filters: XSearchFilters,
  options: PpqRequestOptions = {},
): Promise<XTweetListResponse> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v == null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (k === "maxResults") {
      params.set("max_results", String(v));
    } else {
      params.set(k, String(v));
    }
  }
  const { data } = await request<XTweetListResponse>(
    `${DATA_BASE}/x/tweets/search?${params.toString()}`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}` },
      ...options,
    },
  );
  return data ?? {};
}

/**
 * Profile lookup for a single handle.
 * GET /v1/data/x/users/by/username?username=<handle>
 */
export async function getXUserByUsername(
  apiKey: string,
  username: string,
  options: PpqRequestOptions = {},
): Promise<XUserResponse> {
  const params = new URLSearchParams({ username });
  const { data } = await request<XUserResponse>(
    `${DATA_BASE}/x/users/by/username?${params.toString()}`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}` },
      ...options,
    },
  );
  return data ?? {};
}

/* ---------- helpers ---------- */

/**
 * Convert Twitter's timestamp ("Sun May 10 15:15:25 +0000 2026") into
 * an ISO 8601 string. Returns the original input on parse failure
 * rather than throwing.
 */
export function twitterDateToIso(raw: string): string {
  if (!raw) return raw;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.toISOString() : raw;
}

/**
 * Build a public x.com permalink for a tweet. Username is best-effort —
 * the X v2 schema doesn't put the handle on the tweet itself, only
 * `author_id`. Caller usually has the username from the search input.
 */
export function tweetPermalink(username: string, tweetId: string): string {
  return `https://x.com/${username}/status/${tweetId}`;
}
