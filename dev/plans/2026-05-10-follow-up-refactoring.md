# Follow-Up Refactoring Implementation Plan

> **Status: SHIPPED** in PR #20 (`fix/ui-polish`, merged 2026-05-10). All six tasks completed: OperatorWalletInit hook warning fix, URL sanitization library, public persona profile hook, query key factories, centralised Nostr publish helper, and route-component decomposition (`DashboardComposerCard`, `PersonaHero`, `EditPersonaIdentityFields`, `EditPersonaPublicProfileFields`, `EditPersonaCrossPostFields`).
>
> The component-adoption follow-up (wiring those extracted components into their consumer pages) shipped separately in PR #21 — see `2026-05-10-adopt-extracted-persona-components.md`.

**Goal:** Clean up remaining code quality debt after PR #10 without blocking other pending PRs.

**Architecture:** Start with isolated, low-conflict fixes, then move shared security and query primitives into `src/lib`, and only then decompose larger route/component surfaces. Keep route components focused on rendering and delegate Nostr, wallet, and cache orchestration to hooks/lib helpers.

**Tech Stack:** React 19, TypeScript, TanStack Query, Vitest, Testing Library, Nostrify, Vite.

---

## Execution Notes

- PR #10 (`fix/ui-polish`) must either be merged or used as the base branch before executing tasks that touch its new hooks/helpers.
- The current workspace has unrelated local edits in wallet/persona files. Before executing, run `git status --short` and either commit, stash, or move those edits to their own branch.
- Run `npm test` after every task. Existing warnings should be tracked explicitly and not ignored silently.
- Keep commits scoped to each task. Do not mix unrelated local changes into these cleanup commits.

## Files And Responsibilities

- Modify `src/components/OperatorWalletInit.tsx`: remove the remaining React hook dependency warning without changing mint semantics.
- Create `src/lib/url.ts`: shared strict URL sanitization helpers for links and media/profile image URLs.
- Create `src/lib/url.test.ts`: sanitizer unit tests for allowed and rejected protocols.
- Modify `src/components/PostBody.tsx`: use the shared URL sanitizer instead of a private duplicate.
- Modify `src/components/auth/AccountSwitcher.tsx`: sanitize Nostr profile picture URLs before rendering avatar images.
- Modify `src/pages/Dashboard.tsx`: sanitize persona profile image URLs before rendering.
- Modify `src/pages/PersonaFeed.tsx`: sanitize persona profile image URLs before rendering.
- Modify `src/pages/MyPersonas.tsx`: sanitize encrypted-backup reference image URLs before rendering.
- Create `src/hooks/usePersonaPublicProfile.ts`: fetch and parse public kind-0 metadata for a persona pubkey.
- Create `src/hooks/usePersonaPublicProfile.test.tsx`: query behavior and malformed metadata tests.
- Modify `src/pages/EditPersona.tsx`: replace inline public profile query/hydration with `usePersonaPublicProfile`.
- Create `src/lib/queryKeys.ts`: central query-key factories for persona, author, wallet, PPQ, and public profile queries.
- Create `src/lib/queryKeys.test.ts`: key-shape and stability tests.
- Modify hooks/pages using affected query keys: `src/hooks/useAuthor.ts`, `src/hooks/usePersona.ts`, `src/hooks/useCreatePersona.ts`, `src/hooks/useUpdatePersona.ts`, `src/hooks/useWallet.ts`, `src/hooks/usePpqAccount.ts`, and `src/pages/EditPersona.tsx`.
- Create `src/lib/nostrPublish.ts`: shared publish timeout constants/helpers.
- Create `src/lib/nostrPublish.test.ts`: timeout option and event forwarding tests with mocked Nostr publisher.
- Modify publish callers: `src/hooks/usePersonaPublish.ts`, `src/hooks/useCreatePersona.ts`, `src/hooks/useUpdatePersona.ts`, `src/hooks/useOperatorEnvelope.ts`, and `src/hooks/useRegisterPersonaLightningAddress.ts` if it still exists after other PRs land.
- Later, modify route/UI components: `src/pages/Dashboard.tsx`, `src/pages/EditPersona.tsx`, `src/pages/Onboard.tsx`, and new local components under `src/components/persona/`.

