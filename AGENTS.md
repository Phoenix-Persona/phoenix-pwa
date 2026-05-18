# Zuka Project Plan

**Read [`PROJECT.md`](./dev/PROJECT.md) first.** It is the authoritative design document for Zuka — the user-facing problem, the identity model, the persona Nostr schema, the wallet model, the AI capabilities, the V1 scope, and the demo arc. When this file and `PROJECT.md` disagree on *what* to build, **`PROJECT.md` wins**. This file describes *how* to build on the codebase (Nostr conventions, security, file layout, lint rules).

V1 has shipped. Per-feature plans live under [`dev/plans/`](./dev/plans/); shipped plans stay there as historical context, with a status banner at the top.

**Doc indexes:** [`docs/INDEX.md`](./docs/INDEX.md) (engineering & architecture) · [`dev/INDEX.md`](./dev/INDEX.md) (design plan, parallel build streams).
Current build/test/lint/smoke tooling is summarized in [`docs/CURRENT-STACK.md`](./docs/CURRENT-STACK.md).

**Zuka-specific stack additions** (beyond the MKStack base described below):

- **`pi-mono`** ([github.com/earendil-works/pi](https://github.com/earendil-works/pi)) — agent runtime (`pi-agent-core`), unified LLM API (`pi-ai`), web chat components (`pi-web-ui`)
- **PPQ** (`ppq.ai`) — OpenAI-compatible inference API, paid per-request in sats over Lightning
- **Breez Spark SDK** — per-persona Bitcoin Lightning wallet; seed phrase recoverable from the encrypted kind 30078 backup
- **NIP-49** for at-rest persona-nsec encryption; **NIP-44** for the encrypted backup event; **NIP-57** for donations

**Reuse with adaptation — don't blindly extend, don't blindly rewrite.** The early `src/lib/persona*` and `src/hooks/usePersona*` sketch matches the user/persona architecture in PROJECT.md §3 closely; adapt it to the §5 schema (stable per-persona d-tag stored as `persona.dTag` and reused on every update, no app-specific tags — discovery is scan-and-decrypt for stronger anti-fingerprinting; embedded Breez Spark wallet seed; `model_prefs`) rather than rewriting from scratch. The Vercel `/style` endpoint plan in `src/lib/styleClient.ts` is gone — replace with a `pi-ai` PPQ client (PROJECT.md §6). PROJECT.md §11 lists exactly what to reuse, rewrite, replace, add, and delete.

---

# Project Overview

Zuka is a Nostr-native PWA built with React 19.x, TailwindCSS 4.x, esbuild, Radix/Tailwind UI primitives, and Nostrify, extended with `pi-mono` (agent runtime), PPQ (Lightning-paid AI inference), and the Breez Spark SDK (per-persona Lightning wallet).

## Technology Stack

- **React 19.x**: hooks, concurrent rendering, ref-as-prop
- **TailwindCSS 4.x**: utility-first styling
- **esbuild**: production JS bundling and watched dev builds through `scripts/build.mjs` and `scripts/dev.mjs`
- **Tailwind CLI**: CSS build step, run explicitly from the build/dev scripts
- **Biome**: linting
- **node:test**: unit and integration test runner, with project helpers in `test/node`
- **Radix/Tailwind UI primitives**: copied accessible component primitives in `@/components/ui`
- **Nostrify** (`@nostrify/react`): Nostr protocol framework
- **React Router**: client-side routing with `BrowserRouter` and automatic scroll-to-top
- **TanStack Query**: data fetching, caching, state
- **TypeScript**: type-safe JS. **Never use the `any` type.**

## Project Structure

- `/src/components/` — UI components.
  - `ui/` — copied Radix/Tailwind UI primitives.
  - `auth/` — login components (`LoginArea`, `AuthDialog`, `AccountSwitcher`).
  - `wallet/` — wallet UI (`WalletPanel`, `WalletDialog`, `WalletBadge`, `SendDialog`, `ReceiveDialog`).
  - `howItWorks/` — landing-page explainer sections.
- `/src/hooks/` — custom hooks. Discover the full set with `ls src/hooks/`. Key ones: `useNostr`, `useAuthor`, `useCurrentUser`, `useNostrPublish`, `useUploadFile`, `useAppContext`, `useTheme`, `useToast`, `useLoggedInAccounts`, `useLoginActions`, `useIsMobile`. Zuka-specific: `usePersona`, `usePersonaPublish`, `useOperatorEnvelope`, `useDeletePersona`, `useWallet`, `usePpqAccount`, `usePpqInference`, `usePpqImage`, `usePpqVideo`, `usePpqTopup`, `useCrossPost`, `useInstallPrompt`, `useRegisterPersonaLightningAddress`, `useUsernameAvailability`.
- `/src/pages/` — page components wired into React Router. Current set: `Index`, `Onboard`, `Dashboard`, `EditPersona`, `MyPersonas`, `PersonaFeed`, `Verify`, `Settings`, `NIP19Page`, `NotFound`.
- `/src/lib/` — utility functions and shared logic.
  - `wallet/` — Breez Spark wallet (init, NWC, lightning address).
  - `operator/` — operator-envelope crypto and storage.
  - `ppq/` — PPQ client (`client.ts`, `storage.ts`, etc.).
  - Top-level: `persona.ts`, `personaCrypto.ts`, `personaKey.ts`, `personaPost.ts`, `appRelays.ts`, `appBlossom.ts`, `nip49Storage.ts`, `genUserName.ts`, `polyfills.ts`, `utils.ts`, `env.ts`.
- `/src/contexts/` — React context providers (`AppContext`).
- `/src/dev/` — dev harnesses for slice-by-slice testing (`WalletHarness`, `InferencePayHarness`). Routed under `/dev/*` in `AppRouter.tsx`.
- `/test/node/` — node:test setup and testing utilities including the `TestApp` wrapper.
- `/test/scripts/` — validation scripts for node:test, source policy, build verification, bundle budgets/analysis, and PWA smoke checks.
- `/test/manual/` — manual and E2E Node scripts for wallet, PPQ, and media workflows.
- `/public/` — static assets.
- `App.tsx` — **already configured** with `AppProvider`, `QueryClientProvider`, `NostrLoginProvider`, `NostrProvider`, operator cleanup/init, `NostrSync`, `TooltipProvider`, `AppToaster`, `UnlockGate`, and `AppRouter`. **Read before editing**; changes are rarely needed.
- `AppRouter.tsx` — React Router configuration. The catch-all `/:nip19` route handles all NIP-19 identifiers (see the `nip19-routing` skill).

**Always read an existing file before modifying it.** Never write over `App.tsx`, `AppRouter.tsx`, or `NostrProvider` without first reading their contents.

## UI Components

Components in `@/components/ui` are unstyled, accessible primitives styled with Tailwind. They follow a consistent pattern using `React.forwardRef` and the `cn()` class-merge utility, and many are built on Radix UI primitives. When you need a specific component, list the directory (`ls src/components/ui/`) or import from `@/components/ui/<name>` — this repo intentionally keeps only the primitives it uses.

## System Prompt Management

The assistant's behavior is defined by this file (`AGENTS.md`). Edit it directly to change guidelines — updates take effect the next session. Specialized workflows live in `/.agents/skills/` as loadable skills, discoverable through the `skill` tool.

## Nostr Protocol Integration

### When to reuse an existing NIP vs. create a new kind

1. **Always review existing NIPs first.** Use the NIP index tool, then read candidate NIPs in detail. The goal is to find the closest existing solution.
2. **Prefer extending existing NIPs** over creating custom kinds, even if it requires minor schema compromises. Custom kinds fragment the ecosystem.
3. **When existing NIPs are close but not perfect**, use the existing kind as the base and add domain-specific tags. Document extensions in `docs/NIP.md`.
4. **Only generate a new kind** when no existing NIP covers the core functionality, the data structure is fundamentally different, or the use case needs different storage characteristics (regular/replaceable/addressable).
5. **If a tool to generate a new kind number is available, you MUST use it** — don't pick an arbitrary number.
6. **Custom kinds MUST include a NIP-31 `alt` tag** with a human-readable description.

### Kind Ranges

- **Regular** (1000 ≤ kind < 10000): stored permanently by relays. Notes, articles, etc.
- **Replaceable** (10000 ≤ kind < 20000): only the latest event per `pubkey+kind` is stored. Profile metadata, contact lists.
- **Addressable** (30000 ≤ kind < 40000): identified by `pubkey+kind+d-tag`; only the latest per combo is stored. Articles, long-form content.

Kinds below 1000 are "legacy"; their storage behavior is per-kind (e.g. kind 1 is regular, kind 3 is replaceable).

### Tag Design Principles

- **Kind = schema, tags = semantics.** Don't create new kinds just to represent a different category of the same data.
- **Relays only index single-letter tags.** Use `t` for categories so filters like `'#t': ['electronics']` work at the relay level. Multi-letter tags (`product_type`, etc.) force inefficient client-side filtering.
- **Filter at the relay.** Pass tag filters in the query rather than fetching everything and filtering in JS.
- **For community/niche apps**, tag events with a `t` and query by it: `createEvent({ kind: 1, content, tags: [['t', 'farming']] })`, then `nostr.query([{ kinds: [1], '#t': ['farming'] }])`. Don't do this for generic platforms.

### Content Field Design

- **Use `content` for** large freeform text or existing industry-standard JSON formats (GeoJSON, FHIR, Tiled). Kind 0 is the one exception where structured JSON goes in `content`.
- **Use tags for** queryable metadata and structured data — anything you might filter on.
- **Empty content is fine.** `content: ""` is idiomatic for tag-only events.
- If you need to filter by a field, it **must** be a tag — relays don't index content.

### docs/NIP.md

`docs/NIP.md` documents any custom kinds/schemas this project defines. If the file doesn't exist, this project has no custom kinds. **Whenever you generate a new kind or change a custom schema, create or update `docs/NIP.md`.**

### Nostr Security Model

**CRITICAL:** Nostr private keys (`nsec`) are stored **in plaintext in `localStorage`**. Any JavaScript running on the origin can steal them. A single XSS = permanent, unrecoverable key theft across every Nostr client the user ever touches. **Treat XSS mitigation as the top-priority security concern.**

- **Never** use `dangerouslySetInnerHTML`, `innerHTML`, or `document.write` with event data, URL params, or other untrusted strings.
- **CSP is defense-in-depth**, not primary defense. `public/index.html` ships a restrictive CSP (`script-src 'self'`, `default-src 'none'`). Never relax it with `'unsafe-eval'`, `'unsafe-inline'` on `script-src`, or wildcard sources.
- **Sanitize every event-sourced URL** (`sanitizeUrl()` — https-only allowlist) before using it as `href`, `src`, iframe `src`, or CSS `url()`.
- **Sanitize every event-sourced string interpolated into CSS**. A malicious `font-family` or `url()` value can break out of the CSS context and inject rules.

Beyond XSS, Nostr is permissionless — signatures prove authorship, not trustworthiness. Filter by `authors` whenever trust is implied:

- **Admin/moderator/owner queries** — filter by trusted pubkeys.
- **Addressable events (kinds 30000–39999)** and **user-owned replaceable events** — filter by `authors`; the `d` tag alone is not a trust boundary.
- **Routes for addressable/replaceable events** — include the author in the URL (e.g. `/article/:npub/:slug`) so the filter can constrain on author.
- **Public UGC** (kind 1 notes, reactions, public feeds, discovery) — author filtering NOT required.

```ts
// ❌ Anyone can spoof this event
nostr.query([{ kinds: [30078], '#d': ['app-organizers'], limit: 1 }]);
// ✅ Only trust admin authors
nostr.query([{ kinds: [30078], authors: ADMIN_PUBKEYS, '#d': ['app-organizers'], limit: 1 }]);
```

For the full threat model — CSP walkthrough, `sanitizeUrl` / `sanitizeCssString` implementations, NIP-72 community moderation, and the pre-merge checklist — load the **`nostr-security`** skill.

### The `useNostr` Hook

```ts
import { useNostr } from '@nostrify/react';

function useCustomHook() {
  const { nostr } = useNostr();
  // nostr.query(filters) / nostr.event(event) / nostr.req(filters)
}
```

By default `nostr` uses the app's connection pool (reads from one relay, publishes to all configured). For targeted single-relay or relay-group calls, load the **`nostr-relay-pools`** skill.

### Querying with TanStack Query

Combine `useNostr` with `useQuery` in custom hooks:

```ts
function usePosts() {
  const { nostr } = useNostr();
  return useQuery({
    queryKey: ['posts'],
    queryFn: async (c) => nostr.query([{ kinds: [1], limit: 15 }], { signal: c.signal }),
  });
}
```

**Efficient query design** — minimize round-trips:

- **Combine kinds** in one filter: `{ kinds: [1, 6, 16], '#e': [eventId] }` and split by kind in JS. Don't run three parallel queries for repost variants.
- **Use multiple filter objects** in one query when different tag filters are needed.
- **Raise `limit`** when combining so you still get enough of each kind.
- Each query costs relay capacity and may count against rate limits.

**Event validation** — for kinds with required tags or strict schemas, filter query results through a validator:

```ts
function isValidCalendarEvent(event: NostrEvent): boolean {
  if (![31922, 31923].includes(event.kind)) return false;
  const d = event.tags.find(([n]) => n === 'd')?.[1];
  const title = event.tags.find(([n]) => n === 'title')?.[1];
  const start = event.tags.find(([n]) => n === 'start')?.[1];
  return Boolean(d && title && start);
}

const events = (await nostr.query([{ kinds: [31922, 31923], limit: 15 }]))
  .filter(isValidCalendarEvent);
```

Validation is optional for loose kinds (kind 1), but strongly recommended for custom kinds and kinds with required tags.

### The `useAuthor` Hook

Fetch profile metadata (kind 0) for a pubkey:

```tsx
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';

function Post({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const metadata: NostrMetadata | undefined = author.data?.metadata;

  const displayName = metadata?.name ?? genUserName(event.pubkey);
  const profileImage = metadata?.picture;
  // ...
}
```

The `NostrMetadata` type (from `@nostrify/nostrify`) covers the standard kind-0 fields: `name`, `display_name`, `about`, `picture`, `banner`, `website`, `nip05`, `lud06`, `lud16`, `bot`. Read the type definition from the package if you need the exact field list.

### The `useNostrPublish` Hook

Publishes events (auto-adds a `client` tag). Always guard with `useCurrentUser`:

```tsx
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';

export function MyComponent() {
  const { user } = useCurrentUser();
  const { mutate: createEvent } = useNostrPublish();

  if (!user) return <span>You must be logged in.</span>;

  return (
    <button onClick={() => createEvent({ kind: 1, content: 'hello' })}>
      Publish
    </button>
  );
}
```

### Nostr Login

Use the `LoginArea` component (already in the project). It renders a single "Join" button when logged out (opens an `AuthDialog` supporting signup, extension, nsec, and remote signer) and becomes an account switcher when logged in. **Do not wrap it in conditional logic.**

```tsx
import { LoginArea } from '@/components/auth/LoginArea';

<LoginArea className="max-w-60" />
```

`LoginArea` is inline-flex by default. Pass `flex` or `w-full` to expand it; otherwise set a sensible `max-w-*`.

**Social apps should include a profile/account menu in the main navigation** for access to settings, profile editing, and logout — don't only show `LoginArea` in logged-out states.

### NIP-19 Identifiers

Nostr uses bech32-encoded identifiers (`npub1`, `nprofile1`, `note1`, `nevent1`, `naddr1`, `nsec1`). **All NIP-19 identifiers are routed at the URL root (`/:nip19`)**, handled by `src/pages/NIP19Page.tsx` — never nest them under `/note/`, `/profile/`, etc.

**Filters only accept hex.** Always decode before querying:

```ts
import { nip19 } from 'nostr-tools';

const decoded = nip19.decode(value);
if (decoded.type !== 'naddr') throw new Error('Unsupported identifier');
const { kind, pubkey, identifier } = decoded.data;

nostr.query([{
  kinds: [kind],
  authors: [pubkey],        // critical for addressable events
  '#d': [identifier],
}]);
```

Never treat `nsec1` or unknown prefixes as anything but a 404.

**For full details** (identifier-type comparison, populating `NIP19Page`, building NIP-19 links, security patterns), load the **`nip19-routing`** skill.

### File Uploads, Encryption, Multi-Relay

These are specialized workflows — load the matching skill when needed:

- **`file-uploads`** — `useUploadFile` + Blossom + NIP-94 `imeta` tags.
- **`nostr-encryption`** — NIP-44 / NIP-04 via the user's signer (DMs, gift wraps, private content).
- **`nostr-relay-pools`** — `nostr.relay(url)` / `nostr.group([urls])` for targeted queries.

## App Configuration

The `AppProvider` manages global state (theme + NIP-65 relay list + Blossom server list), persisted to local storage. The shape:

```ts
type AppConfig = {
  theme: 'light' | 'dark';
  relayMetadata: RelayMetadata;          // NIP-65 list
  blossomServerMetadata: BlossomServerMetadata; // BUD-03 (kind 10063)
  useAppBlossomServers: boolean;          // include APP_BLOSSOM_SERVERS in the merged set
};
```

Canonical defaults live in `src/lib/appRelays.ts` (`APP_RELAYS`) and `src/lib/appBlossom.ts` (`APP_BLOSSOM_SERVERS`). `App.tsx` composes these into a `defaultConfig` passed to `<AppProvider>`.

### Relay Management

- **`NostrSync`** auto-loads the user's NIP-65 relay list on login and writes it into `AppContext`.
- **Automatic publishing** — updating the relay config publishes a new kind 10002 event when the user is logged in.
- The settings UI is implemented in `src/components/RelayListManager.tsx`.

## Routing

Routes live in `AppRouter.tsx`. To add one:

1. Create the page component in `src/pages/`.
2. Import it in `AppRouter.tsx`.
3. Add the route **above** the catch-all `*` route:

```tsx
<Route path="/your-path" element={<YourComponent />} />
```

The router provides automatic scroll-to-top on navigation and a 404 `NotFound` page. The `/:nip19` route is already wired (see the `nip19-routing` skill).

## Design Standards

Designs should be polished and production-ready. Concrete rules:

- **Responsive** down to ~360px; test mobile, tablet, desktop.
- **WCAG 2.1 AA**: ≥ 4.5:1 contrast for body text, ≥ 3:1 for large text and UI elements. Full keyboard nav, ARIA labels, visible `focus-visible` rings.
- **8px grid** for spacing (Tailwind's 4-based scale). Don't sprinkle `p-[13px]`-style one-offs.
- **Typography hierarchy**: ≥ 18px body, ≥ 40px primary headlines. Prefer a modern sans (e.g. Inter) for UI and pair a display/serif for headings when personality is needed.
- **Depth**: soft shadows, gentle gradients, rounded corners (`rounded-lg` / `rounded-xl`). Avoid heavy drop shadows.
- **Motion**: lightweight, purposeful (hover, scroll reveals, transitions). Respect `prefers-reduced-motion` with Tailwind's `motion-safe:` / `motion-reduce:` variants.
- **Reusable components**: consistent variants and feedback states (`hover`, `focus-visible`, `active`, `disabled`, `aria-invalid`). Use `cn()` for conditional classes and `class-variance-authority` for variants (copy an existing `ui/` component as a template).
- **Custom over generic**: avoid template-looking headers — combine layered visuals, subtle motion, and brand colors. Generate custom images with available tools before reaching for stock.

### Loading and Empty States

**Use skeletons** for structured content (feeds, profiles, forms). **Use spinners** only for buttons or short operations.

```tsx
<Card>
  <CardHeader>
    <div className="flex items-center space-x-3">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="space-y-1">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  </CardHeader>
  <CardContent>
    <div className="space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  </CardContent>
</Card>
```

For empty results, show a minimalist empty state in a `border-dashed` card:

```tsx
<Card className="border-dashed">
  <CardContent className="py-12 px-8 text-center">
    <p className="text-muted-foreground max-w-sm mx-auto">
      No results found. Try checking your relay connections or wait a moment for content to load.
    </p>
  </CardContent>
</Card>
```

For font installation, color-scheme changes, light/dark theming, or the `isolate` + negative-z-index gotcha, load the **`theming`** skill.

## Writing Tests vs. Running Tests

**Running the existing test script — always do it.** After any code change, run the project's test/validation script. **Your task is not complete until it passes.** The script typically covers TypeScript compilation, Biome, node:test, the esbuild build, and PWA smoke checks.

**Writing new test files — don't, unless the user asks.** If the user explicitly requests tests, describes a bug to diagnose with a test, or reports that a problem persists after a fix, use the current `node:test` helpers in `test/node`. For integration-test harness patterns, read `test/integration/README.md`.

## Validating Your Changes

**Your task is not finished until the code type-checks and builds without errors.** In priority order:

1. **Type check** (required)
2. **Build/compile** (required)
3. **Lint** (recommended; fix anything critical)
4. **Run tests** (if available)
5. **Git commit** (required)

### Using Git

Use `git status` / `git diff` to review changes and `git log` to learn project conventions. If you make a mistake, `git checkout` restores files.

**Always commit when you are finished.** Non-negotiable — every completed task ends with a commit. Don't wait for the user to ask.
