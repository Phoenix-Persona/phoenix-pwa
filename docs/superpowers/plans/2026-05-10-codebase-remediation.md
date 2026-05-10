# Codebase Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remediate the non-documentation technical-debt findings from `dev/reports/codebase-audit-2026-05-10.md` without changing the project docs being handled by another agent.

**Architecture:** Keep the existing `pages -> hooks -> lib` layering, but move reusable workflow logic out of route components and into focused hooks/lib helpers. Fix correctness and security debt first, then reduce coupling and duplication. Use focused Vitest coverage for pure helpers and hook behavior before refactoring UI.

**Tech Stack:** React 19, TypeScript, TanStack Query, Vitest, Nostrify, `nostr-tools`, Breez Spark SDK, PPQ client hooks.

---

## Files And Responsibilities

- Modify `src/lib/operator/index.ts`: add stable operator d-tag support to the encrypted operator envelope.
- Modify `src/hooks/useOperatorEnvelope.ts`: dedupe operator events by d-tag and reuse the current envelope d-tag on updates.
- Create `src/lib/operator/index.test.ts`: unit tests for operator envelope parsing and event-template semantics.
- Modify `src/hooks/useWallet.ts`: replace mnemonic-prefix query keys with a caller-provided non-secret wallet id.
- Modify wallet call sites: `src/components/AppHeader.tsx`, `src/pages/Dashboard.tsx`, `src/dev/WalletHarness.tsx`, `src/dev/InferencePayHarness.tsx`, `src/hooks/useDeletePersona.ts` if needed.
- Create `src/hooks/useWallet.test.tsx`: query-key isolation and connection behavior tests with mocked wallet client.
- Modify `src/hooks/usePpqAccount.ts`: convert localStorage-backed account resolution into reactive query state.
- Create `src/hooks/usePpqAccount.test.tsx`: ensure account creation, cache fallback, cache clearing, and operator-envelope persistence behavior.
- Create `src/hooks/useOperatorWallet.ts`: lazy operator-wallet hook or summary hook used by `AppHeader`.
- Modify `src/components/AppHeader.tsx`: avoid connecting/polling the operator wallet until wallet UI is opened.
- Create `src/lib/nostrIds.ts`: shared `npubToHex` helper.
- Create `src/lib/text.ts`: shared comma-list parsing helper.
- Create `src/lib/personaProfile.ts`: shared kind-0 profile metadata builder.
- Modify `src/pages/Onboard.tsx`, `src/pages/EditPersona.tsx`, `src/pages/Dashboard.tsx`, `src/pages/PersonaFeed.tsx`, `src/pages/Verify.tsx`, `src/hooks/usePersona.ts`: use shared helpers.
- Create `src/hooks/useCreatePersona.ts`: persona creation orchestration currently embedded in `Onboard`.
- Create `src/hooks/useUpdatePersona.ts`: persona encrypted backup + public profile update orchestration currently embedded in `EditPersona`.
- Create `src/hooks/usePersonaComposer.ts`: style, publish, and cross-post orchestration currently embedded in `Dashboard`.
- Modify `src/AppRouter.tsx`: add `/dev/ppq-pay` alias to existing `/dev/inference-pay`.
- Create `src/lib/features.ts`: small feature flag helpers for unfinished production UI.
- Modify `src/pages/Dashboard.tsx` and `src/pages/EditPersona.tsx`: gate disabled video/cross-post V1.5 surfaces behind feature flags.

## Task 1: Stabilize Operator Envelope Replacement

**Files:**
- Modify: `src/lib/operator/index.ts`
- Modify: `src/hooks/useOperatorEnvelope.ts`
- Test: `src/lib/operator/index.test.ts`

- [ ] **Step 1: Add failing operator schema tests**

Create `src/lib/operator/index.test.ts` with tests that encode the desired behavior:

