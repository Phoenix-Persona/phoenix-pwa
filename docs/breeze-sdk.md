# Breez SDK (Liquid)

Non-custodial Lightning wallet SDK. Phoenix gives **each persona its own
wallet**, with the seed living only inside the encrypted kind 30078 backup
(PROJECT.md §5.2, §7.1).

> **Open question (PROJECT.md §10 #1):** Liquid SDK vs Greenlight vs
> Nodeless is not yet decided. Topher owns this. The notes below assume
> the Liquid variant — the most likely choice because it's nodeless and
> the SDK has WASM/web support.

## Install

```
npm install @breeztech/breez-sdk-liquid
```

- Web: WASM bundle, requires `await init()` before any other call.
- Node: minimum version **v22**.
- API key required — request via the breez.technology form.

## Connect with a mnemonic

```javascript
import init, { defaultConfig, connect } from '@breeztech/breez-sdk-liquid'

await init() // web only

const config = defaultConfig('mainnet', '<your-Breez-API-key>')
config.workingDir = 'path to writable directory' // optional in web

const sdk = await connect({ mnemonic, config })
// ... use sdk
await sdk.disconnect()
```

In Phoenix the `mnemonic` is loaded from the decrypted kind 30078 backup at
persona-switch time and held only in memory while the persona is active.

## How it works

Submarine swaps and reverse submarine swaps move funds between the Lightning
Network and the Liquid sidechain. When the persona receives a Lightning
payment, it lands as L-BTC in the underlying Liquid wallet; when it pays a
Lightning invoice (e.g. PPQ), L-BTC is swapped out.

## Receive (BOLT11 example)

```javascript
const limits = await sdk.fetchLightningLimits()
// limits.receive.minSat, limits.receive.maxSat

const prepareResponse = await sdk.prepareReceivePayment({
  paymentMethod: 'bolt11Invoice',
  amount: { type: 'bitcoin', payerAmountSat: 5_000 },
})

// inspect prepareResponse.feesSat, then continue to receivePayment(...)
```

The SDK supports BOLT11, BOLT12, BIP353, LNURL-pay, Lightning address, and
on-chain BTC for both send and receive. **Lightning Address resolution
needs an LNURL-pay endpoint** — see PROJECT.md §10 #2.

## Phoenix integration points

| Where                                    | What                                              |
| ---------------------------------------- | ------------------------------------------------- |
| `src/lib/wallet.ts` (new)                | SDK init, connect on persona switch, disconnect   |
| `src/hooks/useWallet.ts` (new)           | Balance, send/receive, tx history                 |
| `src/components/Wallet*.tsx` (new)       | Wallet UI panel                                   |
| Persona creation                         | Generate seed, write into kind 30078 backup       |
| PPQ payment flow                         | Pay invoice from this wallet on each AI request   |

## Source

- sdk-doc-liquid.breez.technology — full guide
- github.com/breez/breez-sdk-liquid
- PROJECT.md §7 (wallet & economics), §10 #1–#2 (open items)
