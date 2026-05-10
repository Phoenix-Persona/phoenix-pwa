# Hard-Cut Wallet + PPQ Simplification Plan

## Summary

- Personas will have **Lightning wallets only**: receive donations, show Lightning activity, and sweep available sats to the operator wallet.
- The operator will own the **only PPQ account** and the **only PPQ credits UI**.
- All AI inference hooks will continue using `usePpqAccount`, but that account must be operator-scoped only.
- Persona wallet dialogs will remove all PPQ tabs, top-up controls, PPQ credentials, and PPQ usage history.

## Key Implementation Changes

- **Separate wallet and PPQ concerns**
  - Refactor `useWallet` and `WalletPanel` back to Lightning-only behavior: connect, balance, receive, send, payments, sweep.
  - Move PPQ balance, top-up, credentials, and query-history UI into a new operator-only `AICreditsDialog` opened from a separate `AI Credits` button near the operator wallet button in `AppHeader`.
  - Remove `auto_topup`, `funding_source`, and PPQ controls from persona wallet UI and encrypted persona wallet settings going forward. Existing encrypted fields may remain readable but ignored.

- **Operator-only PPQ account**
  - Keep `usePpqAccount` as the single PPQ account source: env override, operator envelope, legacy localStorage migration.
  - Ensure no persona creation/edit/dashboard path creates or stores a persona PPQ account.
  - Update docs/comments that currently describe per-persona PPQ credits or persona-funded PPQ.

- **Sweep donations to operator**
  - Add a persona wallet action: `Sweep to operator`.
  - Sweep flow: require both persona wallet handle and operator wallet handle; create an operator BOLT11 invoice; pay it from the persona wallet; refresh both wallets.
  - Use “sweep available balance” semantics, not exact zero. Start from persona balance minus a conservative reserve and retry downward on fee/insufficient-funds errors until a payment succeeds or no practical amount remains.
  - Show success as “Swept X sats to operator wallet” and failure as a clear non-destructive error.

- **Inference and refresh behavior**
  - `usePpqInference`, `usePpqImage`, video generation, post wizard, research, and AI assist continue to use `usePpqAccount`; no persona PPQ account is passed through.
  - After inference, refresh operator PPQ balance where relevant instead of refreshing persona wallet PPQ fields.
  - Persona wallet balance refresh remains Lightning-only.

## Public Interfaces / Types

- `UseWalletResult`: remove PPQ fields such as `ppqAccount`, `ppqBalanceUsd`, `manualTopup`, `autoTopupRun`, `fundingSources`, and PPQ query history.
- Add a focused sweep API, either on `UseWalletResult` or a small hook:
  - `sweepToOperator(): Promise<{ sweptSats: number; paymentRequest: string }>`
  - `isSweeping`, `sweepError`, optional `lastSweepResult`.
- Add an operator PPQ UI hook/component boundary:
  - `AICreditsDialog` consumes `usePpqAccount`, `useOperatorWallet`, and existing PPQ top-up/query-history client functions.
- `PersonaWallet` encrypted schema: keep `kind`, `seed`, `lightning_address`, `lnurl`; treat `auto_topup` as legacy optional data only.

## Test Plan

- Unit tests:
  - Persona creation stores wallet seed/address data but no new PPQ account config.
  - `useWallet` no longer exposes PPQ account, top-up, or history fields.
  - `usePpqAccount` creates/persists only operator PPQ credentials.
  - Sweep calls operator receive, persona send, then refreshes both wallets.
  - Sweep handles zero balance and insufficient funds with clear errors.
- Component tests:
  - Persona `WalletPanel` shows Lightning tab/content only, no `AI Credits` tab.
  - Persona wallet includes `Sweep to operator` when operator wallet is available.
  - App header shows separate operator wallet and `AI Credits` controls.
  - `AICreditsDialog` shows PPQ balance, manual top-up, hidden credentials, and PPQ usage history.
- Full validation:
  - Run `npm test`.
  - Manually smoke-test: create/open persona wallet, receive invoice UI, sweep button disabled/enabled states, operator AI credits dialog.

## Assumptions

- “Sweep all” means **maximum practical spendable amount**, not mathematically exact zero.
- Existing personas with legacy `auto_topup` fields remain readable; the app simply stops using those fields.
- Legacy localStorage PPQ credentials may still be migrated into the operator envelope, but they are never treated as persona credentials.
- The first hard cut prioritizes clarity over preserving the old persona PPQ UX.
