# Breez SDK (Spark)

`@breeztech/breez-sdk-spark` — Breez's wrapping of Lightspark's Spark
protocol. Phoenix gives **each persona its own wallet**, with the
BIP-39 seed living only inside the encrypted kind 30078 backup
(PROJECT.md §5.2, §7.1).

> Wallet SDK is **locked** to Breez Spark per `dev/PROJECT.md` §10.
> The `jc/add-spark-wallet` branch already has a working headless
> implementation under `src/lib/wallet/`.

## Install

```sh
npm install @breeztech/breez-sdk-spark
```

- **Web**: WASM bundle. Requires `await init()` once at app boot
  before any other SDK call. See `src/lib/wallet/init.ts:ensureWalletReady()`
  on the spark branch — it's an idempotent helper.
- **Node** (≥22): default export is a no-op; `ensureWalletReady()`
  treats that case correctly.
- **API key**: required. Configure via `import.meta.env.VITE_BREEZ_API_KEY`
  (Vite-loaded from `dev/.env`); pass explicitly when calling from
  Node integration tests.

## Connect with a mnemonic

```typescript
import init, { defaultConfig, connect } from '@breeztech/breez-sdk-spark'

await init() // web only

const config = defaultConfig('mainnet', '<VITE_BREEZ_API_KEY>')
const sdk = await connect({ mnemonic, config })
// ... use sdk
await sdk.disconnect()
```

In Phoenix, the BIP-39 mnemonic is loaded from the decrypted kind
30078 backup at persona-switch time and held only in memory while the
persona is active.

## Hosted Lightning Address (no Phoenix-side server)

This is the headline reason for picking Spark: **Breez hosts the
LNURL-pay endpoint for you.** No Phoenix-owned domain, no static JSON
shim, no LNURL infra to maintain.

```typescript
// At persona creation
const username = pickPersonaUsername(); // e.g. "imani"
const description = `Donations to ${persona.name}`;
const addressInfo = await sdk.registerLightningAddress({ username, description });
// addressInfo.lightning_address === "imani@spark.money"
```

The default domain is `spark.money` (Breez's hosted LNURL server).
Custom domains are also supported but Phoenix V1 uses the default.

**Limitation:** *"Each user can have only one Lightning address per
domain when using the Breez LNURL server. Registering a new address
on the same domain will replace the previous one."* Each Phoenix
persona has its own wallet (its own Spark identity), so this is per
*Spark identity*, not per Phoenix operator — multiple personas under
one operator each get their own address.

## Receive

```typescript
// BOLT11 invoice
const limits = await sdk.fetchLightningLimits()

const prep = await sdk.prepareReceivePayment({
  paymentMethod: 'bolt11Invoice',
  amount: { type: 'bitcoin', payerAmountSat: 5_000 },
})
// inspect prep.feesSat, then continue to receivePayment(...)
```

The SDK supports BOLT11, BOLT12, BIP-353, LNURL-pay, Lightning Address,
on-chain BTC, Spark address, and BTKN for both send and receive.

## NWC for PPQ credits auto-topup

Phoenix uses PPQ's **credits system** (see `docs/guides/ppq.md`): the
persona's Spark wallet keeps PPQ's `credit_id` topped up via NIP-47
NWC. Phoenix wires this once at persona creation by handing PPQ an
NWC URL exposed by the Spark wallet — PPQ then pulls credit
on-demand whenever the balance dips below a configured threshold. The
end-to-end flow is exercised in
`tests/wallet/test-auto-topup-and-inference.ts` on the
`jc/add-spark-wallet` branch.

## Phoenix integration points (per `jc/add-spark-wallet`)

| Where                                    | What                                              |
| ---------------------------------------- | ------------------------------------------------- |
| `src/lib/wallet/init.ts`                 | `ensureWalletReady()` — one-shot WASM init        |
| `src/lib/wallet/client.ts`               | Phoenix-flavoured wallet ops over the SDK         |
| `src/lib/wallet/types.ts`                | Re-exports SDK types + Phoenix `WalletInfo`       |
| `src/lib/wallet/autoTopup.ts`            | NWC auto-topup wiring for PPQ credits             |
| `src/hooks/useWallet.ts`                 | TanStack Query bindings: balance, send, receive   |
| `src/components/Wallet*.tsx` (TBD)       | Wallet UI panel                                   |
| Persona creation                         | Generate seed → `registerLightningAddress` → store seed + address in kind 30078 |
| PPQ payment flow                         | NWC URL exposed; PPQ pulls credit on demand       |

## `WalletInfo` shape (Phoenix-flavoured)

From `src/lib/wallet/types.ts`:

```typescript
interface WalletInfo {
  balanceSats: number;
  lightningAddress?: string;  // e.g. "imani@spark.money"
  lnurlPay?: string;          // static LNURL-pay string
  raw: GetInfoResponse;       // SDK-native payload preserved
}
```

## Source

- `sdk-doc-spark.breez.technology` — full guide (lightning-address
  registration is at `/guide/receive_lnurl_pay.html`)
- `github.com/breez/spark-sdk` — repo
- `src/lib/wallet/*` on `jc/add-spark-wallet` — reference implementation
- `dev/PROJECT.md` §7 (wallet & economics), §10 (resolved items)
