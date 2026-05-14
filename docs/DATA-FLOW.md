# Data flow

The seams in `src/`. PROJECT.md §12 says "the wallet/agent/Nostr/image-gen
seams are where bugs will live" — this doc traces each user action through
the actual code so you don't have to grep five files to follow it.

> Companion to `docs/ARCHITECTURE.md`. The architecture doc tells you
> *what each file does*; this doc tells you *what calls what*.
>
> **Note.** Some flow descriptions below still reference
> `lib/styleClient.ts` → `/api/style`, which has been deleted in favor
> of `usePpqInference` (PROJECT.md §11). The flows on this page are
> being rewritten in a separate pass; treat them as
> accurate-as-of-pre-PR-#8 until then.

## Flows at a glance

| Flow                          | Entry                | Hooks                             | Lib                        | Network                        |
| ----------------------------- | -------------------- | --------------------------------- | -------------------------- | ------------------------------ |
| Login                         | `AuthDialog`         | `useLoginActions`                 | `nostr-tools` (key gen)    | (relays only on subsequent ops) |
| Persona creation              | `Onboard`            | `useCurrentUser`, `useNostr`      | `persona`, `personaCrypto`, `personaKey`, `styleClient` | Relays (×2) + `/api/style`     |
| List my personas              | `MyPersonas`         | `useMyPersonas`                   | `persona`, `personaCrypto` | Relays (read kind 30078)       |
| Load one persona              | `Dashboard`          | `usePersona`                      | `persona`, `personaCrypto` | Relays (read kind 30078)       |
| Compose + publish             | `Dashboard`          | `usePersonaPublish`               | `styleClient`, `personaPost`, `personaKey` | `/api/style` + Relays  |
| Public feed                   | `PersonaFeed`        | `useAuthor`, `usePersonaPosts`    | —                          | Relays (read kind 0, 1)        |
| PPQ chat completion *(unwired)* | —                  | `usePpqInference`                 | `ppq/client`, `ppq/storage` | `api.ppq.ai`                   |
| PPQ Lightning topup *(unwired)* | —                  | `usePpqLightningTopup`, `usePpqTopupStatus` | `ppq/client`     | `api.ppq.ai`                   |
| Operator profile sync         | mount               | `NostrSync`                       | `appBlossom`               | Relays (read kind 10002, 10063) |

