/**
 * Smoke test for `searchXUser` / `searchXQuery` — confirm that the
 * `/v1/data/x/tweets/user` and `/v1/data/x/tweets/search` PPQ
 * endpoints return structured tweet data and that our adapter maps
 * them to `SearchResult[]` correctly.
 *
 *   tsx tests/ai-services/probe-x-data-enrichment.ts
 */

import "../_shared/loadEnv";
import { searchXQuery, searchXUser } from "@/lib/ppq/search";

async function main(): Promise<void> {
  const apiKey =
    process.env.VITE_PPQ_API_KEY ?? process.env.PPQ_API_KEY ?? "";
  if (!apiKey) {
    console.error("[probe-x] No PPQ key in env. Set VITE_PPQ_API_KEY.");
    process.exit(1);
  }

  console.log("[probe-x] === searchXUser('ChroniclesRW') ===");
  const userResults = await searchXUser({
    apiKey,
    handle: "ChroniclesRW",
    maxResults: 5,
  });
  console.log(`[probe-x] ${userResults.length} results`);
  for (const r of userResults) {
    console.log("  -", r.publishedAt ?? "?", "·", r.source);
    console.log("    ", r.title);
    console.log("    ", r.url);
  }

  console.log(
    "\n[probe-x] === searchXQuery('Rwanda human rights') ===",
  );
  const queryResults = await searchXQuery({
    apiKey,
    query: "Rwanda human rights",
    maxResults: 5,
  });
  console.log(`[probe-x] ${queryResults.length} results`);
  for (const r of queryResults) {
    console.log("  -", r.publishedAt ?? "?", "·", r.source);
    console.log("    ", r.title);
    console.log("    ", r.url);
  }
}

main().catch((err) => {
  console.error("[probe-x] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