```ts
import { describe, expect, it } from "vitest";
import {
  buildOperatorEventTemplate,
  parseOperatorEnvelope,
  PHOENIX_OPERATOR_APP,
  PHOENIX_OPERATOR_VERSION,
  type OperatorEnvelope,
} from "./index";

describe("operator envelope", () => {
  it("accepts a stable dTag inside the encrypted payload", () => {
    const env: OperatorEnvelope = {
      app: PHOENIX_OPERATOR_APP,
      version: PHOENIX_OPERATOR_VERSION,
      dTag: "operator-stable-dtag",
      created_at: 1,
    };

    expect(parseOperatorEnvelope(JSON.stringify(env))?.dTag).toBe(
      "operator-stable-dtag",
    );
  });

  it("builds kind 30078 with the caller-provided dTag", () => {
    const event = buildOperatorEventTemplate({
      dTag: "operator-stable-dtag",
      encryptedContent: "ciphertext",
      createdAt: 100,
    });

    expect(event.kind).toBe(30078);
    expect(event.tags).toEqual([["d", "operator-stable-dtag"]]);
    expect(event.created_at).toBe(100);
  });
});
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run: `npm test -- src/lib/operator/index.test.ts`

Expected: TypeScript or test failure because `OperatorEnvelope` has no `dTag`.

- [ ] **Step 3: Add `dTag` to the operator schema**

In `src/lib/operator/index.ts`, add `dTag` to `operatorEnvelopeSchema`:

```ts
dTag: z.string().min(1).max(128).optional(),
```

In `encryptOperatorEnvelope`, preserve an input d-tag:

```ts
const envelope: OperatorEnvelope = {
  app: PHOENIX_OPERATOR_APP,
  version: PHOENIX_OPERATOR_VERSION,
  dTag: payload.dTag,
  wallet: payload.wallet,
  ppq: payload.ppq,
  created_at: Math.floor(Date.now() / 1000),
};
```

Extend `OperatorEnvelopeInput`:

```ts
export interface OperatorEnvelopeInput {
  dTag?: string;
  wallet?: PersonaWallet;
  ppq?: OperatorPpqAccount;
}
```

- [ ] **Step 4: Reuse the existing d-tag on update**

In `src/hooks/useOperatorEnvelope.ts`, derive the publish d-tag from input,
current envelope, current event tag, or a new value only for first mint:

```ts
function eventDTag(event: NostrEvent | undefined): string | undefined {
  return event?.tags.find(([name]) => name === "d")?.[1];
}
```

Inside `publish(input)`:

```ts
const current = qc.getQueryData<OperatorEnvelopeState | null>(
  OPERATOR_QK(user?.pubkey),
);
const dTag =
  input.dTag ??
  current?.envelope.dTag ??
  eventDTag(current?.event) ??
  generateOperatorDTag();
const ciphertext = await encryptOperatorEnvelope(
  { ...input, dTag },
  user.pubkey,
  signer,
);
const template = buildOperatorEventTemplate({
  dTag,
  encryptedContent: ciphertext,
});
```

Return the d-tag in the optimistic envelope:

```ts
const envelope: OperatorEnvelope = {
  app: PHOENIX_OPERATOR_APP,
  version: PHOENIX_OPERATOR_VERSION,
  dTag,
  wallet: input.wallet,
  ppq: input.ppq,
  created_at: signed.created_at,
};
```

- [ ] **Step 5: Dedupe operator query results by d-tag**

In `findOperatorEnvelope`, keep only newest candidate per d-tag before
decrypting:

```ts
const latestPerD = new Map<string, NostrEvent>();
for (const ev of events) {
  if (!isCandidateOperatorEvent(ev)) continue;
  const d = ev.tags.find(([name]) => name === "d")?.[1];
  if (!d) continue;
  const existing = latestPerD.get(d);
  if (!existing || existing.created_at < ev.created_at) {
    latestPerD.set(d, ev);
  }
}
const sorted = [...latestPerD.values()].sort(
  (a, b) => b.created_at - a.created_at,
);
```

- [ ] **Step 6: Run tests and commit**

Run: `npm test`

Expected: all tests pass. Existing warnings may remain warnings only.

Commit:

```bash
git add src/lib/operator/index.ts src/hooks/useOperatorEnvelope.ts src/lib/operator/index.test.ts
git commit -m "Fix operator envelope replacement semantics"
```

## Task 2: Remove Mnemonic-Derived Wallet Query Keys

**Files:**
- Modify: `src/hooks/useWallet.ts`
- Modify: `src/components/AppHeader.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/dev/WalletHarness.tsx`
- Modify: `src/dev/InferencePayHarness.tsx`
- Test: `src/hooks/useWallet.test.tsx`

- [ ] **Step 1: Add failing key-shape tests**

Create `src/hooks/useWallet.test.tsx` with a mocked wallet client and assert
that query keys use `walletId`, not mnemonic prefixes:

```tsx
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { useWallet } from "./useWallet";

