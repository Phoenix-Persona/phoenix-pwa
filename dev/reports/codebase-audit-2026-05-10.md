# Codebase Audit - 2026-05-10

> **Status: Historical.** Current source HTML lives at `public/index.html`;
> root `index.html` references below describe the repo state at audit time.

Scope: `src/`, `index.html`, `package.json`, `dev/PROJECT.md`, and current local
configuration surfaces.

Focus: security, code quality, and technical debt. This audit treats
`dev/PROJECT.md` as the product source of truth and reviewed runtime behavior on
the `dev` branch.

Dependency audit: `npm audit --omit=dev` completed successfully and reported
`0 vulnerabilities`.

## Executive Summary

Zuka's Nostr trust boundaries are in better shape than many of the surrounding
browser-state boundaries. The high-value Nostr reads reviewed during this pass
generally constrain by the expected author, and the CSP avoids the most dangerous
script directives. The primary risks are instead local-key custody, browser
privacy, and long-lived sensitive client state: plaintext `nsec` backup files,
production console logs that include AI prompts and generated URLs, unencrypted
video checkpoints in IndexedDB, and event-sourced `http:` media URLs.

The largest technical-debt theme is concentration of product logic in very large
components and hooks. The video composer, wallet panel, post wizard, and wallet
hook are carrying UI, orchestration, persistence, and network behavior in the
same files, which makes future security review and regression testing harder
than it needs to be.

## Findings

### 1. Plaintext `nsec` backup files are created during signup

Severity: High

Fresh signup downloads the user's raw `nsec` into a text file before the user
encrypts it with a passphrase:

- `src/components/auth/AuthDialog.tsx:66` defines `downloadNsecFile`.
- `src/components/auth/AuthDialog.tsx:74` writes the raw `nsec` into a
  `text/plain` `Blob`.
- `src/components/auth/AuthDialog.tsx:306` calls that download before the
  passphrase step.
- `src/components/auth/AuthDialog.tsx:337` then creates the encrypted
  `ncryptsec`.

This leaves an unencrypted secret-key artifact in Downloads or mobile file
storage. For the stated audience, that is a meaningful risk: browser state can
be cleared, but downloaded files tend to persist, sync, get indexed, or be
backed up by the OS.

Recommendation: change the signup order so the passphrase is collected before
any backup is offered. Download only an encrypted `ncryptsec` backup by default.
Keep raw `nsec` export behind a strongly worded manual action, or remove it for
the production flow.

### 2. Users can still opt into plaintext `nsec` localStorage

Severity: High

The login flow allows pasted keys to bypass NIP-49 wrapping:

- `src/components/auth/AuthDialog.tsx:356` documents the plaintext
  localStorage path.
- `src/components/auth/AuthDialog.tsx:415` implements "skip passphrase".
- `src/components/auth/AuthDialog.tsx:420` calls `login.nsec(loginNsec)`,
  which stores the login in the browser login provider.

The app's own threat model correctly treats XSS as catastrophic when private
keys live in localStorage. The optional skip path preserves that worst-case
mode for imported accounts.

Recommendation: make encrypted at-rest storage the default and strongly prefer
it for all `nsec` logins. If a skip path remains, put it behind an advanced
escape hatch and make "Forget device" clearly describe what it can and cannot
remove.

### 3. Production logs expose prompts, generated media URLs, and an API-key prefix

Severity: High

PPQ and video-generation code logs sensitive request and workflow data
unconditionally:

- `src/lib/ppq/client.ts:82` logs every PPQ request.
- `src/lib/ppq/client.ts:111` logs parsed error bodies.
- `src/lib/ppq/client.ts:492` summarizes request bodies by retaining the first
  80 characters of long strings.
- `src/hooks/useGenerateVideoPipeline.ts:307` logs the PPQ API-key prefix.
- `src/hooks/useGenerateVideoPipeline.ts:636` logs generated preview and seed
  URLs.
- `src/lib/video/log.ts:22` sends all video logs directly to `console.log`.

AI prompts, persona ideas, source material, generated media URLs, and account
identifiers can be sensitive for activists. Browser console logs are not a
secure diagnostic channel, and they may be captured by remote debugging,
analytics wrappers, support tools, or shared screenshots.

Recommendation: gate these logs behind a dev-only or explicit debug flag, and
redact prompts, URLs, credit identifiers, API-key prefixes, caption drafts, and
error bodies by default. Keep structured error codes for troubleshooting.

### 4. Video checkpoints persist sensitive drafts outside "Forget device"

Severity: Medium-High

The video chain checkpoint store persists substantial unpublished content in
IndexedDB:

