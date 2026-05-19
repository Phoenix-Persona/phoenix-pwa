# Security Regression Checklist

Use this checklist for PRs touching auth, storage, wallets, PPQ, Nostr
publishing, media upload, or operator/persona boundaries.

## Secrets

- No `nsec`, wallet seed, PPQ API key, NWC URL, or passphrase is logged,
  toasted, sent to analytics, or included in thrown error messages.
- Persona `nsec` values remain memory-only outside encrypted kind 30078
  backups.
- Pasted operator `nsec` flows require NIP-49 encryption before creating
  an active session.
- `nostr:login` does not persist plaintext active `nsec` state.

## Operator Isolation

- Query keys for operator-owned state include the active operator pubkey
  or are cleared on operator switch.
- Operator switch calls `clearOperatorRuntimeState()` through
  `OperatorScopedStateCleanup`.
- Lock / logout paths call `clearOperatorSessionState()` when they should
  preserve the encrypted device backup.
- Forget-device paths call `clearOperatorDeviceSecrets()` and hard reload.
- Production app flows ignore `VITE_PPQ_API_KEY`, `VITE_PPQ_CREDIT_ID`,
  and `VITE_WALLET_SEED`.

## Nostr and Public Surfaces

- Trust-sensitive Nostr queries filter by `authors`.
- Addressable event lookups include the expected author, not just `d`.
- Event-sourced URLs are sanitized before `href`, `src`, iframe, or CSS
  use.
- No `dangerouslySetInnerHTML`, `innerHTML`, or `document.write` is used
  with event/user/URL data.

## Wallets and PPQ

- Operator wallet and persona wallet IDs cannot collide.
- Operator PPQ credentials are read from the active operator envelope or
  dev-only env pins, never legacy global localStorage.
- Persona AI flows use the active persona envelope PPQ account, not the
  operator's PPQ account.
- PPQ rotation writes back to the current operator envelope.
- Auto-topup source selection cannot silently fall back to another
  operator's wallet.

## Required Verification

- Run the relevant focused node:test files for touched auth/session/wallet
  code.
- Run `npm test`.
- Run `npm audit --omit=dev` before merging security-sensitive changes.
