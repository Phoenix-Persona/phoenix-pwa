# Manual Release Checklist

Automated CI must stay offline and deterministic. Run this checklist before
demos or releases when you need confidence in the real spend/network paths.

## Prerequisites

- Put `VITE_BREEZ_API_KEY` in `.env`.
- Keep `test/manual/wallet/.operator.json`, `test/manual/wallet/.persona.json`, and `test/manual/ai-services/.account.json` gitignored.
- Start with low balances and low-cost prompts. These checks can spend real sats and PPQ credit.

## Wallet And PPQ Cadence

1. Bootstrap or reload the Spark wallet:

   ```bash
   npx tsx test/manual/wallet/bootstrap-spark-wallet-e2e.ts --skip-receive
   ```

2. Fund the wallet if the Spark balance is too low:

   ```bash
   npx tsx test/manual/wallet/fund-spark-wallet-with-sats.ts --amount-sats 10000
   ```

3. Verify PPQ account, balance, and a cheap inference:

   ```bash
   npx tsx test/manual/wallet/test-auto-topup-and-inference.ts --skip-forced
   ```

4. Verify standalone PPQ services only when media spend is acceptable:

   ```bash
   npx tsx test/manual/ai-services/test-all-ppq-services-e2e.ts
   ```

5. Verify the proven talking-head video route when video continuity matters:

   ```bash
   npx tsx test/manual/ai-services/probe-seedance-i2v-with-speech.ts
   ```

6. Verify auto-topup with real spend only after checking the previewed sats:

   ```bash
   npx tsx test/manual/wallet/test-auto-topup-and-inference.ts --skip-inference --skip-disabled
   ```

## Pass Criteria

- Spark wallet connects and shows an expected balance.
- PPQ balance loads for the intended account.
- Inference returns a short response.
- Optional image/video checks return inspectable URLs.
- Auto-topup, when run, shows PPQ credit increasing and Spark sats decreasing.

## Cleanup

- Do not commit generated `.json` credentials or wallet state.
- Rotate or delete local manual-test credentials if the machine is shared.
- Record any spend-path failures in `dev/reports` with command, date, model, invoice id, and error output.