vi.mock("@/lib/wallet/client", () => ({
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  listRecentPayments: vi.fn(),
  loadWalletInfo: vi.fn(),
  receiveBolt11: vi.fn(),
  sendBolt11: vi.fn(),
}));

vi.mock("./usePpqAccount", () => ({
  usePpqAccount: () => ({
    account: null,
    balance: undefined,
    isBalanceLoading: false,
    refreshBalance: vi.fn(),
  }),
}));

function wrapper({ children }: PropsWithChildren) {
  const qc = new QueryClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useWallet", () => {
  it("requires callers to provide a non-secret walletId", () => {
    const { result } = renderHook(
      () =>
        useWallet({
          walletId: "persona:abc",
          mnemonic: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
        }),
      { wrapper },
    );

    expect(result.current).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/hooks/useWallet.test.tsx`

Expected: TypeScript failure because `walletId` is not part of
`UseWalletOptions`.

- [ ] **Step 3: Add `walletId` to `UseWalletOptions`**

In `src/hooks/useWallet.ts`:

```ts
export interface UseWalletOptions {
  /** Non-secret identity for query keys, e.g. `persona:<pubkey>`. */
  walletId: string | undefined;
  mnemonic: string | undefined;
  autoTopup?: AutoTopupConfig;
}
```

Replace query key helpers:

```ts
const WALLET_QK = (walletId: string | undefined) =>
  ["wallet", "info", walletId ?? "none"] as const;
const PAYMENTS_QK = (walletId: string | undefined) =>
  ["wallet", "payments", walletId ?? "none"] as const;
```

Use `walletId` for all `WALLET_QK`/`PAYMENTS_QK` calls.

- [ ] **Step 4: Update call sites**

Use stable, non-secret ids:

```tsx
// Dashboard
const wallet = useWallet({
  walletId: personaConfig ? `persona:${personaConfig.pubkey}` : undefined,
  mnemonic: walletSeed,
});

// AppHeader
const operatorWallet = useWallet({
  walletId: user ? `operator:${user.pubkey}` : undefined,
  mnemonic: operatorSeed,
});

// Dev harnesses
const wallet = useWallet({
  walletId: activeMnemonic ? "dev:wallet-harness" : undefined,
  mnemonic: activeMnemonic,
});
```

- [ ] **Step 5: Run tests and commit**

Run: `npm test`

Commit:

```bash
git add src/hooks/useWallet.ts src/components/AppHeader.tsx src/pages/Dashboard.tsx src/dev/WalletHarness.tsx src/dev/InferencePayHarness.tsx src/hooks/useWallet.test.tsx
git commit -m "Use non-secret wallet query keys"
```

## Task 3: Make PPQ Account State Reactive

**Files:**
- Modify: `src/hooks/usePpqAccount.ts`
- Test: `src/hooks/usePpqAccount.test.tsx`

- [ ] **Step 1: Add failing tests for create and clear**

Create tests that mock `createAccount`, `ppqAccountStore`, and
`useOperatorEnvelope`. Required cases:

```ts
it("returns a freshly created account immediately after ensureAccount resolves", async () => {});
it("clears the account from query state when signOut is called", async () => {});
it("lifts a cached account into the operator envelope without blocking reads", async () => {});
```

Each test should render `usePpqAccount`, call the exposed method, and assert
`result.current.account`.

- [ ] **Step 2: Run the tests and verify failure**

Run: `npm test -- src/hooks/usePpqAccount.test.tsx`

Expected: failures around stale `account` after create/clear.

- [ ] **Step 3: Convert account resolution to a query**

In `src/hooks/usePpqAccount.ts`, replace `useMemo` account resolution with:

```ts
const accountQuery = useQuery({
  queryKey: ACCOUNT_QK,
  queryFn: async (): Promise<PpqAccount | null> =>
    envAccount() ?? operator.envelope?.ppq ?? ppqAccountStore.load(),
  staleTime: Infinity,
});

const account = accountQuery.data ?? null;
```

When `operator.envelope?.ppq` changes, update query data with a small effect:

```ts
useEffect(() => {
  const next = envAccount() ?? operator.envelope?.ppq ?? ppqAccountStore.load();
  qc.setQueryData(ACCOUNT_QK, next);
}, [operator.envelope?.ppq, qc]);
```

- [ ] **Step 4: Update create and clear paths**

After creating or loading a cached account:

```ts
qc.setQueryData(ACCOUNT_QK, fresh);
```

In `signOut`:

```ts
ppqAccountStore.clear();
qc.setQueryData(ACCOUNT_QK, envAccount() ?? operator.envelope?.ppq ?? null);
qc.removeQueries({ queryKey: ["ppq", "balance"] });
```

- [ ] **Step 5: Run tests and commit**

Run: `npm test`

Commit:

```bash
git add src/hooks/usePpqAccount.ts src/hooks/usePpqAccount.test.tsx
git commit -m "Make PPQ account state reactive"
```

## Task 4: Lazy-Load Operator Wallet From Header

**Files:**
- Create: `src/hooks/useOperatorWallet.ts`
- Modify: `src/components/AppHeader.tsx`
- Test: `src/hooks/useOperatorWallet.test.tsx`

- [ ] **Step 1: Add a hook contract test**

Create `src/hooks/useOperatorWallet.test.tsx` proving the wallet is disabled
until requested:

```ts
it("does not pass a mnemonic to useWallet until enabled", () => {});
it("passes operator pubkey as walletId when enabled", () => {});
```

Mock `useWallet`, `useCurrentUser`, `useOperatorEnvelope`, and `readEnv`.

- [ ] **Step 2: Implement `useOperatorWallet`**

Create `src/hooks/useOperatorWallet.ts`:

```ts
import { useMemo } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useOperatorEnvelope } from "@/hooks/useOperatorEnvelope";
import { useWallet } from "@/hooks/useWallet";
import { readEnv } from "@/lib/env";

export function useOperatorWallet(enabled: boolean) {
  const { user } = useCurrentUser();
  const operator = useOperatorEnvelope();
  const seed = readEnv("VITE_WALLET_SEED") ?? operator.envelope?.wallet?.seed;
  const wallet = useWallet({
    walletId: enabled && user ? `operator:${user.pubkey}` : undefined,
    mnemonic: enabled ? seed : undefined,
  });

  return useMemo(
    () => ({ seed, wallet, operator }),
    [seed, wallet, operator],
  );
}
```

- [ ] **Step 3: Update `AppHeader`**

Replace direct `useOperatorEnvelope`/`useWallet` calls with:

```tsx
const [walletOpen, setWalletOpen] = useState(false);
const operatorWallet = useOperatorWallet(walletOpen);
```

Render the badge when `operatorWallet.seed` exists, but connect the wallet only
after `walletOpen` is true.

- [ ] **Step 4: Run tests and commit**

Run: `npm test`

Commit:

```bash
git add src/hooks/useOperatorWallet.ts src/hooks/useOperatorWallet.test.tsx src/components/AppHeader.tsx
git commit -m "Lazy load operator wallet in header"
```

## Task 5: Consolidate Shared Helpers

**Files:**
- Create: `src/lib/nostrIds.ts`
- Create: `src/lib/text.ts`
- Create: `src/lib/personaProfile.ts`
- Modify: `src/pages/Onboard.tsx`
- Modify: `src/pages/EditPersona.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/PersonaFeed.tsx`
- Modify: `src/pages/Verify.tsx`
- Modify: `src/hooks/usePersona.ts`
- Test: `src/lib/nostrIds.test.ts`, `src/lib/text.test.ts`, `src/lib/personaProfile.test.ts`

- [ ] **Step 1: Add helper tests**

Test exact behavior:

```ts
expect(parseCommaList("En, RW", ["en"])).toEqual(["en", "rw"]);
expect(parseCommaList("", ["en"])).toEqual(["en"]);
expect(buildPersonaProfileMetadata({ name: "Voice", username: "voice", bio: "Bio" }).name).toBe("voice");
```

- [ ] **Step 2: Implement helpers**

`src/lib/nostrIds.ts`:

```ts
import { nip19 } from "nostr-tools";

export function npubToHex(npub: string): string | null {
  try {
    const decoded = nip19.decode(npub);
    return decoded.type === "npub" ? decoded.data : null;
  } catch {
    return null;
  }
}
```

`src/lib/text.ts`:

```ts
export function parseCommaList(raw: string, fallback: string[]): string[] {
  const parts = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return parts.length > 0 ? parts : fallback;
}
```

`src/lib/personaProfile.ts`:

```ts
export interface BuildPersonaProfileMetadataArgs {
  name: string;
  username?: string;
  displayName?: string;
  bio: string;
  pictureUrl?: string;
  lightningAddress?: string;
}

export function buildPersonaProfileMetadata(args: BuildPersonaProfileMetadataArgs): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    name: args.username ?? args.name,
    display_name: args.displayName ?? args.name,
    about: args.bio,
    picture: args.pictureUrl ?? "",
    bot: true,
  };
  if (args.lightningAddress) metadata.lud16 = args.lightningAddress;
  if (args.pictureUrl) {
    metadata.phoenix = { reference_image: args.pictureUrl, version: 1 };
  }
  return metadata;
}
```

- [ ] **Step 3: Replace duplicated helpers**

Remove local `npubToHex` and `parseList` definitions. Replace kind-0 metadata
construction in Onboard and EditPersona with `buildPersonaProfileMetadata`.

- [ ] **Step 4: Run tests and commit**

Run: `npm test`

Commit:

```bash
git add src/lib/nostrIds.ts src/lib/text.ts src/lib/personaProfile.ts src/lib/nostrIds.test.ts src/lib/text.test.ts src/lib/personaProfile.test.ts src/pages/Onboard.tsx src/pages/EditPersona.tsx src/pages/Dashboard.tsx src/pages/PersonaFeed.tsx src/pages/Verify.tsx src/hooks/usePersona.ts
git commit -m "Consolidate persona helper utilities"
```

## Task 6: Extract Persona Creation Workflow

**Files:**
- Create: `src/hooks/useCreatePersona.ts`
- Modify: `src/pages/Onboard.tsx`
- Test: `src/hooks/useCreatePersona.test.tsx`

- [ ] **Step 1: Add hook tests for create workflow**

Mock key generation, wallet client, Lightning Address registration,
encryption, signer, and `nostr.event`. Assert the hook:

```ts
it("publishes encrypted backup and public kind 0 profile", async () => {});
it("continues persona creation when Lightning Address registration fails", async () => {});
it("writes the same dTag into persona.dTag and the kind 30078 tag", async () => {});
```

- [ ] **Step 2: Move publish orchestration into `useCreatePersona`**

The hook should expose:

```ts
export interface CreatePersonaInput {
  name: string;
  username: string;
  bio: string;
  systemPrompt: string;
  tags: string[];
  languages: string[];
  voiceId: string;
  pictureUrl?: string;
}

