# Spike C — Part 1: Nostr crypto round-trip

**Owner:** Derek
**Phase:** 0 (Hours 0–2)
**Companion file:** `spikes/nostr-spark/nostr/round-trip.test.ts`
**Status:** Complete (offline). Live-relay verification deferred to a runbook below.
**Companion spike:** Jim — Spike C Part 2 (Breez Spark in browser)

This document captures what we proved offline and what we still owe live-relay. The goal of the spike was to retire risk on the cryptographic patterns Zuka V1 depends on **before** the persona library rewrite shipped — that constraint slipped because Phase 1a turned into a same-day rewrite, but the spike still validates the patterns the rewrite ended up using.

---

## What was tested

| # | Behavior | Result |
|---|---|---|
| 1 | NIP-44 self-encrypt → publish-shape envelope → decrypt → parse → derive-verify | ✅ |
| 2 | Different user attempts to decrypt → `null` (not an error, the scan loop expects null) | ✅ |
| 3 | Other-app NIP-78 payload (e.g. Habla draft) decrypts but parses as null | ✅ |
| 4 | Tampered envelope (persona.pubkey ≠ derive(persona.nsec)) parses as null | ✅ |
| 5 | NIP-49 ncryptsec round-trip at low log_n (functional check) | ✅ |
| 6 | NIP-49 ncryptsec round-trip at log_n=18 (production default, with timing) | ✅ |
| 7 | NIP-44 self-encrypt latency for a typical envelope (50-op average) | ✅ |
| 8 | Scan-and-decrypt over 100 candidate events, cache off vs. on | ✅ (268× speedup warm) |

All 8 cases run under `npm test` as `spikes/nostr-spark/nostr/round-trip.test.ts`. The benchmark cases log their numbers via `console.log` so the test runner doesn't assert on absolute timing (system-load dependent), but the numbers go below.

---

## Locked patterns

### NIP-44 self-encryption

The user's signer encrypts to its own pubkey. Author == recipient is the entire trick: the encrypted backup is unreadable to anyone but the user, while still living in plaintext kind 30078 events on public relays.

```ts
// Production code (src/lib/personaCrypto.ts)
const ciphertext = await user.signer.nip44.encrypt(
  user.pubkey,                       // recipient is self
  JSON.stringify(envelope)
);
```

The spike used a `makeSelfSigner(skBytes)` helper that exposes `nip44.encrypt/decrypt` against a `getConversationKey(self, self)`. This matches what the production signer does at runtime — Nostrify's `NUser.fromNsecLogin` ultimately calls into `nostr-tools/nip44` the same way, just routed through the signer's interface.

**Performance:** 0.06ms per encrypt operation on this dev box. Decryption is the same shape. Negligible vs. NIP-49 below.

### NIP-49 at-rest

Used in two distinct places:

1. **At-rest user nsec wrapping** — `phoenix:user:ncryptsec` in localStorage. log_n=18, ksb=0x02. Wraps a freshly generated user nsec; gets unwrapped at first signer use of a session via `<UnlockGate>`.
2. **Backup export** — Phase 3 download-backup flow uses the same `nostr-tools/nip49` primitive with a separate passphrase. Different code path, same crypto.

**Performance (this dev box, WSL Linux on a recent x86_64):**

| log_n | encrypt | decrypt | Notes |
|---|---|---|---|
| 18 | **682ms** | **674ms** | production default |
| 8  | <30ms (test mode) | <10ms | test mode only — not security-meaningful |

The 682ms desktop number is **70% slower than the plan's "~400ms" estimate**. Two implications for Phase 1b's UX:

- **Spinner discipline matters.** The signup-passphrase step and `<UnlockGate>` both yield to the event loop with `setTimeout(0)` before kicking off scrypt. That stays. Without it, the spinner doesn't paint until after scrypt returns — the user thinks the button is broken.
- **Mobile latency is unmeasured.** A typical mid-range Android with half the single-core IPC will likely be 1.4–2 seconds. **This is a known Phase 1 acceptance risk.** The mitigation (already in `tasks/derek-plan.md`): WebWorker-offload scrypt if mobile testing comes back painful. The component already structures the spinner correctly to handle the latency; the worker move is an internal swap.

**Caveat:** these timings are from a single dev box, not a calibrated benchmark. Real numbers should come from Anaïse's phone before the demo.

### kind 30078 envelope shape (privacy-preserving)

Per Derek's locked decision (`tasks/derek-plan.md` §2): the envelope reveals **nothing Zuka-specific from the outside**.

```jsonc
{
  "kind": 30078,
  "tags": [
    ["d", "<random-uuid-v4>"]   // the only tag
  ],
  "content": "<NIP-44 ciphertext>"
}
```

No `t:phoenix-persona`, no `alt:`, no `client:`. The spike's first test asserts `template.tags.map(t => t[0])` is exactly `["d"]`, so a future regression that adds discovery tags will trip the test before it ships.

**What this preserves.** A relay observer can count "user has N kind 30078 events" but cannot say "M of N are Zuka personas" without decryption. Anyone who learns the persona pubkey separately cannot reverse-link to the user by querying the relay for that string. The same holds for kind 1 persona posts — generic topical tags only, no Zuka client tag.

**The cost.** No tag-filter shortcut for persona discovery. Multi-persona load must `query → decrypt-each → filter`. The cache below is what makes that affordable.

### Scan-and-decrypt with per-event-id cache

The fast path in `src/hooks/usePersona.ts`:

