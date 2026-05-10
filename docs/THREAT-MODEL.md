# Threat model

What Zuka protects, what it doesn't, and where the secrets live.

> Source of truth: `dev/PROJECT.md` §3. If this disagrees with §3, §3 wins
> — update this file.

## What we're protecting

The operator's **device** and the **link between the operator and the
persona keypairs** they run.

The personas are public artifacts — their posts, profile, and donation
flow are meant to be seen. The thing that must not leak is *which*
public personas a given operator is responsible for.

## Identity layout (two-level)

Zuka uses a two-level identity model (PROJECT.md §3,
`docs/GLOSSARY.md`):

- **Operator** — the human's Nostr identity. Signs encrypted persona
  backups (kind 30078). **Never publishes kind 0 or kind 1 under
  Zuka.** To outside observers, it's just a publisher of opaque
  ciphertext.
- **Persona keypair** — separately generated per persona. Publishes
  the persona's public kind 0 / kind 1 events.

The link from persona pubkey → operator pubkey lives **only inside the
encrypted ciphertext** of the operator's kind 30078 backup. To outside
observers, relays show:

- N persona pubkeys posting publicly, each independently
- The operator pubkey publishing N opaque ciphertext events

Linking a specific public persona to its operator requires the
operator's nsec.

## What does leak

- **Per-persona public activity.** The persona's posts, kind 0, and
  Lightning Address are public by design.
- **The persona count.** A relay observer can see that
  `<operator_pubkey>` has authored N kind-30078 events with N distinct
  d-tag values (stable per persona; addressable-event semantics) and
  infer "this operator runs N addressable items." They **cannot** tell
  those items are Zuka backups specifically — Zuka backup events
  carry no `t`, no `alt`, and a Zuka-opaque d-tag value, so
  externally they're indistinguishable from any other NIP-78
  application-data event (Coracle settings, Damus prefs, etc.). And
  they cannot tell which public personas this operator runs — the
  persona-pubkey ↔ operator-pubkey link lives only inside the
  encrypted ciphertext.
  - **Caveat: timing correlation.** A patient observer can correlate
    the timing of an operator's kind-30078 publishes with the
    "joined date" of new public personas. Weak signal, not zero.

## What we are NOT protecting against

These are explicit limits, not oversights:

- **Catastrophic device compromise.** A keylogger that captures the
  operator's passphrase plus the encrypted operator nsec defeats
  Zuka.
- **Coercion of the operator.** If someone forces the operator to type
  the passphrase, every persona under that operator is compromised.
- **Traffic analysis.** Zuka runs in a browser and talks to public
  Nostr relays, PPQ, and Blossom. Network observers can correlate
  timing. Tor / VPN is the operator's responsibility.
- **NIP-44 limitations** (per the spec): no forward secrecy, no
  post-compromise security, no deniability. If the operator's nsec
  leaks, every prior backup event becomes decryptable, exposing every
  persona this operator has ever created.
- **Quantum attack.** secp256k1 + ChaCha20 are not post-quantum.

## Compartmentalization (shared fate within an operator)

**All personas under a single operator share one fate.** Anyone who
compromises that operator nsec can decrypt every persona's backup and
operate every voice.

V1 is **one operator per device**. Multi-operator-per-device — the
remedy for activists who need persona groups that *can't* fall
together — is V2.

This is a deliberate trade-off (PROJECT.md §3). A persona-only model
(no operator-level layer) would mean each persona has its own root nsec
to safeguard separately, multi-device sync requires copying every
persona nsec to every device, and losing one persona's nsec loses that
persona's wallet entirely.

## Secrets and where they live

| Secret              | Form                          | Location                                                  |
| ------------------- | ----------------------------- | --------------------------------------------------------- |
| Operator nsec (BYO) | Whatever the signer uses      | NIP-07 extension / NIP-46 remote signer / pasted nsec     |
| Operator nsec (fresh) | NIP-49 ncryptsec            | `localStorage` on the device, one passphrase per device   |
| Passphrase          | UTF-8 NFKC-normalized         | Operator's head; held in memory while unlocking           |
| Persona nsec        | Plaintext (hex) inside backup | Encrypted kind 30078 event on relays + memory only        |
| Wallet seed (BIP-39)| Plaintext inside backup       | Encrypted kind 30078 event on relays + memory only        |
| Persona system prompt | Plaintext inside backup     | Encrypted kind 30078 event on relays                      |

**The operator nsec is the only secret on the device that links the
human to all of their personas.** Everything else is downstream — gain
the operator nsec and you can decrypt every persona's backup, drain
every wallet, and post as every persona under that operator.

## Hard rules

- **Never log the operator nsec or any persona nsec remotely** (no
  Sentry, no analytics, no error reporters that capture stack traces
  with state).
- **Never write a persona nsec to disk.** Persona nsecs live only
  inside the encrypted kind 30078 backup and ephemerally in memory
  while the persona is active. `src/lib/personaKey.ts:1-9` enforces
  this.
- **Never derive the operator keypair from anything tied to the
  human's real identity** when the operator wants a fresh
  Zuka-generated identity — no email, no device ID.
- **Always encrypt the kind 30078 backup** to the operator's *own*
  pubkey via NIP-44 before publishing.
- **Zuka UI never shows a persona seed except during the explicit
  "download backup" flow.**
- **No Zuka-owned backend service** — see `docs/SCOPE.md` "out of
  scope".

## Recovery and loss

- **Recovery:** on a new device, the operator signs in with the
  operator nsec (NIP-07 / NIP-46 / paste). The app fetches every kind
  30078 the operator has authored, decrypts each via the operator's
  signer, and re-hydrates every persona in one step.
- **Loss of operator nsec:** every persona under that operator is
  unrecoverable. Zuka cannot recover them. The wizard's one-time
  "download operator backup" affordance is the only safety net.
- **Loss of a single persona's posts/wallet:** not possible to lose
  individually as long as the operator nsec is intact — the persona's
  nsec and wallet seed live inside that operator's kind 30078 backup.

## Open

- **`dev/PROJECT.md` §10 #1** — minimum-viable answer for the abuse-
  vector question for HRF judges. Talking points: cost-throttling
  (bad actors burn sats; donations sustain real voices),
  pseudonymous-not-anonymous (relay-level mute / block / labels),
  upstream-LLM safety inherited via PPQ, Verify page surfaces persona
  age. Owner: Anaïse for demo positioning.

## Source

- `dev/PROJECT.md` §3 (canonical for the identity model), §10
- `docs/GLOSSARY.md` — "Operator", "Persona keypair"
- `../dev/docs/nostr-nips.md` — NIP-44, NIP-49 details