## Task 1: Clear OperatorWalletInit Hook Warning

**Files:**
- Modify: `src/components/OperatorWalletInit.tsx`
- Test: existing `npm test`

- [ ] **Step 1: Confirm the warning**

Run:

```bash
npm test
```

Expected: tests pass, with one warning similar to:

```text
src/components/OperatorWalletInit.tsx
  61:6  warning  React Hook useEffect has a missing dependency: 'operator'
```

- [ ] **Step 2: Destructure stable hook fields**

Replace the local `operator` object usage in `src/components/OperatorWalletInit.tsx` with destructured fields so the dependency array reflects exactly what the effect reads:

```tsx
export function OperatorWalletInit() {
  const { user } = useCurrentUser();
  const {
    envelope,
    isLoading,
    isMinting,
    mint,
  } = useOperatorEnvelope();
  const ran = useRef(false);

  useEffect(() => {
    if (!user) {
      ran.current = false;
      return;
    }
    if (isLoading) return;
    if (envelope) return;
    if (isMinting) return;
    if (ran.current) return;
    if (envOverrideComplete()) return;

    ran.current = true;
    mint(undefined).catch((err) => {
      console.warn("[OperatorWalletInit] mint failed:", err);
      ran.current = false;
    });
  }, [user, isLoading, envelope, isMinting, mint]);

  return null;
}
```

- [ ] **Step 3: Verify warning is gone**

Run:

```bash
npm test
```

Expected: TypeScript, ESLint, Vitest, and build pass. The `OperatorWalletInit` exhaustive-deps warning should no longer appear. The existing Vite polyfill deprecation warning may remain.

- [ ] **Step 4: Commit**

```bash
git add src/components/OperatorWalletInit.tsx
git commit -m "Fix operator wallet init effect dependencies"
```

## Task 2: Add Shared URL Sanitization

**Files:**
- Create: `src/lib/url.ts`
- Create: `src/lib/url.test.ts`
- Modify: `src/components/PostBody.tsx`
- Modify: `src/components/auth/AccountSwitcher.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/PersonaFeed.tsx`
- Modify: `src/pages/MyPersonas.tsx`

- [ ] **Step 1: Add failing sanitizer tests**

Create `src/lib/url.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { sanitizeHttpUrl } from "./url";

describe("sanitizeHttpUrl", () => {
  it("allows http and https URLs", () => {
    expect(sanitizeHttpUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(sanitizeHttpUrl("http://example.com/a")).toBe("http://example.com/a");
  });

  it("rejects executable or embedded protocols", () => {
    expect(sanitizeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeHttpUrl("data:image/svg+xml,<svg></svg>")).toBeNull();
    expect(sanitizeHttpUrl("blob:https://example.com/id")).toBeNull();
    expect(sanitizeHttpUrl("file:///etc/passwd")).toBeNull();
  });

  it("rejects blank, malformed, and relative URLs", () => {
    expect(sanitizeHttpUrl(undefined)).toBeNull();
    expect(sanitizeHttpUrl("")).toBeNull();
    expect(sanitizeHttpUrl("/avatar.png")).toBeNull();
    expect(sanitizeHttpUrl("not a url")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- src/lib/url.test.ts
```

Expected: TypeScript failure because `src/lib/url.ts` does not exist.

- [ ] **Step 3: Implement the sanitizer**

Create `src/lib/url.ts`:

```ts
export function sanitizeHttpUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Replace the duplicate PostBody sanitizer**

In `src/components/PostBody.tsx`, remove the local `sanitizeUrl` function and import the shared helper:

```tsx
import { sanitizeHttpUrl } from "@/lib/url";
```

Then update the tokenizer URL pass:

```ts
const sanitized = sanitizeHttpUrl(m[0]);
```

- [ ] **Step 5: Sanitize account switcher avatar URLs**

In `src/components/auth/AccountSwitcher.tsx`, import the helper:

```tsx
import { sanitizeHttpUrl } from "@/lib/url";
```

Inside the component, add:

```tsx
const currentPicture = sanitizeHttpUrl(currentUser.metadata.picture);
```

Use it for the current avatar:

```tsx
<AvatarImage
  src={currentPicture ?? undefined}
  alt={getDisplayName(currentUser)}
  crossOrigin="anonymous"