export function useCreatePersona() {
  return useMutation<CreatePersonaResult, Error, CreatePersonaInput>({...});
}
```

`CreatePersonaResult` must include `{ npub, envelope, backupEvent, profileEvent }`.

- [ ] **Step 3: Simplify `Onboard`**

`Onboard` keeps form state and calls:

```ts
const createPersona = useCreatePersona();
const result = await createPersona.mutateAsync(input);
navigate(`/dashboard/${result.npub}`);
```

Move optimistic query updates into the hook so every create caller gets the same
cache behavior.

- [ ] **Step 4: Run tests and commit**

Run: `npm test`

Commit:

```bash
git add src/hooks/useCreatePersona.ts src/hooks/useCreatePersona.test.tsx src/pages/Onboard.tsx
git commit -m "Extract persona creation workflow"
```

## Task 7: Extract Persona Update Workflow

**Files:**
- Create: `src/hooks/useUpdatePersona.ts`
- Modify: `src/pages/EditPersona.tsx`
- Test: `src/hooks/useUpdatePersona.test.tsx`

- [ ] **Step 1: Add hook tests for update workflow**

Required cases:

```ts
it("reuses persona.dTag when saving encrypted backup", async () => {});
it("falls back to the backup event d-tag for legacy personas", async () => {});
it("publishes kind 0 only when public profile fields changed", async () => {});
```

- [ ] **Step 2: Move save orchestration into `useUpdatePersona`**

Expose:

```ts
export interface UpdatePersonaInput {
  backupEvent: NostrEvent;
  envelope: PhoenixEnvelope;
  persona: Persona;
  publicProfile: { bio: string; pictureUrl: string };
  originalPublicProfile: { bio: string; pictureUrl: string };
}
```

The hook handles encryption, signing, publish, optional kind-0 update, and query
invalidations.

- [ ] **Step 3: Simplify `EditPersona`**

Keep form state in `EditPersonaForm`; call `updatePersona.mutateAsync(input)`.
Remove dynamic `import("nostr-tools/pure")` from the page and use shared helper
logic inside the hook.

- [ ] **Step 4: Run tests and commit**

Run: `npm test`

Commit:

```bash
git add src/hooks/useUpdatePersona.ts src/hooks/useUpdatePersona.test.tsx src/pages/EditPersona.tsx
git commit -m "Extract persona update workflow"
```

## Task 8: Extract Persona Composer Workflow

**Files:**
- Create: `src/hooks/usePersonaComposer.ts`
- Modify: `src/pages/Dashboard.tsx`
- Test: `src/hooks/usePersonaComposer.test.tsx`

- [ ] **Step 1: Add hook tests**

Required cases:

```ts
it("styles raw text with persona system prompt", async () => {});
it("publishes a kind 1 note with sources as r tags", async () => {});
it("does not fail the Nostr publish when cross-post webhook fails", async () => {});
```

- [ ] **Step 2: Implement `usePersonaComposer`**

Expose a UI-friendly state object:

```ts
export function usePersonaComposer(args: {
  persona: Persona | null;
  stylingModel: string;
  onPublished?: () => void;
}) {
  return {
    style,
    publishTextOnly,
    isStyling,
    isPublishing,
    error,
  };
}
```

Internally compose `usePpqInference`, `usePersonaPublish`, and `useCrossPost`.

- [ ] **Step 3: Simplify `Dashboard`**

Keep text field state in the page. Replace `onStyle` and `onPost` bodies with
calls into the hook. Keep toast rendering in the page unless the hook already
returns a user-facing message.

- [ ] **Step 4: Run tests and commit**

Run: `npm test`

Commit:

```bash
git add src/hooks/usePersonaComposer.ts src/hooks/usePersonaComposer.test.tsx src/pages/Dashboard.tsx
git commit -m "Extract persona composer workflow"
```

## Task 9: Add Dev Route Alias

**Files:**
- Modify: `src/AppRouter.tsx`
- Test: `src/App.test.tsx` or new `src/AppRouter.test.tsx`

- [ ] **Step 1: Add route test**

Add a simple router smoke test that confirms both paths render the same harness:

```ts
it("supports both PPQ pay dev route names", () => {
  // Render app at /dev/ppq-pay and assert harness heading.
  // Render app at /dev/inference-pay and assert harness heading.
});
```

- [ ] **Step 2: Add alias**

In `src/AppRouter.tsx`:

```tsx
<Route path="/dev/ppq-pay" element={<InferencePayHarness />} />
<Route path="/dev/inference-pay" element={<InferencePayHarness />} />
```

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

Commit:

```bash
git add src/AppRouter.tsx src/App.test.tsx
git commit -m "Add PPQ pay dev route alias"
```

## Task 10: Gate V1.5 Production Surfaces

**Files:**
- Create: `src/lib/features.ts`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/EditPersona.tsx`
- Test: `src/lib/features.test.ts`