The **unwired** flows are built (`hooks/usePpq*` + `lib/ppq/*`) but no
page calls them yet. See [Unwired seams](#unwired-seams) below.

---

## Login

`AuthDialog.tsx` exposes four mechanisms; all funnel into
`@nostrify/react/login`'s store, which `NostrLoginProvider` (`App.tsx:52`)
persists to `localStorage` at `nostr:login`.

```
AuthDialog "Login" button
   └─→ useLoginActions().{nsec | extension | bunker | nostrconnect}
            │
            ├─ nsec       → NLogin.fromNsec(nsec)         → addLogin()
            ├─ extension  → NLogin.fromExtension()        → addLogin()
            ├─ bunker     → NLogin.fromBunker(uri, nostr) → addLogin()
            └─ nostrconnect→ NLogin.fromNostrConnect(...) → addLogin()
                              (status callback drives UI through the handshake)
```

After `addLogin`, `NostrProvider` (`NostrProvider.tsx:86-103`) re-reads
`logins[0]`, derives a signer (`NUser.from*Login`), and writes it into
`signerRef.current` so the NPool's NIP-42 `auth` callback can sign kind
22242 challenges (`NostrProvider.tsx:39-53`).

`useCurrentUser` (`useCurrentUser.ts:7`) re-derives the same `NUser` from
`logins[0]` for everyone else.

**Cross-page invariant:** `user?.signer` satisfies the NIP-07 interface
*and* the `Nip44Signer` interface — the persona-crypto helpers cast to
the latter (`Onboard.tsx:173`, `usePersona.ts:72`, `usePersona.ts:143`).

---

## Persona creation (Onboard)

5-step form wizard. The work happens in `Onboard.tsx:158-232` (`confirmAndPublish` → `doPublish`):

```
User clicks "Publish persona"
   │
   ▼
generatePersonaKeypair()                                    ← lib/personaKey.ts:33
   produces { nsec, npub, hex.{sk, pk} }
   │
   ▼
{ ...draft, personaNsec: kp.nsec } : PersonaConfig          ← assembled in Onboard
   │
   ▼
encryptPhoenixEnvelope({                                    ← lib/personaCrypto.ts:30
   personaPubkey: kp.hex.pk,
   config,
}, user.pubkey, user.signer as Nip44Signer)
   │  NIP-44(operator → operator) of:
   │     { app: "phoenix-persona", version: 1, personaPubkey, config }
   ▼
ciphertext: string
   │
   ▼
buildEncryptedPersonaTemplate({                              ← lib/persona.ts:102
   dTag: generatePersonaDTag(),                              ← random UUID
   encryptedContent: ciphertext,
})
   │  unsigned event: kind 30078, tags [["d", <uuid>]], content = ciphertext
   ▼
user.signer.signEvent(template)                              ← signs as the operator
   │
   ▼
nostr.event(operatorSigned, { signal: AbortSignal.timeout(8000) })   ← publishes to relays
   │
   ▼
signWithPersona({ kind: 0, ...profile }, kp)                 ← lib/personaKey.ts:48
   │  finalizes a public kind 0 with the persona's nsec
   ▼
nostr.event(profileEvent)                                    ← publishes again
   │
   ▼
navigate(`/dashboard/${kp.npub}`)
```

**Two events published:**

1. **kind 30078** — encrypted envelope, signed by the operator. The
   only "Zuka" signal is inside the ciphertext; tags are `[["d",
   <uuid>]]` and nothing else (`lib/persona.ts:117-122`).
2. **kind 0** — public profile, signed by the persona's keypair. Looks
   like any other Nostr account.

**The persona nsec exists in three places:**
- Inside the encrypted envelope's `config.personaNsec` field.
- In the in-memory `pendingKeypair` state in `Onboard.tsx` until the
  wizard unmounts.
- In the `kp` closure variable in `doPublish`.

**Not in `localStorage`.** Recovery requires the operator's signer.

**Sample generation (step 4)** uses the same `styleClient.styleText()`
as Dashboard composing — see "Compose & publish" below.

---

## List my personas (MyPersonas)

```
MyPersonas page mounts
   │
   ▼
useMyPersonas()                                              ← hooks/usePersona.ts:110
   │
   ▼
nostr.query([{ kinds: [30078], authors: [user.pubkey], limit: 200 }])
   │  No Zuka-specific filter — by design. Anything narrower
   │  would leak Zuka usage to relays/observers.
   ▼
events: NostrEvent[]
   │
   ▼
for each event:
   isCandidatePersonaEvent(event)                            ← lib/persona.ts:195 (kind 30078 + has d tag)
   keep latest per d-tag                                     ← addressable-event semantics
   │
   ▼
for each candidate:
   tryDecryptPhoenixEnvelope(content, pubkey, signer)        ← lib/personaCrypto.ts:55
      │ signer.nip44.decrypt(operatorPubkey, ciphertext)     ← may throw → null
      │ JSON.parse(plaintext)                                ← may throw → null
      │ parseEnvelope / local runtime validators             ← schema validation
      │ getPublicKey(decode(envelope.config.personaNsec))    ← derived-key match
      ▼
   PhoenixEnvelope | null
   │
   ▼
{ event, config, npub: nip19.npubEncode(personaPubkey) }[]   ← sorted newest-first
```

**Why so much work?** Every candidate event must pass four independent
checks (`lib/persona.ts:30-34`). Failing any one quietly drops the
event. This is what defends against:

- Other apps' kind 30078 events that happen to share an author pubkey.
- A tampered envelope where the operator's signer was used to encrypt
  a config claiming the wrong persona.

---

## Load one persona (Dashboard)

```
Dashboard mounts with /dashboard/:npub
   │
   ▼
usePersona(npub)                                             ← hooks/usePersona.ts:45
   │
   ▼
nostr.query([{ kinds: [30078], authors: [user.pubkey], limit: 200 }])
   │
   ▼
(same scan-and-decrypt loop as useMyPersonas)
   │
   ▼
return the first envelope where personaPubkey == npubToHex(npub)
```

This is the cost of the privacy posture: even fetching *one* persona
requires reading every persona event the operator has published. For
hackathon-scale data this is fine; the comment in `usePersona.ts:9-12`
explicitly accepts this.

`Dashboard.tsx:37` reads `persona.data?.config` and gates everything on
its presence. `posts: usePersonaPosts(npub, 20)` runs in parallel.

---

## Compose & publish (Dashboard)

```
User types raw text → clicks "Style in voice"
   │
   ▼
Dashboard.onStyle()                                          ← Dashboard.tsx:39
   │
   ▼
styleClient.styleText({ text: raw, persona: toStylingPayload(config) })
                                                             ← lib/styleClient.ts:51
   │  POSTs to ${VITE_PHOENIX_API_BASE ?? "/api"}/style
   │  Body: { text, persona }     (persona payload omits personaNsec — line 22)
   ▼
{ styled, sources?, tokensUsed? }
   │
   ▼
setStyled(res.styled)
```

User then edits / clicks "Publish to relays":

```
Dashboard.onPost()                                           ← Dashboard.tsx:59
   │
   ▼
buildPersonaPostTemplate({                                   ← lib/personaPost.ts:34
   text: styled,
   regionSlug: regionSlug(config.region),
   causeSlug: config.cause,
   sources: config.sources.map(s => s.url).filter(Boolean),
})
   │  Tags: [["t", region], ["t", cause], ["r", url]…]
   │  Deliberately NOT included: ["client", …], operator pubkey, persona name
   ▼
publish.mutateAsync({ personaNsec: config.personaNsec, template })
   │
   ▼
usePersonaPublish.mutationFn                                 ← hooks/usePersonaPublish.ts:38
   │
   ▼
decodePersonaNsec(personaNsec) → keypair                     ← lib/personaKey.ts:37
   │
   ▼
signWithPersona(template, keypair)                           ← lib/personaKey.ts:48
   │  finalizeEvent(template, skBytes) from nostr-tools
   ▼
nostr.event(event, { signal: AbortSignal.timeout(8000) })
   │
   ▼
toast + posts.refetch()
```

**Critical detail:** `usePersonaPublish` does **not** call
`useNostrPublish` — they sign with different keys. `useNostrPublish` uses
the operator's signer (and auto-tags `["client", location.hostname]`,
`useNostrPublish.ts:25-27`). `usePersonaPublish` uses the persona's
nsec and **never adds a client tag**.

