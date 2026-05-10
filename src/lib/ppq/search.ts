/**
 * PPQ data-enrichment / web-search helper.
 *
 * Wraps `chatCompletion` with the `web` plugin (`plugins: [{ id: "web",
 * max_results }]`) so the model is grounded in live results — including
 * recent X / Twitter posts surfaced through PPQ's data-enrichment
 * passthrough.
 *
 * Exposed as a single function `searchWeb()` that asks the model to
 * return a strict-JSON array of `{ title, url, excerpt, source,
 * published_at? }`. Keeping the structured-output contract on the
 * client side (instead of relying on a not-fully-documented citations
 * field) makes the parse robust across model swaps and PPQ response
 * tweaks.
 *
 * Used by the Research sheet in the Dashboard composer to surface
 * "Rwanda human rights" / "Human Rights Watch" / etc. coverage so the
 * operator can ground a fresh persona post in real reporting before
 * publishing.
 */

import { chatCompletion, type PpqRequestOptions } from "./client";
import type { PpqChatRequest } from "./types";

export interface SearchResult {
  /** Headline or post title. */
  title: string;
  /** Canonical URL (HTTPS only — anything else is dropped). */
  url: string;
  /** Two-sentence-max summary the model writes for the result. */
  excerpt: string;
  /**
   * Publisher / handle. For news this is "Human Rights Watch", "Reuters",
   * etc. For X posts this is "@hrw" / "@hrf" style.
   */
  source: string;
  /** ISO 8601 if the model surfaces a date; omitted otherwise. */
  publishedAt?: string;
}

export interface SearchWebArgs {
  apiKey: string;
  /** Free-text query — what the operator typed or tapped. */
  query: string;
  /**
   * Optional "lens" to narrow the model's interpretation. We bake this
   * into the system prompt so the model knows to weight trusted
   * human-rights / press-freedom sources first.
   */
  lens?: string;
  /** Max items to return. Default 8 — enough to skim, cheap to render. */
  maxResults?: number;
  /** Override the default model. */
  model?: string;
  /** Standard request controls (signal etc.). */
  options?: PpqRequestOptions;
}

/**
 * Default model — `claude-sonnet-4.5` is the chat workhorse already
 * used elsewhere in the app, and PPQ honors the `web` plugin against
 * it. Override via `args.model` if a future swap is needed.
 */
const DEFAULT_SEARCH_MODEL = "claude-sonnet-4.5";

const DEFAULT_MAX_RESULTS = 8;

const SYSTEM_PROMPT = [
  "You are a research assistant for a journalist composing a Nostr post.",
  "You are given a topic plus a recency lens. Use the web-search tool",
  "you have access to (PPQ data-enrichment / X-search) to surface the",
  "most relevant RECENT items.",
  "",
  "Bias the result set toward trusted human-rights and press-freedom",
  "sources first when relevant: Human Rights Watch, Human Rights",
  "Foundation, Amnesty International, Reporters Without Borders,",
  "Committee to Protect Journalists, Freedom House, Reuters, AP, BBC,",
  "AFP, and the verified accounts of recognized journalists. Include X",
  "/ Twitter posts from those accounts when applicable.",
  "",
  "Avoid speculation, opinion blogs, and unverified social posts.",
  "Prefer the original publication URL over aggregator links.",
  "",
  "Return STRICT JSON only — no prose around it, no code fences. Schema:",
  "{",
  '  "results": [',
  "    {",
  '      "title":     <string, headline or post text>,',
  '      "url":       <string, canonical https URL>,',
  '      "excerpt":   <string, ~2 sentences max, no markdown>,',
  '      "source":    <string, e.g. "Human Rights Watch" or "@hrw">,',
  '      "published_at": <ISO 8601 string, optional>',
  "    }",
  "  ]",
  "}",
  "",
  "If the search returns nothing relevant, return { \"results\": [] }.",
  "Never fabricate URLs.",
].join("\n");

export async function searchWeb(args: SearchWebArgs): Promise<SearchResult[]> {
  const maxResults = args.maxResults ?? DEFAULT_MAX_RESULTS;
  const userMessage =
    args.lens?.trim()
      ? `Topic: ${args.query.trim()}\nLens: ${args.lens.trim()}\nReturn up to ${maxResults} items.`
      : `Topic: ${args.query.trim()}\nReturn up to ${maxResults} items.`;

  const req: PpqChatRequest = {
    model: args.model ?? DEFAULT_SEARCH_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    plugins: [{ id: "web", max_results: maxResults }],
    // Slightly hotter than 0 so the model tries harder when the search
    // returns sparse / off-topic candidates, but cool enough to keep
    // the JSON shape stable.
    temperature: 0.2,
    max_tokens: 1500,
  };

  const response = await chatCompletion(args.apiKey, req, args.options);
  const text = response.choices?.[0]?.message?.content ?? "";
  return parseSearchResponse(text);
}

/* ---------- parsing ---------- */

/**
 * Tolerant JSON extractor. Same pattern as the script-segment parser
 * in `src/lib/video/generateMonologueScript.ts`: if the model wraps
 * its JSON in markdown fences or stray prose, find the first `{...}`
 * block and parse that.
 */
function parseSearchResponse(text: string): SearchResult[] {
  const jsonText = extractFirstJsonObject(text);
  if (!jsonText) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const obj = parsed as Record<string, unknown>;
  const raw = obj.results;
  if (!Array.isArray(raw)) return [];

  const out: SearchResult[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const url = sanitizeHttpsUrl(r.url);
    if (!url) continue;
    const title = pickString(r.title, 200);
    const excerpt = pickString(r.excerpt, 600);
    const source = pickString(r.source, 100);
    const publishedAt = pickString(r.published_at, 64);
    if (!title || !excerpt || !source) continue;
    out.push({
      title,
      url,
      excerpt,
      source,
      ...(publishedAt ? { publishedAt } : {}),
    });
  }
  return out;
}

function pickString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function sanitizeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value.trim());
    if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
  } catch {
    /* fall through */
  }
  return null;
}

function extractFirstJsonObject(text: string): string | undefined {
  const start = text.indexOf("{");
  if (start === -1) return undefined;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return undefined;
}