/>
```

For the `otherUsers.map`, compute a sanitized picture inside the callback:

```tsx
{otherUsers.map((user) => {
  const picture = sanitizeHttpUrl(user.metadata.picture);
  return (
    <DropdownMenuItem
      key={user.id}
      onClick={() => setLogin(user.id)}
      className="flex items-center gap-2 cursor-pointer p-2 rounded-md"
    >
      <Avatar className="w-8 h-8">
        <AvatarImage
          src={picture ?? undefined}
          alt={getDisplayName(user)}
          crossOrigin="anonymous"
        />
        <AvatarFallback>{getDisplayName(user)?.charAt(0) || <UserIcon />}</AvatarFallback>
      </Avatar>
      <div className="flex-1 truncate">
        <p className="text-sm font-medium">{getDisplayName(user)}</p>
      </div>
      {user.id === currentUser.id && <div className="w-2 h-2 rounded-full bg-primary" />}
    </DropdownMenuItem>
  );
})}
```

- [ ] **Step 6: Sanitize persona profile images**

In `src/pages/Dashboard.tsx` and `src/pages/PersonaFeed.tsx`, import:

```tsx
import { sanitizeHttpUrl } from "@/lib/url";
```

Replace:

```ts
const picture = author.data?.metadata?.picture;
```

with:

```ts
const picture = sanitizeHttpUrl(author.data?.metadata?.picture);
```

In `src/pages/MyPersonas.tsx`, sanitize `persona.reference_image_url` before rendering any `<img>`:

```tsx
const picture = sanitizeHttpUrl(persona.reference_image_url);
```

and use:

```tsx
{picture ? (
  <img
    src={picture}
    alt=""
    className="h-full w-full object-cover"
    loading="lazy"
    crossOrigin="anonymous"
  />
) : (
  <ImigongoSeal size={40} colorClass="text-rw-gold/80" />
)}
```

- [ ] **Step 7: Verify**

Run:

```bash
npm test -- src/lib/url.test.ts
```

Expected: all tests pass.

Then run:

```bash
npm test
```

Expected: full validation passes.

- [ ] **Step 8: Commit**

```bash
git add src/lib/url.ts src/lib/url.test.ts src/components/PostBody.tsx src/components/auth/AccountSwitcher.tsx src/pages/Dashboard.tsx src/pages/PersonaFeed.tsx src/pages/MyPersonas.tsx
git commit -m "Sanitize event-sourced image URLs"
```

## Task 3: Extract Public Persona Profile Query

**Files:**
- Create: `src/hooks/usePersonaPublicProfile.ts`
- Create: `src/hooks/usePersonaPublicProfile.test.tsx`
- Modify: `src/pages/EditPersona.tsx`

- [ ] **Step 1: Add failing hook tests**

Create `src/hooks/usePersonaPublicProfile.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { NostrEvent } from "@nostrify/nostrify";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePersonaPublicProfile } from "./usePersonaPublicProfile";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("@nostrify/react", () => ({
  useNostr: () => ({ nostr: { query: mocks.query } }),
}));

function wrapper({ children }: PropsWithChildren) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function kind0(content: string): NostrEvent {
  return {
    id: "event-id",
    pubkey: "persona-pubkey",
    kind: 0,
    created_at: 1,
    tags: [],
    content,
    sig: "sig",
  };
}