- `src/lib/video/chainStore.ts:24` stores records in the
  `phoenix-video-chain` database.
- `src/lib/video/chainStore.ts:35` stores idea, hints, sources, world block,
  persona pubkey/name, preview URL, and seed image URL.
- `src/lib/video/chainStore.ts:67` stores generated segments, clip blobs,
  stitched blobs/URLs, and caption drafts.
- `src/lib/video/chainStore.ts:137` saves the record after milestones.
- `src/components/UnlockGate.tsx:105` and `src/pages/Settings.tsx:94` implement
  "Forget device" without clearing this IndexedDB database.

This means failed or abandoned video generations can leave unpublished activist
content, generated media, and persona identifiers on a shared device even after
the user chooses the forget-device path.

Recommendation: add a `clearAllVideoChains()` helper and call it from every
forget-device path. Also add a TTL for abandoned chains and consider encrypting
checkpoint records with an operator-scoped key or making checkpoint persistence
opt-in for sensitive modes.

### 5. Event-sourced media URLs allow `http:`

Severity: Medium

The shared URL sanitizer and NIP-92 media parser both accept `http:`:

- `src/lib/url.ts:1` defines `sanitizeHttpUrl`.
- `src/lib/url.ts:5` allows both `http:` and `https:`.
- `src/lib/personaPost.ts:148` describes media URL sanitization as
  `http(s)-only`.
- `src/lib/personaPost.ts:153` allows both schemes for post media.
- `src/lib/personaPost.ts:183` and `src/lib/personaPost.ts:217` pass those URLs
  into renderable image and video descriptors.

This correctly blocks `javascript:`, `data:`, and relative URLs, but still lets
untrusted Nostr events cause plain-HTTP media fetches. That can leak metadata,
fail under mixed-content rules, and weaken privacy expectations for profile
images and post attachments.

Recommendation: make event-sourced and profile media sanitizers HTTPS-only.
Where HTTP must be supported for development, keep that exception behind an
explicit local/dev path. Consider rejecting localhost/private-address media URLs
for public event rendering as an additional privacy guard.

### 6. Custom Nostr viewer URLs are stored and used without scheme validation

Severity: Medium

The custom event-viewer setting accepts arbitrary text and later builds external
links from it:

- `src/hooks/useNostrViewer.ts:8` stores the value directly in localStorage.
- `src/components/NostrViewerSettings.tsx:68` exposes a custom URL field.
- `src/components/NostrViewerSettings.tsx:74` stores the raw input value.
- `src/lib/nostrViewer.ts:20` concatenates the value into an event URL.
- `src/components/PostCard.tsx:78` uses the generated URL for footer links.

This is mostly a local-user-controlled setting, not a remote Nostr injection
path, but the browser will still honor dangerous or malformed schemes in links
if they are allowed into `href`.

Recommendation: validate and normalize custom viewer prefixes as HTTPS URLs
before storing them. If validation fails, keep the previous value and show an
inline error.

### 7. Decrypted persona envelopes remain in a module-level memory cache

Severity: Medium

Persona decryption is cached for the lifetime of the page session:

- `src/hooks/usePersona.ts:45` defines a module-level cache.
- `src/hooks/usePersona.ts:48` stores `PhoenixEnvelope` values.
- `src/hooks/usePersona.ts:64` caches each decrypted envelope by event id.

Those envelopes include persona secrets and wallet seeds. The cache avoids
repeat NIP-44 decrypt work, but it is not cleared on logout, account switch, or
forget-device flows. A hard reload clears it, but same-session account changes
can leave old decrypted secrets in memory longer than necessary.

Recommendation: export a production `clearPersonaDecryptCache()` function and
call it from operator/account cleanup paths. If the cache remains, document that
it is a performance cache holding secret material and keep its lifetime narrow.

### 8. Persona creation can report failure after the private backup has succeeded

Severity: Medium

Persona creation publishes the encrypted backup first, then publishes the public
kind-0 profile:

- `src/hooks/useCreatePersona.ts:161` builds the encrypted persona template.
- `src/hooks/useCreatePersona.ts:165` signs the backup event.
- `src/hooks/useCreatePersona.ts:166` publishes the backup.
- `src/hooks/useCreatePersona.ts:176` creates the public profile event.
- `src/hooks/useCreatePersona.ts:185` awaits the profile publish as a required
  step.

If the backup publish succeeds and the public profile publish times out or
fails, the UI sees the whole mutation as failed even though the source-of-truth
encrypted persona already exists on relays. The update path already treats the
kind-0 profile refresh as best-effort (`src/hooks/useUpdatePersona.ts:202` and
`src/hooks/useUpdatePersona.ts:214`), so creation has a less forgiving contract
than editing.

