# Phoenix Nostr usage

Phoenix uses standard Nostr kinds. There are no new kinds. The only
non-trivial part is *how* we use kind 30078 (NIP-78 application data)
and the deliberate metadata-minimization on kind 1 posts.

This document is the source of truth for the schema and the threat model.

---

## Threat model

Phoenix exists for activists in authoritarian regimes. The core privacy
property the protocol design must guarantee:

> Given only Nostr relay data, an external observer must NOT be able to
> link a persona's public posts to the human operator who runs them.

What an attacker is assumed to have:

- Full read access to all relays.
- The ability to query by any tag, kind, or author.
- The ability to enumerate and correlate events at scale.
- Knowledge that Phoenix exists and how it works.

What the design must guarantee:

1. Persona POSTS (kind 1) MUST NOT carry any tag that links to the operator.
2. Persona POSTS MUST NOT carry any "Phoenix" application fingerprint.
3. The encrypted persona-config event MUST NOT carry any tag that
   identifies it as a Phoenix event or that references the persona's
   pubkey publicly.
4. Persona NAMES, system prompts, sources, and the persona nsec MUST
   never appear in plaintext on the network.

Acceptable residual leaks:

- The kind 30078 event's `pubkey` is the operator (events must be
  signed). Mitigation: the event is otherwise indistinguishable from
  any other app's encrypted-app-data event, providing plausible
  deniability for operators who use Phoenix.
- Timing correlation between persona-creation events and first kind 1
  post. This is a weak signal and is not addressed in v1.
- Source URL patterns may correlate posts across personas if every
  persona uses identical source feeds. Not addressed in v1.

---

## Schema

### Kind 30078 — encrypted persona definition

```
kind:    30078
pubkey:  <operator pubkey, hex>
tags:
  ["d", <random uuid v4>]    addressing only — no semantics
content: NIP-44(operator -> operator) of:
  {
    "app": "phoenix",
    "version": 1,
    "personaPubkey": "<persona pubkey, hex>",
    "config": { ...PersonaConfig }
  }
```

There are NO other tags. No `t`, no `p`, no descriptive `alt`, no
`client`. The Phoenix discriminator (`app: "phoenix"`) and the link
from the encrypted blob to the persona's pubkey both live INSIDE the
ciphertext.

The `d` tag is a fresh `crypto.randomUUID()` value — it is required
for addressability per NIP-01 but carries no semantic information.

`PersonaConfig` is the operator-only configuration: name, region,
cause, languages, tone, posting frequency, sources, focus areas, model
id, system prompt, personality, bio, voice style notes, topics to
avoid, and the persona's own `nsec` (so the operator can recover the
persona keypair from any device they sign in on).

### Kind 0 — public persona profile

Standard NIP-01 metadata, signed by the persona's own keypair.

```
kind:    0
pubkey:  <persona pubkey, hex>
tags:    []
content: { "name": "...", "display_name": "...", "about": "...", "picture": "..." }
```

This is what makes a persona look like an ordinary Nostr account from
the outside. Other Nostr clients can render the persona's profile and
feed without any Phoenix knowledge.

The persona's bio is the right place to disclose AI-assisted authorship
(e.g. "AI-assisted voice from Rwanda"). Disclosure via bio is a soft
signal, not a hard application fingerprint.

### Kind 1 — persona posts

Standard short text notes signed by the persona's own keypair.

```
kind:    1
pubkey:  <persona pubkey, hex>
tags:
  ["t", "<region-slug>"]      e.g. "rwanda" — topical discovery
  ["t", "<cause-slug>"]       e.g. "human-rights" — topical discovery
  ["r", "<source-url>"]       repeatable; source attribution
  ["t", "<extra-topic>"]      optional extras
content: <styled post body>
```

What we deliberately do NOT publish:

- `["operator", <pubkey>]` — would directly link persona to operator.
- `["client", "phoenix"]` — would fingerprint the application.
- `["t", "phoenix"]` — same.
- `["alt", "...by Phoenix persona X..."]` — would identify both the
  app and the persona name.

Source-attribution `r` tags and topical `t` tags are content, not
identity, and are retained for trust signaling and discovery.

---

## Operator workflows

### Finding personas (no tag-filter shortcut)

The privacy posture forbids any tag that would let us narrow a query
to "Phoenix events specifically." The operator-side lookup is therefore
a scan-and-decrypt loop:

1. Query `{ kinds: [30078], authors: [<operator-pubkey>], limit: 200 }`.
2. For each event:
   - Verify it has a `d` tag.
   - Attempt NIP-44 decryption with the operator's signer.
   - If decryption succeeds, parse the plaintext as a Phoenix envelope.
   - If parsing succeeds, this is a Phoenix persona event.
3. Deduplicate by `d` tag, keeping the latest by `created_at` (per
   NIP-78 / NIP-01 addressable replacement semantics).

This costs O(N) decryptions per operator on the operator's own device.
For typical operator volumes (1-20 personas, few dozen 30078 events
total) this is well under a second.

### Resolving a persona npub to a config

Same scan-and-decrypt loop. Stop at the first envelope whose
`personaPubkey` field matches the requested npub.

### Posting

The dashboard reads the decrypted config, signs a kind 1 with the
persona's nsec (extracted from the config, never persisted to local
storage), and publishes through the operator's standard Nostrify pool.

### Cross-device recovery

The persona nsec lives only inside the encrypted blob. To recover a
persona on a new device, the operator signs in with their own Nostr
key and runs the scan-and-decrypt loop. No additional state needed.