describe("usePersonaPublicProfile", () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it("loads bio and picture from kind 0 metadata", async () => {
    mocks.query.mockResolvedValueOnce([
      kind0(JSON.stringify({ about: "Bio", picture: "https://example.com/a.png" })),
    ]);

    const { result } = renderHook(
      () => usePersonaPublicProfile("persona-pubkey"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      bio: "Bio",
      picture: "https://example.com/a.png",
    });
    expect(mocks.query).toHaveBeenCalledWith(
      [{ kinds: [0], authors: ["persona-pubkey"], limit: 1 }],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("returns empty fields for missing or malformed metadata", async () => {
    mocks.query.mockResolvedValueOnce([kind0("{bad json")]);

    const { result, rerender } = renderHook(
      ({ pubkey }) => usePersonaPublicProfile(pubkey),
      { wrapper, initialProps: { pubkey: "persona-pubkey" } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ bio: "", picture: "" });

    mocks.query.mockResolvedValueOnce([]);
    await act(async () => {
      rerender({ pubkey: "other-pubkey" });
    });
    await waitFor(() => expect(result.current.data).toEqual({ bio: "", picture: "" }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- src/hooks/usePersonaPublicProfile.test.tsx
```

Expected: TypeScript failure because `usePersonaPublicProfile` does not exist.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/usePersonaPublicProfile.ts`:

```ts
import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";

export interface PersonaPublicProfile {
  bio: string;
  picture: string;
}

export function usePersonaPublicProfile(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ["persona-public-profile", pubkey ?? ""],
    enabled: Boolean(pubkey),
    queryFn: async (c): Promise<PersonaPublicProfile> => {
      if (!pubkey) return { bio: "", picture: "" };
      const events = await nostr.query(
        [{ kinds: [0], authors: [pubkey], limit: 1 }],
        { signal: c.signal },
      );
      const event = events[0];
      if (!event) return { bio: "", picture: "" };
      try {
        const meta = JSON.parse(event.content) as {
          about?: unknown;
          picture?: unknown;
        };
        return {
          bio: typeof meta.about === "string" ? meta.about : "",
          picture: typeof meta.picture === "string" ? meta.picture : "",
        };
      } catch {
        return { bio: "", picture: "" };
      }
    },
  });
}
```

- [ ] **Step 4: Replace inline query in EditPersona**

In `src/pages/EditPersona.tsx`, remove the direct `useNostr` and `useQuery` imports if they are only used for public profile hydration. Import:

```tsx
import { usePersonaPublicProfile } from "@/hooks/usePersonaPublicProfile";
```

Replace the inline `PublicProfile` interface and `useQuery` block with:

```tsx
const profileQuery = usePersonaPublicProfile(original.pubkey);
```

Keep the existing guarded state hydration:

```tsx
if (!bioHydrated && profileQuery.data !== undefined) {
  setBio(profileQuery.data.bio);
  setOriginalBio(profileQuery.data.bio);
  setBioHydrated(true);
}
if (!pictureHydrated && profileQuery.data !== undefined) {
  const publicPicture = profileQuery.data.picture;
  if (publicPicture) {
    setPictureUrl(publicPicture);
    setOriginalPicture(publicPicture);
  }
  setPictureHydrated(true);
}
```

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- src/hooks/usePersonaPublicProfile.test.tsx
```

Expected: hook tests pass.

Then run:

```bash
npm test
```

Expected: full validation passes.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/usePersonaPublicProfile.ts src/hooks/usePersonaPublicProfile.test.tsx src/pages/EditPersona.tsx
git commit -m "Extract persona public profile hook"
```

## Task 4: Introduce Query Key Factories

**Files:**
- Create: `src/lib/queryKeys.ts`
- Create: `src/lib/queryKeys.test.ts`
- Modify: `src/hooks/useAuthor.ts`
- Modify: `src/hooks/usePersona.ts`
- Modify: `src/hooks/useCreatePersona.ts`
- Modify: `src/hooks/useUpdatePersona.ts`
- Modify: `src/hooks/useWallet.ts`
- Modify: `src/hooks/usePpqAccount.ts`
- Modify: `src/hooks/usePersonaPublicProfile.ts`

- [ ] **Step 1: Add failing query-key tests**

Create `src/lib/queryKeys.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { queryKeys } from "./queryKeys";

describe("queryKeys", () => {
  it("keeps persona keys stable and explicit", () => {
    expect(queryKeys.persona.detail("npub1abc", "user-pubkey")).toEqual([
      "phoenix-persona",
      "npub1abc",
      "user-pubkey",
    ]);
    expect(queryKeys.persona.mine("user-pubkey")).toEqual([
      "phoenix-my-personas",
      "user-pubkey",
    ]);
    expect(queryKeys.persona.publicProfile("persona-pubkey")).toEqual([
      "persona-public-profile",
      "persona-pubkey",
    ]);
  });

  it("keeps wallet keys keyed by non-secret wallet id", () => {
    expect(queryKeys.wallet.info("persona:abc")).toEqual([
      "wallet",
      "info",
      "persona:abc",
    ]);
    expect(queryKeys.wallet.payments("persona:abc")).toEqual([
      "wallet",
      "payments",
      "persona:abc",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- src/lib/queryKeys.test.ts
```

Expected: TypeScript failure because `src/lib/queryKeys.ts` does not exist.

- [ ] **Step 3: Implement query key factories**

Create `src/lib/queryKeys.ts`:

```ts
export const queryKeys = {
  nostr: {
    author: (pubkey: string | undefined) =>
      ["nostr", "author", pubkey ?? ""] as const,
  },
  persona: {
    detail: (npub: string | undefined, userPubkey: string | undefined) =>
      ["phoenix-persona", npub, userPubkey] as const,
    mine: (userPubkey: string | undefined) =>
      ["phoenix-my-personas", userPubkey] as const,
    activity: (pubkeysKey: string) =>
      ["phoenix-persona-activity", pubkeysKey] as const,
    posts: (npub: string | undefined, limit: number) =>
      ["phoenix-persona-posts", npub, limit] as const,
    publicProfile: (pubkey: string | undefined) =>
      ["persona-public-profile", pubkey ?? ""] as const,
  },
  wallet: {
    handle: (walletId: string | undefined) =>
      ["wallet", "handle", walletId ?? ""] as const,
    info: (walletId: string | undefined) =>
      ["wallet", "info", walletId ?? ""] as const,
    payments: (walletId: string | undefined) =>
      ["wallet", "payments", walletId ?? ""] as const,
  },
  ppq: {
    account: (operatorPubkey: string | undefined) =>
      ["ppq-account", operatorPubkey ?? ""] as const,
    balance: (creditId: string | undefined) =>
      ["ppq-balance", creditId ?? ""] as const,
  },
} as const;
```

- [ ] **Step 4: Replace query key literals incrementally**

Update `src/hooks/useAuthor.ts`:

```ts
import { queryKeys } from "@/lib/queryKeys";
```

Use:

```ts
queryKey: queryKeys.nostr.author(pubkey),
```

Update `src/hooks/usePersonaPublicProfile.ts`:

```ts
queryKey: queryKeys.persona.publicProfile(pubkey),
```

Update `src/hooks/usePersona.ts`:

```ts
queryKey: queryKeys.persona.detail(npub, user?.pubkey),
queryKey: queryKeys.persona.mine(user?.pubkey),
queryKey: queryKeys.persona.activity(sorted.join(",")),
queryKey: queryKeys.persona.posts(npub, limit),
```

For invalidations in creation/update hooks, prefer prefixes where the existing behavior invalidates broad families:

```ts
queryClient.invalidateQueries({ queryKey: ["phoenix-persona"] });
queryClient.invalidateQueries({ queryKey: ["phoenix-my-personas"] });
queryClient.invalidateQueries({ queryKey: ["nostr", "author"] });
queryClient.invalidateQueries({ queryKey: ["persona-public-profile"] });
```

If TanStack exact matching is required, keep these prefix arrays as-is and add comments saying the factories are for exact keys while invalidations intentionally use prefixes.

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- src/lib/queryKeys.test.ts
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/queryKeys.ts src/lib/queryKeys.test.ts src/hooks/useAuthor.ts src/hooks/usePersona.ts src/hooks/useCreatePersona.ts src/hooks/useUpdatePersona.ts src/hooks/useWallet.ts src/hooks/usePpqAccount.ts src/hooks/usePersonaPublicProfile.ts
git commit -m "Centralize query key factories"
```

## Task 5: Centralize Nostr Publish Timeout

**Files:**
- Create: `src/lib/nostrPublish.ts`
- Create: `src/lib/nostrPublish.test.ts`
- Modify: `src/hooks/usePersonaPublish.ts`
- Modify: `src/hooks/useCreatePersona.ts`
- Modify: `src/hooks/useUpdatePersona.ts`
- Modify: `src/hooks/useOperatorEnvelope.ts`
- Modify: `src/hooks/useRegisterPersonaLightningAddress.ts` if present

- [ ] **Step 1: Add failing helper tests**

Create `src/lib/nostrPublish.test.ts`:

```ts
import type { NostrEvent } from "@nostrify/nostrify";
import { describe, expect, it, vi } from "vitest";

import { NOSTR_PUBLISH_TIMEOUT_MS, publishNostrEvent } from "./nostrPublish";

function event(): NostrEvent {
  return {
    id: "event-id",
    pubkey: "pubkey",
    kind: 1,
    created_at: 1,
    tags: [],
    content: "hello",
    sig: "sig",
  };
}

describe("publishNostrEvent", () => {
  it("publishes with the shared timeout", async () => {
    const nostr = { event: vi.fn().mockResolvedValue(undefined) };

    await publishNostrEvent(nostr, event());

    expect(NOSTR_PUBLISH_TIMEOUT_MS).toBe(8000);
    expect(nostr.event).toHaveBeenCalledWith(
      expect.objectContaining({ id: "event-id" }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- src/lib/nostrPublish.test.ts
```

Expected: TypeScript failure because `src/lib/nostrPublish.ts` does not exist.

- [ ] **Step 3: Implement publish helper**

Create `src/lib/nostrPublish.ts`:

```ts
import type { NostrEvent } from "@nostrify/nostrify";

export const NOSTR_PUBLISH_TIMEOUT_MS = 8000;

export interface NostrPublisher {
  event(
    event: NostrEvent,
    opts?: { signal?: AbortSignal },
  ): Promise<unknown>;
}

export async function publishNostrEvent(
  nostr: NostrPublisher,
  event: NostrEvent,
): Promise<void> {
  await nostr.event(event, {
    signal: AbortSignal.timeout(NOSTR_PUBLISH_TIMEOUT_MS),
  });
}
```

- [ ] **Step 4: Replace direct timeout calls**

Replace direct calls like:

```ts
await nostr.event(event, { signal: AbortSignal.timeout(8000) });
```

with:

```ts
await publishNostrEvent(nostr, event);
```

Apply this in the publish hooks listed above. Keep query fetch timeouts, such as author lookup `AbortSignal.timeout(1500)`, unchanged.

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- src/lib/nostrPublish.test.ts
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nostrPublish.ts src/lib/nostrPublish.test.ts src/hooks/usePersonaPublish.ts src/hooks/useCreatePersona.ts src/hooks/useUpdatePersona.ts src/hooks/useOperatorEnvelope.ts src/hooks/useRegisterPersonaLightningAddress.ts
git commit -m "Centralize Nostr publish timeout"
```

## Task 6: Split Route UI Into Focused Presentational Components

**Files:**
- Create: `src/components/persona/DashboardComposerCard.tsx`
- Create: `src/components/persona/PersonaHero.tsx`
- Create: `src/components/persona/EditPersonaFormFields.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/EditPersona.tsx`
- Modify: `src/pages/Onboard.tsx`

This task is intentionally last because it is most likely to conflict with pending PRs.

- [ ] **Step 1: Extract the dashboard composer card without behavior changes**

Create `src/components/persona/DashboardComposerCard.tsx` with props that keep state ownership in `Dashboard`. The initial extraction should be a direct move of the composer `<Card>` subtree from `src/pages/Dashboard.tsx`; do not rename labels, change disabled states, or alter toast behavior in this task.

```tsx
import { FileText, Film, Loader2, Sparkles, Wand2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { Persona } from "@/lib/persona";

interface DashboardComposerCardProps {
  persona: Persona;
  raw: string;
  sourcesInput: string;
  hintsInput: string;
  videoGenerationEnabled: boolean;
  crossPostEnabled: boolean;
  walletSeed: string | undefined;
  isStyling: boolean;
  isPublishing: boolean;
  onRawChange: (value: string) => void;
  onSourcesChange: (value: string) => void;
  onHintsChange: (value: string) => void;
  onDiscard: () => void;
  onStyle: () => void;
  onPost: () => void;
}

export function DashboardComposerCard(props: DashboardComposerCardProps) {
  const {
    persona,
    raw,
    sourcesInput,
    hintsInput,
    videoGenerationEnabled,
    crossPostEnabled,
    walletSeed,
    isStyling,
    isPublishing,
    onRawChange,
    onSourcesChange,
    onHintsChange,
    onDiscard,
    onStyle,
    onPost,
  } = props;

  const disabled = isPublishing || isStyling;

  return (
    <Card className="border-imigongo-clay/20 bg-gradient-to-br from-card via-card to-rw-gold-soft/10 overflow-hidden">
      <div className="bg-gradient-to-r from-rw-sky/10 via-rw-gold/10 to-rw-green/10 px-6 py-4 border-b border-imigongo-clay/15 flex items-center gap-2">
        {videoGenerationEnabled ? (
          <Film className="size-5 text-imigongo-clay" aria-hidden="true" />
        ) : (
          <FileText className="size-5 text-imigongo-clay" aria-hidden="true" />
        )}
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-2xl font-medium tracking-tight">
            {videoGenerationEnabled ? "Compose a video" : "Compose a post"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {videoGenerationEnabled
              ? "Idea + sources + hints feed the AI prompt that generates the persona's video. Text-only posting is available as a fallback."
              : "Draft a note, optionally style it in the persona's voice, and publish it to relays."}
          </p>
        </div>
      </div>
      <CardContent className="space-y-5 pt-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="composer-raw" className="text-sm font-medium">
              Idea
            </label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {raw.length} chars
            </span>
          </div>
          <Textarea
            id="composer-raw"
            rows={5}
            value={raw}
            onChange={(e) => onRawChange(e.target.value)}
            placeholder="What does the persona need to say? Drop the rawest version of your brief."
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && raw.trim() && !isPublishing) {
                e.preventDefault();
                onPost();
              }
            }}
            className="resize-y min-h-[8rem] bg-background/60"
          />
        </div>

        <div className={videoGenerationEnabled ? "grid sm:grid-cols-2 gap-4" : "grid gap-4"}>
          <div className="space-y-2">
            <label htmlFor="composer-sources" className="text-sm font-medium">
              Sources <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              id="composer-sources"
              rows={2}
              value={sourcesInput}
              onChange={(e) => onSourcesChange(e.target.value)}
              placeholder="https://hrw.org/..., https://cpj.org/..."
              className="text-sm bg-background/60 resize-none"
            />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Comma-separated URLs. Sources publish as <code className="font-mono">r</code> tags.
            </p>
          </div>
          {videoGenerationEnabled ? (
            <div className="space-y-2">
              <label htmlFor="composer-hints" className="text-sm font-medium">
                Style hints <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                id="composer-hints"
                rows={2}
                value={hintsInput}
                onChange={(e) => onHintsChange(e.target.value)}
                placeholder="measured, first-person, vertical 9:16"
                className="text-sm bg-background/60 resize-none"
              />
            </div>
          ) : null}
        </div>

        {crossPostEnabled && persona.cross_post?.webhook_url ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rw-sky/25 bg-rw-sky/5 px-4 py-2.5 text-xs">
            <span className="font-medium text-foreground">Cross-post:</span>
            <span className="text-muted-foreground">Will dispatch to your webhook</span>
            {(persona.cross_post.webhook_platforms ?? []).map((platform) => (
              <Badge
                key={platform}
                variant="secondary"
                className="text-[10px] bg-rw-sky/10 text-rw-sky border border-rw-sky/20"
              >
                {platform}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="space-y-3 pt-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" onClick={onDiscard} disabled={disabled}>
              Discard
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={onStyle}
                disabled={isStyling || isPublishing || !raw.trim() || !walletSeed}
                title={!walletSeed ? "Mint a new persona to enable AI styling" : "Rewrite the idea in the persona's voice"}
              >
                {isStyling ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                    Styling...
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 size-4" aria-hidden="true" />
                    Style in voice
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={onPost}
                disabled={isPublishing || isStyling || !raw.trim()}
                title="Publish a text-only kind 1 note"
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 size-4" aria-hidden="true" />
                    Publish text-only
                  </>
                )}
              </Button>
              {videoGenerationEnabled ? (
                <Button disabled className="shadow-lg shadow-primary/20">
                  <Sparkles className="mr-2 size-4" aria-hidden="true" />
                  Generate video
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

When reconciling with the current `Dashboard.tsx`, preserve any copy or class names that changed after this plan was written. The behavioral replacements are:

```tsx
raw -> props.raw
setRaw -> props.onRawChange
sourcesInput -> props.sourcesInput
setSourcesInput -> props.onSourcesChange
hintsInput -> props.hintsInput
setHintsInput -> props.onHintsChange
composer.isStyling -> props.isStyling
composer.isPublishing -> props.isPublishing
```

- [ ] **Step 2: Wire Dashboard to the composer component**

In `src/pages/Dashboard.tsx`, import:

```tsx
import { DashboardComposerCard } from "@/components/persona/DashboardComposerCard";
```

Replace the inline composer card with:

```tsx
<DashboardComposerCard
  persona={personaConfig}
  raw={raw}
  sourcesInput={sourcesInput}
  hintsInput={hintsInput}
  videoGenerationEnabled={videoGenerationEnabled}
  crossPostEnabled={crossPostEnabled}
  walletSeed={walletSeed}
  isStyling={composer.isStyling}
  isPublishing={composer.isPublishing}
  onRawChange={setRaw}
  onSourcesChange={setSourcesInput}
  onHintsChange={setHintsInput}
  onDiscard={() => {
    setRaw("");
    setSourcesInput("");
    setHintsInput("");
  }}
  onStyle={onStyle}
  onPost={onPost}
/>
```

- [ ] **Step 3: Verify dashboard extraction**

Run:

```bash
npm test
```

Expected: all tests pass and `Dashboard.tsx` loses a substantial block of JSX without behavior changes.

- [ ] **Step 4: Commit dashboard extraction**

```bash
git add src/components/persona/DashboardComposerCard.tsx src/pages/Dashboard.tsx
git commit -m "Extract dashboard composer card"
```

- [ ] **Step 5: Extract shared persona hero after dashboard is stable**

Create `src/components/persona/PersonaHero.tsx` only after reviewing the current `Dashboard.tsx` and `PersonaFeed.tsx` hero sections. Keep the component purely presentational:

```tsx
interface PersonaHeroProps {
  eyebrow: string;
  name: string;
  bio?: string;
  picture?: string | null;
  tags?: string[];
  actions?: React.ReactNode;
}
```

Move only repeated hero rendering. Do not move data fetching into this component.

- [ ] **Step 6: Commit hero extraction**

```bash
git add src/components/persona/PersonaHero.tsx src/pages/Dashboard.tsx src/pages/PersonaFeed.tsx
git commit -m "Extract persona hero presentation"
```

- [ ] **Step 7: Defer Onboard form decomposition until after active PRs merge**

Before touching `src/pages/Onboard.tsx`, run:

```bash
git status --short src/pages/Onboard.tsx
git log --oneline -- src/pages/Onboard.tsx | head
```

If other PRs changed onboarding recently, create a fresh plan for the onboard form split rather than folding it into this task. The current target is to avoid churn in a high-traffic route file.

## Final Verification

- [ ] **Step 1: Run full validation**

```bash
npm test
```

Expected: TypeScript, ESLint, Vitest, and build all pass.

- [ ] **Step 2: Inspect final diff**

```bash
git status --short
git diff --stat origin/main...HEAD
```

Expected: only files from this plan are changed. No unrelated local wallet/persona edits are included.

- [ ] **Step 3: Push branch and open PR**

```bash
git push -u origin <branch-name>
gh pr create --base main --head <branch-name> --title "Follow-up refactoring cleanup" --body "## Summary
- Fix remaining hook warning
- Add shared URL sanitization for profile/media rendering
- Extract public profile and shared query/publish helpers

## Test Plan
- npm test"
```