If you find yourself adding "convenience" tags inside
`buildPersonaPostTemplate` or `usePersonaPublish`, re-read
`lib/personaPost.ts:9-19`.

---

## Public feed (PersonaFeed, Verify)

No operator involvement.

```
PersonaFeed mounts with /p/:npub
   │
   ├─→ npubToHex(npub)
   │      │
   │      ▼
   │   useAuthor(personaHex)                                 ← kind 0 query
   │      └─→ nostr.query([{ kinds: [0], authors: [hex], limit: 1 }])
   │
   └─→ usePersonaPosts(npub, 50)                             ← hooks/usePersona.ts:173
          └─→ nostr.query([{ kinds: [1], authors: [hex], limit: 50 }])
```

`Verify.tsx` does the same plus an explicit "operator: Private by design"
field (`Verify.tsx:80-92`). It does **not** look up the operator — it
deliberately doesn't disclose it.

---

## Operator-side syncs (NostrSync)

Runs once on mount and whenever `user` changes.

```
NostrSync mount / user change                                ← components/NostrSync.tsx
   │
   ├─→ nostr.query([{ kinds: [10002], authors: [user.pubkey], limit: 1 }])
   │      └─ if newer than config.relayMetadata.updatedAt:
   │            updateConfig({ relayMetadata: { relays, updatedAt: event.created_at } })
   │
   └─→ nostr.query([{ kinds: [10063], authors: [user.pubkey], limit: 1 }])
          └─ if newer:
                parseBlossomServerList(event)                ← lib/appBlossom.ts:10
                updateConfig({ blossomServerMetadata: ... })
```

Side effect: `useEffect` in `NostrProvider.tsx:112-115` invalidates every
query under the `nostr` key whenever `relayMetadata` changes — so a
relay-list update implicitly refreshes everything.

---

## File upload (any avatar / image)

```
File picked → useUploadFile.mutationFn(file)                 ← hooks/useUploadFile.ts:13
   │
   ▼
getEffectiveBlossomServers(config.blossomServerMetadata, useAppBlossomServers)
                                                             ← lib/appBlossom.ts:44
   │  app servers + user servers, deduped, app first per BUD-03
   ▼
uploadFileToBlossom({ file, signer: user.signer, servers })  ← lib/blossomUpload.ts
   │
   ▼
PUT /upload to the first accepting Blossom server
   │  Signs kind 24242 auth events for upload authorization
   ▼
returns NIP-94 imeta-shaped tags: [["url", ...], ["x", <sha256>], ...]
```

Used by `AuthDialog`'s avatar uploader (`AuthDialog.tsx:354-375`). Not
yet used by Onboard or Dashboard composer — the persona's profile
picture is currently published with empty `picture` (`Onboard.tsx:206`).

