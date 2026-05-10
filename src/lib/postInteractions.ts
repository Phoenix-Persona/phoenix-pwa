import type { NostrEvent } from "@nostrify/nostrify";

export interface GroupedInteractions {
  replies: NostrEvent[];
  reactions: NostrEvent[];
  zaps: NostrEvent[];
}

export function groupInteractions(events: NostrEvent[]): GroupedInteractions {
  const replies: NostrEvent[] = [];
  const reactions: NostrEvent[] = [];
  const zaps: NostrEvent[] = [];
  for (const e of events) {
    if (e.kind === 1) replies.push(e);
    else if (e.kind === 7) reactions.push(e);
    else if (e.kind === 9735) zaps.push(e);
  }
  // Newest first.
  const byNewest = (a: NostrEvent, b: NostrEvent) => b.created_at - a.created_at;
  replies.sort(byNewest);
  reactions.sort(byNewest);
  zaps.sort(byNewest);
  return { replies, reactions, zaps };
}

/**
 * Decode the amount baked into a BOLT-11 invoice prefix.
 *
 * Format: `ln<prefix><amount><multiplier>1<rest>`. The prefix is one of
 * `lnbc`/`lntb`/`lnbcrt`/`lnsb` (mainnet/testnet/regtest/signet). The
 * amount is integer; the optional multiplier is `m` (10⁻³), `u` (10⁻⁶),
 * `n` (10⁻⁹), or `p` (10⁻¹²) BTC. Returns sats (rounded), or undefined
 * for amount-less invoices and malformed input.
 */
export function parseBolt11AmountSats(invoice: string): number | undefined {
  const lower = invoice.toLowerCase();
  if (!lower.startsWith("ln")) return undefined;
  // Bech32 forbids '1' in the data part, so the last '1' in the
  // invoice is always the HRP/data separator. Anything before it is
  // the human-readable prefix; the data after it is irrelevant for
  // amount extraction.
  const sepIdx = lower.lastIndexOf("1");
  if (sepIdx === -1) return undefined;
  const hrp = lower.slice(0, sepIdx);
  // HRP shape: ln<network><amount?><multiplier?> — skip alphabetic
  // network prefix (`bc`, `tb`, `bcrt`, `sb`, …).
  let i = 2;
  while (i < hrp.length && !/[0-9]/.test(hrp[i])) i++;
  if (i === hrp.length) return undefined; // amount-less invoice
  const remainder = hrp.slice(i);
  const match = /^([0-9]+)([munp])?$/.exec(remainder);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const multiplier = match[2];
  // 1 BTC = 10^8 sats. Multipliers shift the BTC amount.
  let sats: number;
  switch (multiplier) {
    case "m":
      sats = amount * 100_000;
      break;
    case "u":
      sats = amount * 100;
      break;
    case "n":
      sats = amount / 10;
      break;
    case "p":
      sats = amount / 10_000;
      break;
    default:
      // No multiplier — amount is whole BTC.
      sats = amount * 100_000_000;
  }
  return Math.round(sats);
}

/**
 * Resolve the sats amount for a kind 9735 zap receipt.
 *
 * Prefers the receipt's `bolt11` tag (the actual paid invoice — canonical
 * for any settled zap). Falls back to the embedded zap request's
 * `amount` tag (millisats), per NIP-57. Returns undefined if neither is
 * available or parseable.
 */
export function extractZapAmountSats(receipt: NostrEvent): number | undefined {
  const bolt11 = receipt.tags.find((t) => t[0] === "bolt11")?.[1];
  if (bolt11) {
    const fromInvoice = parseBolt11AmountSats(bolt11);
    if (fromInvoice !== undefined) return fromInvoice;
  }

  const description = receipt.tags.find((t) => t[0] === "description")?.[1];
  if (!description) return undefined;
  let request: unknown;
  try {
    request = JSON.parse(description);
  } catch {
    return undefined;
  }
  if (!request || typeof request !== "object") return undefined;
  const tags = (request as { tags?: unknown }).tags;
  if (!Array.isArray(tags)) return undefined;
  const amountTag = tags.find(
    (t) => Array.isArray(t) && t[0] === "amount" && typeof t[1] === "string",
  ) as [string, string] | undefined;
  if (!amountTag) return undefined;
  const millisats = Number(amountTag[1]);
  if (!Number.isFinite(millisats) || millisats <= 0) return undefined;
  return Math.round(millisats / 1000);
}

/**
 * Per NIP-57: the original zap request (kind 9734) `content` field
 * carries an optional comment from the zapper. Returns it if present
 * and non-empty.
 */
export function extractZapComment(receipt: NostrEvent): string | undefined {
  const description = receipt.tags.find((t) => t[0] === "description")?.[1];
  if (!description) return undefined;
  let request: unknown;
  try {
    request = JSON.parse(description);
  } catch {
    return undefined;
  }
  if (!request || typeof request !== "object") return undefined;
  const content = (request as { content?: unknown }).content;
  if (typeof content !== "string" || content.trim().length === 0) return undefined;
  return content;
}

/**
 * Per NIP-57: the zap is attributable to whoever signed the embedded
 * kind 9734 request, NOT the kind 9735 receipt's pubkey (which is the
 * zap-provider LNURL server). Falls back to the receipt's pubkey if
 * the description is malformed.
 */
export function extractZapperPubkey(receipt: NostrEvent): string {
  const description = receipt.tags.find((t) => t[0] === "description")?.[1];
  if (description) {
    try {
      const request = JSON.parse(description);
      if (request && typeof request === "object") {
        const pubkey = (request as { pubkey?: unknown }).pubkey;
        if (typeof pubkey === "string" && /^[0-9a-f]{64}$/i.test(pubkey)) {
          return pubkey.toLowerCase();
        }
      }
    } catch {
      /* fall through */
    }
  }
  return receipt.pubkey;
}

export function formatSatsCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}
