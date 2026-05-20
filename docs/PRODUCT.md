# Product Model

Zuka helps a person publish as an AI-assisted public persona that is
cryptographically separate from the human operator. The persona has its own
Nostr keypair, public profile, media, posting voice, and Lightning wallet.

## Audience

Zuka is designed first for political activists and dissidents who need to speak
publicly without tying that public voice to their legal identity. It is also
useful for writers, whistleblowers, survivors, and public commenters who need a
durable persona for sensitive topics.

## Product Shape

1. The operator signs in with a Nostr identity or creates a fresh local one.
2. The operator creates a persona from a form-based wizard.
3. Zuka generates a persona keypair and Spark wallet seed.
4. Zuka publishes an encrypted kind 30078 backup authored by the operator.
5. Zuka publishes the persona's public kind 0 profile under the persona key.
6. The dashboard helps the operator draft, style, generate media, and publish
   persona posts.
7. Wallet funding pays PPQ AI usage; persona wallets receive donations and can
   fund their own inference.

## Identity Model

Zuka uses a two-level identity model:

- **Operator**: the human's Nostr identity. It signs encrypted backups and owns
  recovery. Zuka does not publish public profile or post content under this key
  as part of persona operation.
- **Persona**: a separate public Nostr keypair. It signs public kind 0 profiles
  and kind 1 posts.

The operator-to-persona relationship exists only inside encrypted backup
content. Relays see public persona activity and opaque operator-authored kind
30078 events, but not the link between them.

All personas under one operator share the operator key's fate. If that operator
key is compromised, every persona backup under that operator can be decrypted.
Use separate operator identities for persona groups that must not share fate.

## Release Scope

Current release scope:

- Form-based persona creation.
- Operator login via generated nsec, pasted nsec, extension, bunker, or
  nostrconnect.
- Fresh generated operator keys stored as NIP-49 `ncryptsec`.
- Encrypted operator and persona kind 30078 backups.
- Per-persona Breez Spark wallets.
- Persona profile publication, public feed, posts, image/media attachments, and
  zap visibility.
- PPQ-backed AI assist, post wizard, research, image generation, video pipeline,
  and credits/topup flows.
- Web PWA and Capacitor Android/iOS shells.
- Local integration tests with in-memory relay and HTTP harnesses.

Deferred:

- Agent-driven persona interview wizard.
- Multi-operator-per-device UX.
- First-class TTS/audio publication flows.
- Dedicated public attestation/verify page.
- Zuka-owned backend services.

## Non-Goals

Zuka should not add:

- A backend that stores user data.
- Email or server-side account recovery.
- Custodial wallet behavior.
- Centralized moderation or safety filtering in front of persona speech.

## Demo Arc

The release demo should show:

1. Create an operator account.
2. Create a persona.
3. Fund the persona wallet.
4. Generate or write a post in the persona's voice.
5. Publish to Nostr.
6. Show that persona data can be recovered from encrypted Nostr backups.
