# Threat model

What Phoenix protects, what it doesn't, and where the secrets live.

> Source of truth: PROJECT.md §3. If this disagrees with §3, §3 wins —
> update this file.

## What we're protecting

The user's **device** and the user's **real identity**.

The persona is a public artifact — its posts, profile, and donation flow
are meant to be seen. The thing that must not leak is the linkage between
the persona and the human operating it.

## What we are NOT protecting against

These are explicit limits, not oversights:

- **Catastrophic device compromise.** A keylogger that captures the user's
  passphrase plus the encrypted nsec defeats Phoenix.
- **Coercion of the user.** If someone forces the user to type the
  passphrase, the persona is compromised.
- **Traffic analysis.** Phoenix runs in a browser and talks to public
  Nostr relays, PPQ, and Blossom. Network observers can correlate timing.
  Tor / VPN is the user's responsibility.
- **NIP-44 limitations** (per the spec): no forward secrecy, no
  post-compromise security, no deniability. If the persona's nsec leaks,
  every prior backup event becomes decryptable.
- **Quantum attack.** secp256k1 + ChaCha20 are not post-quantum.

## Secrets and where they live

| Secret              | Form                          | Location                                      |
| ------------------- | ----------------------------- | --------------------------------------------- |
| Persona nsec        | NIP-49 ncryptsec              | `localStorage` on the device                  |
| Passphrase          | UTF-8 NFKC-normalized         | User's head; held in memory while unlocking   |
| Wallet seed (BIP39) | Plaintext inside backup       | Encrypted kind 30078 event on relays + memory |
| PPQ API key         | Bearer token                  | Encrypted backup `model_prefs` / settings     |
| Persona system prompt | Plaintext inside backup     | Encrypted kind 30078 event on relays          |

**The persona nsec is the only secret on the device that links the user to
the voice.** Everything else is downstream — gain the nsec and you can
decrypt the backup, drain the wallet, post as the persona.

## Hard rules

- **Never log the nsec remotely** (no Sentry, no analytics, no error
  reporters that capture stack traces with state).
- **Never derive the persona key from anything tied to the user's real
  identity** — no email, no device ID, no operator-key linkage.
- **Always encrypt at rest** with the user's passphrase via NIP-49.
- **Always encrypt the kind 30078 backup** to the persona's own pubkey via
  NIP-44 before publishing.
- **Phoenix UI never shows the seed** except during the explicit "download
  backup" flow during persona creation, which the wizard surfaces once and
  asks the user to confirm they have stored it.
- **No Phoenix-owned backend service** — see PROJECT.md §8 "out of scope".

## Recovery and loss

- **Recovery:** on a new device, the user pastes the persona nsec (or
  restores from a downloaded NIP-49 bundle), the app fetches the kind
  30078 event from relays, decrypts it with the persona's own key, and
  re-hydrates the wallet and persona config.
- **Loss:** if the nsec is lost, the persona and its wallet are gone.
  Phoenix cannot recover them. The wizard's one-time backup affordance is
  the only safety net.

## Why no operator/persona split?

A separate operator key feels safer in theory (the persona config could
be sealed to the operator) but it requires the user to manage *two*
identities, and the operator key becomes a single-point-of-failure linkage
between every persona that user has ever created — exactly the linkage
we're trying to avoid.

Collapsing to one keypair per persona keeps the threat model clean.

## Open

- **PROJECT.md §10 #6:** single passphrase per device or per persona?
  Trade-off between convenience and blast radius if a passphrase leaks.
- **PROJECT.md §10 #8:** an anonymous voice with a wallet is also an
  abuse vector. What's the minimum-viable answer for HRF judges?

## Source

- PROJECT.md §3 (canonical), §10 #6, §10 #8
- `docs/nostr-nips.md` — NIP-44, NIP-49 details