---

## PPQ flows (built; not yet wired into pages)

The `lib/ppq/*` and `hooks/usePpq*` layers are complete but no page
calls them yet. The eventual seams. **PPQ and Breez Spark are complementary,
not alternatives:** the per-persona Breez Spark wallet (PROJECT.md §7,
`../dev/docs/breez-spark.md`) is the source of funds; the persona's wallet
exposes itself as a NIP-47 NWC endpoint, and PPQ's auto-topup pulls
from it on demand. Breez Spark integration is still pending; PPQ NWC
primitives are wired below.

### PPQ account auto-create

```
First mutation that needs an api_key (e.g. usePpqInference.mutateAsync(...))
   │
   ▼
ensureAccountForCall()                                       ← inlined in each PPQ hook
   │  ppqAccountStore.load() ?? createAccount() && save()
   ▼
{ api_key, credit_id }
   │
   ▼
chatCompletion(api_key, req) → POST https://api.ppq.ai/chat/completions
```

The hook never returns the credentials to the caller — they live only in
`localStorage` at `phoenix:ppq:account`. The `usePpqAccount` hook (mounted
by anything that wants the balance) re-hydrates from there and listens
to `storage` events for cross-tab updates (`usePpqAccount.ts:34-38`).

### PPQ Lightning topup

```
UI calls usePpqLightningTopup().mutateAsync({ amount, currency: "USD" })
   │
   ▼
ensureAccountForCall() → { api_key }
   │
   ▼
createTopupInvoice(api_key, "btc-lightning", amount, "USD")
   │  POST /topup/create/btc-lightning
   ▼
PpqTopupInvoice { invoice_id, lightning_invoice (or aliases), expires_at, ... }
   │
   ▼
extractBolt11(invoice) → "lnbc..."                           ← defensive — see ppq/client.ts:333
   │
   ▼
return { invoice, bolt11 }
```

Then poll:

```
usePpqTopupStatus(invoiceId)                                 ← hooks/usePpqTopup.ts:89
   │
   ▼
useQuery({
   queryFn: getTopupStatus(api_key, invoiceId)               ← /topup/status/{id}
   refetchInterval: 3s while pending; stops on terminal status
})
```

Status comparison is case-insensitive across two different vocabularies
because the API has both `"New"/"Settled"` and lowercase variants
(`ppq/client.ts:354-370`).

### PPQ NWC auto-topup (NIP-47)

The "wallet tops Zuka up at will" primitive. Operator hands PPQ an
NWC URL and a USD threshold:

```
usePpqNwcAutoTopup().connect({ nwc_url, threshold_usd, topup_amount_usd })
   │
   ▼
ensureAccountForCall() → { credit_id }
   │
   ▼
connectNwcAutoTopup(credit_id, req)                          ← ppq/client.ts:374
   │  POST /nwc-auto-topup/connect
   │  Headers: x-credit-id (NOT bearer auth — uses credit_id, not api_key)
   ▼
PpqNwcSettings
```

PPQ then pulls `topup_amount_usd` from the connected wallet whenever the
balance dips below `threshold_usd`. No Zuka-side polling needed.

---

## Unwired seams

Things built in code but not yet connected. These are likely places to
plumb work next.

| Built (lib/hooks)                       | Caller exists?         | Currently using                          |
| --------------------------------------- | ---------------------- | ---------------------------------------- |
| `usePpqInference` / `chatCompletion`    | No page calls it       | `lib/styleClient.ts` → `/api/style` (Vercel function) |
| `usePpqImage` / `generateImage`         | No page calls it       | (no image gen in UI)                     |
| `usePpqLightningTopup`, `usePpqTopupStatus` | No page              | (no wallet UI)                           |
| `usePpqNwcAutoTopup`                    | No page                | (no wallet UI)                           |
| Blossom upload via `useUploadFile`      | `AuthDialog` (avatar)  | (Onboard publishes empty `picture`; Dashboard composer doesn't attach images) |

**Style endpoint migration** — when replacing `styleClient.ts` with
`usePpqInference`, the relevant call sites are `Onboard.tsx:136` and
`Dashboard.tsx:43`. The chat-completions request shape is in
`lib/ppq/types.ts:54-62`; pass the persona system prompt as a `system`
message and the raw text as `user`.

## Source

- All file/line references are against the `topher` branch as read
  during doc authorship. Verify before editing — line numbers drift.
- `docs/ARCHITECTURE.md` for what each file *is*; this doc for what
  calls *what*.