Recommendation: make the create-time profile publish best-effort too. Return a
warning alongside the created persona when the backup succeeds but the public
profile publish does not, then navigate to the persona instead of encouraging a
retry that can create duplicates or confusion.

### 9. Dev/pinned credential environment variables lack a production build guard

Severity: Medium

Several `VITE_*` variables intentionally expose credentials to the browser when
set:

- `src/components/DevAutoLogin.tsx:18` documents that `VITE_APP_USER_NSEC` is
  exposed in the browser bundle.
- `src/components/DevAutoLogin.tsx:53` reads that variable and auto-logs in.
- `src/hooks/usePpqAccount.ts:40` documents the pinned PPQ-account path.
- `src/hooks/usePpqAccount.ts:47` reads `VITE_PPQ_API_KEY`.

The comments are clear, but comments do not stop an accidental production
deploy with a dev secret in the environment.

Recommendation: add a production build-time guard that fails if
`VITE_APP_USER_NSEC`, `VITE_PPQ_API_KEY`, or similar dev credential variables
are set in production. A small Vite config assertion is enough.

### 10. `ChartStyle` uses raw CSS injection without value validation

Severity: Low-Medium

The shadcn chart helper injects generated CSS through
`dangerouslySetInnerHTML`:

- `src/components/ui/chart.tsx:94` renders a `<style>` tag.
- `src/components/ui/chart.tsx:95` uses `dangerouslySetInnerHTML`.
- `src/components/ui/chart.tsx:105` interpolates config keys and colors into
  CSS custom properties.

This appears to be a local component configuration surface, not currently a
Nostr event rendering path. Still, it is an important guardrail: if chart config
is ever fed from user, relay, or AI-generated data, this becomes CSS injection.

Recommendation: keep chart config local-only, or validate keys as CSS
identifier fragments and colors as known-safe CSS color values before injection.
Add a comment near the component explaining that untrusted values must not be
passed into `ChartStyle`.

### 11. Large files concentrate too many responsibilities

Severity: Technical Debt

Several files are large enough that UI, orchestration, persistence, network
calls, and error handling are difficult to review independently:

- `src/components/VideoComposerDialog.tsx` - 1,076 lines.
- `src/hooks/useGenerateVideoPipeline.ts` - 921 lines.
- `src/components/wallet/WalletPanel.tsx` - 798 lines.
- `src/components/persona/PostWizardDialog.tsx` - 739 lines.
- `src/pages/Onboard.tsx` - 580 lines.
- `src/hooks/useWallet.ts` - 569 lines.
- `src/lib/ppq/client.ts` - 520 lines.

The risk is not file length by itself; it is that sensitive flows now require
reviewing a broad surface to understand invariants. This increases the chance
of stale UI state, duplicate network actions, secret logging, and subtle retry
bugs.

Recommendation: split along existing responsibility boundaries. Good first
targets are extracting video checkpoint/privacy operations from the composer,
splitting wallet runtime state from wallet presentation, and separating PPQ
request transport from logging/error normalization.

## Positive Observations

- The CSP in `index.html:24` avoids `script-src 'unsafe-inline'` and
  `script-src 'unsafe-eval'`; the existing comments explain the narrower WASM
  and blob worker exceptions.
- Trust-sensitive Nostr reads reviewed in this pass constrain by author:
  personas use `authors: [user.pubkey]` in `src/hooks/usePersona.ts:94` and
  `src/hooks/usePersona.ts:148`, operator envelopes use
  `authors: [user.pubkey]` in `src/hooks/useOperatorEnvelope.ts:113`, and NIP-65
  / Blossom sync uses author-scoped filters in `src/components/NostrSync.tsx:80`
  and `src/components/NostrSync.tsx:121`.
- The hard-cut PPQ work removed the old localStorage PPQ credential path; the
  current production source of truth is the operator envelope, with the env path
  now clearly treated as a pinned/dev override.

## Suggested Remediation Order

1. Remove plaintext `nsec` backup downloads and make encrypted key storage the
   default for all key-based login paths.
2. Gate/redact PPQ and video logs, then clear video-chain IndexedDB data from
   forget-device flows.
3. Tighten event-sourced URL sanitization to HTTPS-only and validate custom
   viewer URLs.
4. Clear decrypted persona-envelope caches on account cleanup.
5. Make create-time persona profile publishing best-effort, matching the update
   flow.
6. Add production build guards for dev credential environment variables.
7. Break down the largest video, wallet, and post-composer files after the
   security fixes land.
