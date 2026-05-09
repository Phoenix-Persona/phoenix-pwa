# wallet integration smoke test

Manual end-to-end check that the Phoenix wallet primitives work against the
real Breez Spark SDK. Walks every goal of the headless wallet branch:

1. **Operator key** — generates a fresh Nostr nsec to act as the persona's
   owner, persisted to `.operator.json`.
2. **Encrypted persona envelope** — mints (or decrypts) a kind-30078-shaped
   `PhoenixEnvelope` containing a fresh BIP-39 mnemonic alongside
   `personaNsec`. Round-trips it through NIP-44 self-encryption to prove
   the seed lives next to the other secrets in the same envelope.
3. **Spark wallet connect** — boots the SDK with the decrypted mnemonic and
   prints balance + Lightning Address (registers one with
   `--register-address`).
4. **Receive** — generates a BOLT11 invoice and polls until you pay it from
   another wallet.
5. **Default-on auto-topup → ppq.ai** — runs `runAutoTopupOnce` once,
   paying ppq.ai's Lightning invoice from the Spark wallet to bring the
   ppq credit balance to at least the configured target.

## Run it

```bash
VITE_BREEZ_API_KEY=your_key npx tsx tests/wallet/run.ts
```

Useful flags:

| Flag | Effect |
| --- | --- |
| `--reset` | Wipe operator + persona and start fresh |
| `--skip-receive` | Don't wait for an inbound BOLT11 payment |
| `--register-address` | Register a Lightning Address if the wallet has none |
| `--topup-target <usd>` | Auto-topup target (default 5) |
| `--topup-threshold <usd>` | Auto-topup threshold (default 1) |

## Persisted credentials (gitignored)

| File | What it holds |
| --- | --- |
| `tests/wallet/.operator.json` | Operator nsec used to (de)crypt the envelope |
| `tests/wallet/.persona.json` | Encrypted PhoenixEnvelope (the kind-30078 ciphertext) |
| `tests/ai-services/.account.json` | ppq.ai credentials, shared with the AI test |

All three files are mode `0600` and gitignored. They grant spending power
— never commit.

## Cost ballpark

- Receive: zero, or whatever your funding wallet charges as routing fee.
- Auto-topup of $1: a few hundred sats of routing + the topup amount.
