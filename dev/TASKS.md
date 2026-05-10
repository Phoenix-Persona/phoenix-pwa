# Active task list — `feature/wallet-ui-l402`

Branch off `main` doing wallet UI + L402 image gen + compose-flow fixes.
Architecture decision (verified 2026-05-09): **hybrid payment** — L402
per-request for image generation, credits + NWC auto-topup for chat.
**Voice / TTS deferred from V1** (no L402 TTS provider; PPQ TTS is
credits-only and we don't want to grow the credits surface for
something we can ship without). See `dev/PROJECT.md` §6, §7, §10 for
the full rationale.

---

## Verified facts (don't redo)

- `POST /v1/chat/completions` on PPQ → `401 Unauthorized` without bearer.
  Bearer + credits is the only path. Auto-topup machinery from PR #2
  stays.
- `POST /v1/images/generations` on PPQ → `402 Payment Required` with
  `WWW-Authenticate: Payment id="..." method="lightning"` carrying a
  ~29-sat BOLT11 invoice that expires in 5 minutes. L402 works.
- L402 token format on PPQ: `Authorization: L402 <id>:<preimage>` (the
  `id` is the `MAC...` macaroon ID from the 402 challenge).

---

## Work order

### 1. Architectural anchor commit ✅ (in progress)

Update `dev/PROJECT.md` (§6 hybrid description, §6 model table, §7.3
spend, §7.4 empty-wallet UX, §8 V1 list, §10 resolved/deferred items,
§11 file plan, §13 glossary) to reflect hybrid + voice-deferred.
Update `dev/TASKS.md` (this file) for the new work order. Update
`tasks/todo.md` to mark voice as deferred.

### 2. Fix the compose flow

`grep -rn "styleClient" src/`. If anything in `src/pages/Onboard.tsx`
or `src/pages/Dashboard.tsx` still imports it, the wizard's sample
step and the dashboard's "Style in voice" button error out.

Fix: swap call sites to `usePpqInference` from
`src/hooks/usePpqInference.ts` (already shipped, uses credits + bearer).
Pass persona system prompt as `system` message; raw text as `user`.

### 3. Quick cleanups

- Audit `src/lib/personaPost.ts` and `src/hooks/usePersonaPublish.ts`
  against the post-merge schema. Fix any reference to Jim's old
  `PersonaConfig` field names that no longer exist on `Persona`.
- Rename `model_prefs.agent` → `model_prefs.styling` in `src/lib/persona.ts`
  schema. Update §6 model table to match (already shows `styling`).
  Update `tests/wallet/*` and any other call sites.

### 4. Build the L402 client

`src/lib/inference/l402.ts`:

- Single `l402Fetch(url, init, wallet)` helper.
- Send the request without auth.
- On `402` with `WWW-Authenticate: Payment ...`, parse the header,
  extract the BOLT11 invoice (it's base64-JSON in the `request="..."`
  field; field name `methodDetails.invoice`).
- Call `wallet.sendBolt11(invoice)` (existing function in
  `src/lib/wallet/client.ts`); capture the preimage from the result.
- Retry the request with `Authorization: L402 <id>:<preimage>` where
  `<id>` is the macaroon ID from the challenge `id="..."` field.
- Return the response body.

Test against PPQ image gen first since that's the known-good L402
endpoint. ~2 hours.

### 5. Build the image inference client

`src/lib/inference/image.ts`:

- Wraps `l402Fetch` for `POST /v1/images/generations` and (later)
  `/v1/images/edits`.
- Takes `{ wallet, prompt, model, n, size, image? }`, returns the
  generated image data (base64 or URL — PPQ docs).
- Likeness consistency: pass the persona's reference image as `image`
  input alongside the prompt for post-image generation.

~30 min.

### 6. Mint wallet seed in `Onboard.tsx`

In `Onboard.tsx`'s publish step (around line 158-232 on `topher`-branch
original — verify post-merge):

1. Import `generateMnemonic()` from `src/lib/wallet/client.ts`.
2. After generating the persona keypair, call `await generateMnemonic()`.
3. Populate a `PersonaWallet` (`kind: "spark"`, `seed`, optional
   `auto_topup` defaults — use `DEFAULT_AUTO_TOPUP_CONFIG`).
4. Pass to `encryptPhoenixEnvelope({ persona, wallet }, ...)`.

Personas created today land with `wallet: undefined` — without this
they can't pay for inference at all. ~30 min.

### 7. `/dev/wallet` harness

`src/dev/WalletHarness.tsx`, wired into `AppRouter.tsx`. Per
`dev/STREAMS.md` §A2: generate seed → init wallet → balance → invoice
→ send/receive → tx history. Demoable in isolation. ~30 min.

### 8. `/dev/inference-pay` harness

`src/dev/InferencePayHarness.tsx`. Per `dev/STREAMS.md` §A3 (renamed
from `/dev/ppq-pay` since it's now the hybrid demo):

- One button: "Run a chat completion (credits)" — uses
  `usePpqInference` + auto-topup from the wallet.
- One button: "Generate an image (L402)" — uses the new image
  inference client; wallet pays the per-request invoice.
- Both render cost in sats and latency.

This is THE Stream A headline demo. ~1-2 hours.

### 9. Wallet UI in Dashboard

When the user is logged into a persona (active persona via
`useCurrentUser` / `useLoggedInAccounts`), Dashboard shows:

- **Wallet badge** in the header: balance in sats + tiny status icon.
- **Wallet panel** (collapsible or modal): Lightning Address (with
  copy button + QR), receive (generate invoice), send (paste invoice),
  recent transactions, credit balance + auto-topup status, danger zone
  (download backup).

Reuse the components from `/dev/wallet` — same React components, just
embedded in the Dashboard layout. ~1 hour.

### 10. Pre-fund a demo wallet

Generate a fresh BIP-39 seed; receive ~50k sats; capture in
`docs/demo-funding.md` (gitignored). Independent of code work. ~15 min.

### 11. PR back to main

Full test pass (`npm test`); end-to-end smoke (create a persona, fund
its wallet, generate an image, publish a styled post); merge.

---

## On hold

- **Stream B harnesses** (Topher's `/dev/agent`, `/dev/styling`,
  `/dev/image-gen`, `/dev/voice-gen`, `/dev/zap`) — paused until the
  wallet UI is wired and demoable.
- **Stream C composites** (Derek's `/dev/persona-create`,
  `/dev/persona-restore` + main UI integration) — Derek's lane.
- **TTS / voice generation** — V2. No L402 provider; we don't want to
  expand the credits surface for it.

---

## Cleanup TBD (post-PR)

After this branch merges:

- The `tests/wallet/test-auto-topup-and-inference.ts` script tests the
  auto-topup flow. Stays useful (auto-topup is still in the architecture
  for chat). Just verify it still passes after schema changes.
- `tests/ai-services/test-all-ppq-services-e2e.ts` may exercise TTS;
  drop those test cases since we're not shipping TTS in V1.
