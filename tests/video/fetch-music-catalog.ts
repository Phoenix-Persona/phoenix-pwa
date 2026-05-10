/**
 * One-shot fetcher for the curator's kind-34011 background-music
 * catalog. Connects to a handful of public relays, asks each for
 *
 *   { kinds: [34011], authors: [<curator hex>], "#d": ["zuka-bg-music-v1"] }
 *
 * and prints the first event it sees (with parsed tags + content).
 *
 * Run:
 *   tsx tests/video/fetch-music-catalog.ts
 *
 * Optional flags:
 *   --relay <url>        add a relay (repeatable)
 *   --kind <num>         override kind (default 34011)
 *   --author <hex>       override author pubkey (default the curator)
 *   --d <slug>           override d-tag (default zuka-bg-music-v1)
 *   --json               print the full event as JSON only (no commentary)
 *
 * Exit 0 if found; non-zero if no relay returned anything within the
 * timeout window.
 */

import { Relay } from "nostr-tools/relay";
// nostr-tools exports `useWebSocketImplementation` (a config setter,
// NOT a React hook). The name trips eslint's rules-of-hooks, so we
// alias on import to keep the linter happy.
import { useWebSocketImplementation as setNostrWebSocket } from "nostr-tools/relay";
import WebSocketImpl from "ws";

setNostrWebSocket(WebSocketImpl as unknown as typeof WebSocket);

interface CliArgs {
  relays: string[];
  kind: number;
  author: string;
  dTag: string;
  json: boolean;
  timeoutMs: number;
}

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://nostr.wine",
  "wss://relay.snort.social",
  "wss://relay.nostr.bg",
  "wss://nostr.mom",
];

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    relays: [...DEFAULT_RELAYS],
    kind: 34011,
    author: "e4ae0200bfdefd7dd5e477d4eea9bda1049d28489243eda210eec9bd63d65f5a",
    dTag: "zuka-bg-music-v1",
    json: false,
    timeoutMs: 12_000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--relay":
        args.relays.push(next());
        break;
      case "--kind":
        args.kind = Number(next());
        break;
      case "--author":
        args.author = next();
        break;
      case "--d":
        args.dTag = next();
        break;
      case "--json":
        args.json = true;
        break;
      case "--timeout":
        args.timeoutMs = Number(next());
        break;
    }
  }
  return args;
}

interface NostrEvent {
  id: string;
  pubkey: string;
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  sig: string;
}

async function queryRelay(
  url: string,
  filter: Record<string, unknown>,
  timeoutMs: number,
): Promise<NostrEvent | null> {
  let relay: Relay | null = null;
  try {
    relay = await Relay.connect(url);
  } catch (err) {
    if (!parseArgs(process.argv.slice(2)).json) {
      console.warn(`[catalog] ${url} connect failed:`, (err as Error).message);
    }
    return null;
  }
  return new Promise<NostrEvent | null>((resolve) => {
    const timer = setTimeout(() => {
      sub.close();
      relay?.close();
      resolve(null);
    }, timeoutMs);
    const sub = relay.subscribe([filter as Parameters<Relay["subscribe"]>[0][number]], {
      onevent(e) {
        clearTimeout(timer);
        sub.close();
        relay?.close();
        resolve(e as unknown as NostrEvent);
      },
      oneose() {
        clearTimeout(timer);
        sub.close();
        relay?.close();
        resolve(null);
      },
    });
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const filter = {
    kinds: [args.kind],
    authors: [args.author],
    "#d": [args.dTag],
    limit: 1,
  };

  if (!args.json) {
    console.log("[catalog] querying", { filter, relays: args.relays });
  }

  const winner = await Promise.race(
    args.relays.map((url) =>
      queryRelay(url, filter, args.timeoutMs).then((ev) => (ev ? { url, ev } : null)),
    ),
  );

  // Race resolves first; if it's null we may still have other slow
  // relays — wait the rest to give them a chance.
  let found: { url: string; ev: NostrEvent } | null = winner;
  if (!found) {
    const all = await Promise.all(
      args.relays.map((url) =>
        queryRelay(url, filter, args.timeoutMs).then((ev) => (ev ? { url, ev } : null)),
      ),
    );
    found = all.find((x): x is { url: string; ev: NostrEvent } => Boolean(x)) ?? null;
  }

  if (!found) {
    if (args.json) {
      console.log(JSON.stringify({ error: "not found" }));
    } else {
      console.error("[catalog] no relay returned an event within the timeout");
    }
    process.exit(2);
  }

  if (args.json) {
    console.log(JSON.stringify(found.ev, null, 2));
    return;
  }

  const ev = found.ev;
  console.log("\n[catalog] FOUND on", found.url);
  console.log("  id        ", ev.id);
  console.log("  kind      ", ev.kind);
  console.log("  created_at", new Date(ev.created_at * 1000).toISOString());
  console.log("  pubkey    ", ev.pubkey);
  console.log("  tags      ");
  for (const t of ev.tags) {
    console.log("    ", JSON.stringify(t));
  }
  console.log("  content (raw)");
  console.log(indent(ev.content, 4));

  // Best-effort JSON parse of content.
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(ev.content);
  } catch {
    /* ignore */
  }
  if (parsed) {
    console.log("\n[catalog] content parsed as JSON:");
    console.log(indent(JSON.stringify(parsed, null, 2), 2));
  }

  // Surface any URLs we can find — covers both tag-based and
  // content-JSON shapes.
  const urls = collectUrls(ev);
  if (urls.length > 0) {
    console.log("\n[catalog] URLs found in event:");
    for (const u of urls) console.log("  -", u);
  }
}

function indent(s: string, n: number): string {
  const pad = " ".repeat(n);
  return s
    .split("\n")
    .map((l) => pad + l)
    .join("\n");
}

function collectUrls(ev: NostrEvent): string[] {
  const out = new Set<string>();
  const re = /https?:\/\/[^\s"'<>]+/g;
  for (const tag of ev.tags) {
    for (const part of tag) {
      const m = part.match(re);
      if (m) for (const u of m) out.add(u);
    }
  }
  for (const m of ev.content.matchAll(re)) out.add(m[0]);
  return [...out];
}

main().catch((err) => {
  console.error("[catalog] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