- [ ] **Step 1: Add feature flag tests**

Create `src/lib/features.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isFeatureEnabled } from "./features";

describe("feature flags", () => {
  it("defaults unfinished V1.5 surfaces to disabled", () => {
    expect(isFeatureEnabled("videoComposer")).toBe(false);
    expect(isFeatureEnabled("crossPost")).toBe(false);
  });
});
```

- [ ] **Step 2: Implement feature helper**

`src/lib/features.ts`:

```ts
import { readEnv } from "@/lib/env";

export type FeatureName = "videoComposer" | "crossPost";

export function isFeatureEnabled(name: FeatureName): boolean {
  const key =
    name === "videoComposer"
      ? "VITE_FEATURE_VIDEO_COMPOSER"
      : "VITE_FEATURE_CROSS_POST";
  return readEnv(key) === "true";
}
```

- [ ] **Step 3: Gate Dashboard video UI**

In `Dashboard`, compute:

```ts
const showVideoComposer = isFeatureEnabled("videoComposer");
```

When false, render the text-first composer heading/copy and omit the disabled
`Generate video` button and video-specific helper copy. Keep `Style in voice`
and `Publish text-only`.

- [ ] **Step 4: Gate cross-post edit UI and dispatch**

In `EditPersona`, hide cross-post form fields unless
`isFeatureEnabled("crossPost")`. In `Dashboard`, skip webhook dispatch unless
the feature is enabled:

