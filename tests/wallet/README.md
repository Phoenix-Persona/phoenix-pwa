# wallet integration smoke tests

Manual end-to-end checks that the Phoenix wallet primitives work against
the real Breez Spark SDK.

## Two scripts

| Script | What it does |
| --- | --- |
| [`bootstrap.ts`](./bootstrap.ts) | First run. Mints an operator nsec, encrypts a fresh persona envelope (with BIP-39 mnemonic embedded), connects the Spark wallet, optionally registers a Lightning Address, prompts you to fund it via BOLT11, then runs one default-on auto-topup pass against ppq.ai. |
| [`topup-and-infer.ts`](./topup-and-infer.ts) | Follow-up. Reuses the persisted state from `bootstrap.ts` and exercises three flows: a "hello world" inference call against ppq.ai, the disabled-policy short-circuit, and a forced auto-topup that fires no matter the current balance. |

Both scripts load `dev/.env` automatically; just put your API key there:

```bash
echo 'VITE_BREEZ_API_KEY=your_key' >> dev/.env
```

## Run them

```bash
# First time on a machine — mints wallet + persona + first topup
npx tsx tests/wallet/bootstrap.ts

# Subsequently — reuses the persisted state
npx tsx tests/wallet/topup-and-infer.ts
```

## Useful flags

`bootstrap.ts`

| Flag | Effect |
| --- | --- |
| `--reset` | Wipe operator + persona and start fresh |
| `--skip-receive` | Don't wait for an inbound BOLT11 payment |
| `--register-address` | Register a Lightning Address if the wallet has none |
| `--topup-target <usd>` | Auto-topup target (default 5) |
| `--topup-threshold <usd>` | Auto-topup threshold (default 1) |

`topup-and-infer.ts`

| Flag | Effect |
| --- | --- |
| `--skip-inference` | Skip the chat completion call |
| `--skip-disabled` | Skip the off-switch assertion |
| `--skip-forced` | Skip the forced-topup step (it costs real sats) |
| `--topup-target <usd>` | Override the forced-topup target (default: current + $0.50) |
| `--topup-threshold <usd>` | Override the forced-topup threshold (default $1000 — guarantees fire) |
| `--inference-model <id>` | Override the inference model (default `claude-sonnet-4.5`) |

## Persisted credentials (gitignored)

| File | What it holds |
| --- | --- |
| `tests/wallet/.operator.json` | Operator nsec used to (de)crypt the envelope |
| `tests/wallet/.persona.json` | Encrypted PhoenixEnvelope (the kind-30078 ciphertext) |
| `tests/ai-services/.account.json` | ppq.ai credentials, shared with the AI walkthrough |

All three files are mode `0600` and gitignored. They grant spending power
— never commit. The Breez SDK also creates a `phoenix-wallet/` directory
in whatever working directory the script ran from; that's gitignored too.

## Cost ballpark

- Receive: zero, plus whatever your funding wallet charges as routing fee.
- Auto-topup of $0.50: a few hundred sats of routing + the topup amount.
- Hello-world inference: well under $0.001.