```ts
const cache = new Map<string, PhoenixEnvelope | "not-phoenix">();

async function decryptWithCache(ev, userPubkey, signer) {
  const cached = cache.get(ev.id);
  if (cached !== undefined) return cached === "not-phoenix" ? null : cached;
  const env = await tryDecryptPhoenixEnvelope(ev.content, userPubkey, signer);
  cache.set(ev.id, env ?? "not-phoenix");
  return env;
}
```

**Why event id is a stable cache key.** `event.id` is sha256 over the canonical event. If the ciphertext changes (a new revision of the persona) the id changes, so we never serve a stale envelope. If the same event flows past us twice on different relay queries, we decrypt once.

**Spike result on 100 events (1 Zuka + 99 noise):**

| Pass | Time | Notes |
|---|---|---|
| Cold | **9.1ms** | every event decrypted on the main thread |
| Warm | **0.03ms** | every event served from cache |
| Speedup | **268×** | |

9ms for 100 events on local NIP-44 is fast because there's no network round-trip per decrypt. **Once a NIP-46 remote signer is in the loop, the cold-pass cost balloons** — each decrypt is a websocket round-trip to the bunker app, easily 100–500ms each. 100 events × 200ms = 20 seconds. **The cache turns that 20s page-load tax into a 20s one-time cost paid only on the first scan**, with subsequent persona switches and `useMyPersonas` calls returning instantly.

This is the load-bearing optimization for "support NIP-46 signers from V1." Without the cache, NIP-46 users would feel the privacy posture's cost on every navigation.

### Derive-and-verify defense layer

Even if all three earlier layers (NIP-44 decrypt, JSON parse, Zod schema) accept a payload, `parsePhoenixEnvelope` runs:

```ts
const derived = getPublicKey(decode(persona.nsec));
if (derived !== persona.pubkey) return null;
```

The spike's tampered-envelope test confirms this: take persona A's metadata, splice in persona B's nsec, encrypt to the user, attempt decrypt. Decryption succeeds. JSON parses. Zod accepts (both pubkey and nsec are well-formed). Derive check fails → null.

This matters because the user's signer is the encryption authority. Without derive-and-verify, an attacker who *also* has the user's signer (e.g. a malicious browser extension) could publish a Zuka-shaped event that smuggles a different persona identity. The derive check pins the on-wire claim to the embedded key material.

---

## What was NOT tested in the spike

### Live-relay round-trip

**Not in this commit.** The spike covers offline crypto patterns; the relay verification belongs in a quick browser-console runbook (below). For the hackathon's purposes, the offline tests gate every code path that the live test would also gate.

**Runbook — verify on Damus, Ditto, primal.net, nostr.band** (pre-demo):

```js
// Open the Zuka dev server, sign in via the wizard, mint a persona.
// Then in DevTools console:

const { nostr } = window.__nostrify;       // or grab via React DevTools if not exposed
const { user } = window.__currentUser;     // ditto

// Should return at minimum the kind 30078 you just published.
const events = await nostr.query(
  [{ kinds: [30078], authors: [user.pubkey], limit: 200 }],
  { signal: AbortSignal.timeout(5000) }
);
console.log(events.length, events.map(e => e.id.slice(0, 8)));
```

Run against each relay individually with `nostr.relay(url).query(...)`. Acceptance: every relay returns the event within 5 seconds of publishing. If a relay drops kind 30078 or returns nothing, drop it from the V1 default set in `src/lib/appRelays.ts`.

### Mobile NIP-49 latency

**Owed to Anaïse before the demo.** The plan's mitigation is WebWorker offload; the spike doesn't yet exercise that path. If desktop is 682ms, a mid-range Android is likely 1.4–2 seconds. Decision point on whether to ship the worker mitigation will come after the first device measurement.

### NIP-46 remote signer integration

The cache benchmark used a local in-process signer. With a real bunker, every `decrypt` is a websocket round-trip. The cache architecture is unchanged — but the absolute cold-pass time is dominated by network, not crypto. **Acceptance before NIP-46 ships: empirically check `useMyPersonas` time-to-first-render on a fresh tab with a real bunker.**

---

## Decisions resolved by the spike

1. **Privacy posture verified:** the kind 30078 envelope reveals zero Zuka-specific information from the outside. Test #4 enforces this on the schema/template side; reviewers can grep for `["d", "alt", "t"]` in `buildEncryptedPersonaTemplate` and verify by inspection.
2. **Cache architecture confirmed:** per-event-id cache works because event ids are content-hashes over canonical events. Stale-on-revision concerns are non-issues.
3. **NIP-49 production log_n locked:** 18. Spinner-yield pattern is mandatory in any UI that touches it. WebWorker offload is on the table for mobile.
4. **Derive-and-verify is non-optional:** the schema alone doesn't catch claim-vs-key mismatches. Test #4 enforces this.

## Open items for Derek

- [ ] **Live-relay runbook** (pre-demo). Run the snippet above against Damus / Ditto / primal.net / nostr.band. Record which return our test event in `<5s`.
- [ ] **Mobile NIP-49 measurement** (pre-demo). Borrow Anaïse's phone, run signup, log time from passphrase-submit to first dashboard paint. Decide on WebWorker if >2s.
- [ ] **NIP-46 cold-pass benchmark** (when relevant). Once a user uses Amber/nsec.app, measure `useMyPersonas` first-render. If >5s, raise it as a design issue.

## Open items for Jim

- Spike C Part 2 (Breez Spark in browser) — superseded by the production wallet at `src/lib/wallet/`.
