# wallet integration smoke tests

Manual end-to-end checks that the Zuka wallet primitives work against
the real Breez Spark SDK.

## Three scripts

| Script | What it does |
| --- | --- |
| [`bootstrap-spark-wallet-e2e.ts`](./bootstrap-spark-wallet-e2e.ts) | First run. Mints an operator nsec, encrypts a fresh persona envelope (with BIP-39 mnemonic embedded), connects the Spark wallet, optionally registers a Lightning Address, prompts you to fund it via BOLT11, then runs one default-on auto-topup pass against ppq.ai. |
| [`fund-spark-wallet-with-sats.ts`](./fund-spark-wallet-with-sats.ts) | Top-up only. Reconnects the existing wallet and prints a single BOLT11 invoice for whatever amount you specify, then polls until it settles. Use this when the wallet is too lean to cover the next auto-topup. |
| [`test-auto-topup-and-inference.ts`](./test-auto-topup-and-inference.ts) | Follow-up. Reuses the persisted state from `bootstrap-spark-wallet-e2e.ts` and exercises three flows: a "hello world" inference call against ppq.ai, the disabled-policy short-circuit, and an auto-topup pass that uses `DEFAULT_AUTO_TOPUP_CONFIG`. |

All three load `.env` automatically; just put your API key there:

```bash
echo 'VITE_BREEZ_API_KEY=your_key' >> .env
```

## Run them

```bash
# First time on a machine — mints wallet + persona + first topup
npx tsx test/manual/wallet/bootstrap-spark-wallet-e2e.ts

# Top up the existing wallet by an arbitrary amount
npx tsx test/manual/wallet/fund-spark-wallet-with-sats.ts --amount-sats 10000

# Reuses the persisted state — hello world + off-switch + forced topup
npx tsx test/manual/wallet/test-auto-topup-and-inference.ts
```

## Useful flags

`bootstrap-spark-wallet-e2e.ts`

| Flag | Effect |
| --- | --- |
| `--reset` | Wipe operator + persona and start fresh |
| `--skip-receive` | Don't wait for an inbound BOLT11 payment |
| `--register-address` | Register a Lightning Address if the wallet has none |
| `--topup-target <usd>` | Auto-topup target (default 5) |
| `--topup-threshold <usd>` | Auto-topup threshold (default 5 — top up to $5 whenever balance falls below $5) |

`fund-spark-wallet-with-sats.ts`

| Flag | Effect |
| --- | --- |
| `--amount-sats <n>` | Skip the prompt and request this many sats |
| `--memo <text>` | Invoice memo (default `"Zuka wallet top-up"`) |
| `--timeout-mins <n>` | How long to wait for inbound payment (default 10) |

`test-auto-topup-and-inference.ts`

| Flag | Effect |
| --- | --- |
| `--skip-inference` | Skip the chat completion call |
| `--skip-disabled` | Skip the off-switch assertion |
| `--skip-forced` | Skip the topup pass (it costs real sats) |
| `--topup-target <usd>` | Override topup target (default: `DEFAULT_AUTO_TOPUP_CONFIG.targetUsd`) |
| `--topup-threshold <usd>` | Override topup threshold (default: `DEFAULT_AUTO_TOPUP_CONFIG.thresholdUsd`) |
| `--inference-model <id>` | Override the inference model (default `claude-sonnet-4.5`) |

## Example session

What a successful `test-auto-topup-and-inference.ts` run looks like end to
end. Use this to sanity-check your wiring — the shape of each block, and
the `✓` lines, is what you should expect.

```text
$ npx tsx test/manual/wallet/test-auto-topup-and-inference.ts
Breez SDK: Node.js storage automatically enabled
Zuka wallet — auto-topup + inference test

────── 0. Reload wallet + persona + ppq account ──────
Connecting Spark wallet…
  spark balance: 7,100 sats
  ppq balance:   $1.5469

────── 1. Hello-world inference ──────
Run hello-world inference? (y/n) [y] y
  model: claude-sonnet-4.5
  response: hello world
  usage: prompt=20 completion=5

────── 2. Non-auto-topup (enabled=false → null) ──────
  policy: enabled=false (off switch)
  ✓ runAutoTopupOnce returned null — off switch holds.

────── 3. Auto-topup (configured policy) ──────
  policy: enabled=true threshold=$5.0000 target=$5.0000
  ppq balance $1.5469 < threshold $5.0000 — would top up to $5.0000 (~$3.4531 in sats).
Run the topup pass now? (y/n) [y] y
  ✓ topped up $3.4500
    invoice id:  6hWyndcGEdBfqBJWXeqUoU
    final state: Settled
    ppq balance:   $1.5469 → $5.1694
    spark balance: 7,100 sats → 2,812 sats

────── Done ──────
```

Things worth noting about that run:

- **Step 0** reads the saved persona + wallet + ppq account; if any of
  those is missing the script tells you which `bootstrap-…` or
  `fund-…` script to run first.
- **Step 2** is a pure assertion — it costs zero sats and zero ppq
  credit. The `✓` line is the off-switch holding.
- **Step 3** uses `DEFAULT_AUTO_TOPUP_CONFIG` directly. Both
  threshold and target are $5, so when the balance is below $5 the
  policy tops you back up to $5. The "$3.45 in sats" preview is
  computed from ppq.ai's `crypto_amount_due` field; if your Spark
  wallet doesn't hold enough to cover it the script bails BEFORE
  attempting payment with a precise deficit message.
- **Final balances** show both sides moving — ppq credit up, Spark
  sats down — which is the proof that the wallet → ppq.ai loop
  closed.

If your wallet is too lean to cover the topup (e.g. 100 sats in, $3.45
needed), run `fund-spark-wallet-with-sats.ts --amount-sats 10000`
first.

## Persisted credentials (gitignored)

| File | What it holds |
| --- | --- |
| `test/manual/wallet/.operator.json` | Operator nsec used to (de)crypt the envelope |
| `test/manual/wallet/.persona.json` | Encrypted PhoenixEnvelope (the kind-30078 ciphertext) |
| `test/manual/ai-services/.account.json` | ppq.ai credentials, shared with the AI walkthrough |

All three files are mode `0600` and gitignored. They grant spending power
— never commit. The Breez SDK also creates a `phoenix-wallet/` directory
in whatever working directory the script ran from; that's gitignored too.

## Cost ballpark

- Receive: zero, plus whatever your funding wallet charges as routing fee.
- Auto-topup of $0.50: a few hundred sats of routing + the topup amount.
- Hello-world inference: well under $0.001.
