# Threat model

What Phoenix protects, what it doesn't, and where the secrets live.

> Source of truth: `dev/PROJECT.md` §3. If this disagrees with §3, §3 wins
> — update this file.

## What we're protecting

The user's **device** and the **link between the user keypair and the
persona keypairs** they operate.

The personas are public artifacts — their posts, profile, and donation
flow are meant to be seen. The thing that must not leak is *which* public
personas a given user keypair is responsible for.

## Identity layout (two-level)

Phoenix uses a two-level identity model (PROJECT.md §3, `docs/GLOSSARY.md`):

- **User keypair** — the human's Nostr identity. Signs encrypted persona
  backups (kind 30078). **Never publishes kind 0 or kind 1 under
  Phoenix.** To outside observers, it's just a publisher of opaque
  ciphertext.
- **Persona keypair** — separately generated per persona. Publishes the
  persona's public kind 0 / kind 1 events.

The link from persona pubkey → user pubkey lives **only inside the
encrypted ciphertext** of the user's kind 30078 backup. To outside
observers, relays show:

- N persona pubkeys posting publicly, each independently
- The user pubkey publishing N opaque ciphertext events

Linking a specific public persona to its user requires the user's nsec.

## What does leak

- **Per-persona public activity.** The persona's posts, kind 0, and
  Lightning Address are public by design.
- **An encrypted-event count under the user pubkey.** A relay observer
  can see that `<user_pubkey>` has authored N kind-30078 events with
  random d-tags. They cannot tell that those events are Phoenix events
  at all (no Phoenix-specific tags, externally indistinguishable from
  any other app's encrypted-app-data event), and even if they could,
  they cannot tell which public personas this user operates — the
  persona-pubkey ↔ user-pubkey link lives only inside the encrypted
  ciphertext.
  - **Caveat: timing correlation.** A patient observer can correlate
    the timing of a user's kind-30078 publishes with the "joined date"
    of new public personas. Weak signal but not zero.
  - **Caveat: revision count.** Each persona-update creates a fresh
    event (random UUID d-tag), so the kind-30078 count is "total
    publishes" not "persona count." A relay observer cannot directly
    derive persona count from event count.

## What we are NOT protecting against

These are explicit limits, not oversights:

- **Catastrophic device compromise.** A keylogger that captures the
  user's passphrase plus the encrypted user nsec defeats Phoenix.
- **Coercion of the user.** If someone forces the user to type the
  passphrase, every persona under that user keypair is compromised.
- **Traffic analysis.** Phoenix runs in a browser and talks to public
  Nostr relays, PPQ, and Blossom. Network observers can correlate
  timing. Tor / VPN is the user's responsibility.
- **NIP-44 limitations** (per the spec): no forward secrecy, no
  post-compromise security, no deniability. If the user's nsec leaks,
  every prior backup event becomes decryptable, exposing every persona
  this user has ever created.
- **Quantum attack.** secp256k1 + ChaCha20 are not post-quantum.

## Compartmentalization (shared fate within a user keypair)

**All personas under a single user keypair share one fate.** Anyone who
compromises that user nsec can decrypt every persona's backup and
operate every voice.

For activists who need persona groups that *can't* fall together, the
answer is **separate user keypairs per group**. The app supports
multi-account login via Nostrify's `LoginArea` / `useLoggedInAccounts`,
so a user can sign in with multiple user keypairs and switch between
them.

This is a deliberate trade-off (PROJECT.md §3). A persona-only model
(no user-level layer) would mean each persona has its own root nsec to
safeguard separately, multi-device sync requires copying every persona
nsec to every device, and losing one persona's nsec loses that
persona's wallet entirely.

## Secrets and where they live

| Secret              | Form                          | Location                                                  |
| ------------------- | ----------------------------- | --------------------------------------------------------- |
| User nsec (BYO)     | Whatever the signer uses      | NIP-07 extension / NIP-46 remote signer / pasted nsec     |
| User nsec (fresh)   | NIP-49 ncryptsec              | `localStorage` on the device                              |
| Passphrase          | UTF-8 NFKC-normalized         | User's head; held in memory while unlocking               |
| Persona nsec        | Plaintext (hex) inside backup | Encrypted kind 30078 event on relays + memory only        |
| Wallet seed (BIP39) | Plaintext inside backup       | Encrypted kind 30078 event on relays + memory only        |
| Persona system prompt | Plaintext inside backup     | Encrypted kind 30078 event on relays                      |

**The user nsec is the only secret on the device that links the human
to all of their personas.** Everything else is downstream — gain the
user nsec and you can decrypt every persona's backup, drain every
wallet, and post as every persona under that user.

## Hard rules

- **Never log the user nsec or any persona nsec remotely** (no Sentry,
  no analytics, no error reporters that capture stack traces with
  state).
- **Never write a persona nsec to disk.** Persona nsecs live only inside
  the encrypted kind 30078 backup and ephemerally in memory while the
  persona is active. `src/lib/personaKey.ts:1-9` enforces this.
- **Never derive the user keypair from anything tied to the human's
  real identity** when the user wants a fresh Phoenix-generated
  identity — no email, no device ID.
- **Always encrypt the kind 30078 backup** to the user's *own* pubkey
  via NIP-44 before publishing.
- **Phoenix UI never shows a persona seed except during the explicit
  "download backup" flow.**
- **No Phoenix-owned backend service** — see `docs/SCOPE.md` "out of
  scope".

## Recovery and loss

- **Recovery:** on a new device, the user signs in with the user nsec
  (NIP-07 / NIP-46 / paste). The app fetches every kind 30078 the user
  has authored, decrypts each via the user's signer, and re-hydrates
  every persona in one step.
- **Loss of user nsec:** every persona under that user keypair is
  unrecoverable. Phoenix cannot recover them. The wizard's one-time
  "download user backup" affordance is the only safety net.
- **Loss of a single persona's posts/wallet:** not possible to lose
  individually as long as the user nsec is intact — the persona's nsec
  and wallet seed live inside that user's kind 30078 backup.

## Open

- **`dev/PROJECT.md` §10 #6** — NIP-49 passphrase UX: single passphrase
  per device or per user keypair? Trade-off between convenience and
  blast radius.
- **`dev/PROJECT.md` §10 #8** — an anonymous voice with a wallet is
  also an abuse vector. Minimum-viable answer for HRF judges?

## Source

- `dev/PROJECT.md` §3 (canonical for the identity model), §10 #6, §10 #8
- `docs/GLOSSARY.md` — "User keypair", "Persona keypair", "Operator"
- `docs/guides/nostr-nips.md` — NIP-44, NIP-49 details