```ts
if (isFeatureEnabled("crossPost") && personaConfig.cross_post?.webhook_url) {
  // existing cross-post path
}
```

- [ ] **Step 5: Run tests and commit**

Run: `npm test`

Commit:

```bash
git add src/lib/features.ts src/lib/features.test.ts src/pages/Dashboard.tsx src/pages/EditPersona.tsx
git commit -m "Gate unfinished V1.5 production surfaces"
```

## Final Verification

- [ ] Run the full validation script:

```bash
npm test
```

Expected: TypeScript, ESLint, Vitest, and production build pass.

- [ ] Inspect the worktree:

```bash
git status --short
```

Expected: only intentional uncommitted files, if any.

- [ ] Manual smoke paths:

```text
/onboard
/my-personas
/dashboard/:npub
/dashboard/:npub/edit
/dev/wallet
/dev/inference-pay
/dev/ppq-pay
```

Expected: pages render; wallet does not connect from header until the wallet
dialog is opened; persona dashboard can still style and publish text.

## Coverage Check

Included non-documentation audit findings:

- Finding 1: Task 1.
- Finding 2: Task 2.
- Finding 3: Task 3.
- Finding 4: Task 4.
- Finding 5: Tasks 6, 7, and 8.
- Finding 6: Task 5.
- Finding 8 code-side route drift: Task 9.
- Finding 9 code-side scope drift: Task 10.
- Finding 10: Tests are included in each task.

Excluded by request:

- Finding 7 documentation refresh.
- Documentation-only parts of Findings 8 and 9.
