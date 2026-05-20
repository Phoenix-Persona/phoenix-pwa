# Passkey PRF Support Report

Date: 2026-05-19

## Summary

WebAuthn PRF is a plausible way to unlock or wrap Zuka's encrypted vault without sending vault plaintext through a Nostr signing extension. It can produce deterministic key material from a passkey and a site-provided salt, which Zuka can feed through HKDF and use as a WebCrypto wrapping key.

The current support landscape is good enough for a compatibility probe and optional vault unlock path, but not strong enough to make PRF the only recovery mechanism for beta. Support depends on the full chain: browser, OS, passkey provider, and authenticator.

## Why This Matters for Zuka

Zuka currently stores sensitive app data in encrypted Nostr events. When encryption/decryption is delegated to a NIP-07 or NIP-46 signer, the signer can see plaintext vault contents during the operation. That is acceptable only if the signer is trusted not just cryptographically, but operationally: it must not log, retain, or expose decrypted payloads.

Passkey PRF gives us a way to move vault encryption into app-controlled WebCrypto while still keeping a low-friction unlock experience:

1. Generate a random vault data key.
2. Encrypt the vault payload locally with AES-GCM.
3. Use WebAuthn PRF output plus HKDF to derive a wrapping key.
4. Wrap the data key with that wrapping key.
5. Publish only encrypted vault payload and encrypted key wrappers to Nostr.
6. Use the Nostr signer only to sign the outer event.

This prevents Nostr signer extensions from receiving wallet seeds, persona nsecs, PPQ credentials, or equivalent vault plaintext.

## How WebAuthn PRF Works

The WebAuthn `prf` extension lets a relying party pass one or two salts into a credential ceremony and receive deterministic PRF output for the selected credential. The output is associated with the passkey/authenticator and salt.

For Zuka, the intended derivation would be:

```text
prfOutput = WebAuthnPRF(passkey, zukaVaultSalt)
wrappingKey = HKDF(prfOutput, context = "zuka-vault-wrap-v1")
vaultDataKey = AES-KW/AES-GCM-unwrapped data key
vaultPlaintext = AES-GCM-decrypt(encryptedVault, vaultDataKey)
```

The PRF result should not be used raw as a long-term content encryption key. Treat it as key-derivation material, derive a purpose-bound wrapping key, and use that wrapping key to protect a random vault data key.

## Support Findings

### Chrome and Edge

Chromium has shipped WebAuthn PRF support. Chrome/Edge are the strongest first target, but support still depends on the platform authenticator or security key. Chromium's own intent-to-ship notes that Windows support depends on OS support, not every security key supports the underlying capability, and some Android passkey providers may not support it.

### Apple Platforms

Safari 18+ with iCloud Keychain platform passkeys appears viable for PRF-based key derivation. The main limitation is external/roaming authenticators, especially on iOS and iPadOS, where PRF extension data may not pass through to external security keys.

For Zuka, Apple platform passkeys are the likely happy path. YubiKey-style recovery should not be assumed on iOS/iPadOS.

### Firefox

Firefox support has been actively landing and fixing across platforms, but public bug reports indicate platform-specific gaps and missing PRF results in some cases. Treat Firefox as "probe first, enable when confirmed," not as a baseline for beta recovery.

### Android

Android Chrome with Google Password Manager is likely viable for platform passkeys. External-key support is uneven by transport and platform. Android WebView support is a separate concern and should not be assumed without native Credential Manager integration.

### PWA and WebView Risk

Installed PWA and WebView behavior needs explicit testing. Even if PRF works in a browser tab, it may behave differently in standalone PWA shells or native wrappers. Capacitor support should be treated as a separate spike.

## Security Properties

PRF helps with the specific problem of Nostr signer plaintext exposure. If Zuka encrypts the vault locally and only asks the signer to sign the already-encrypted Nostr event, signer extensions no longer receive vault plaintext.

PRF does not solve origin compromise. If malicious JavaScript runs in Zuka's origin, it can call WebAuthn, capture PRF output after user approval, read decrypted vault plaintext, or tamper with UI. CSP, dependency hygiene, URL sanitization, and avoiding untrusted HTML remain critical.

PRF also does not create silent unlock. WebAuthn ceremonies require user presence/verification and cannot be triggered invisibly.

## Recovery Risks

The major risk is data loss. If a vault is wrapped only with a PRF credential and the user deletes or loses that passkey, Zuka cannot recover the vault.

For beta, do not rely on a single PRF wrapper. Use multiple wrappers:

- Passkey PRF wrapper when supported.
- Same-device local wrapper for fast unlock.
- Legacy signer-based wrapper during migration, with clear warning.
- Optional recovery secret or recovery phrase later if we need durable cross-device recovery independent of passkeys.

## Recommended Zuka Plan

1. Build a `/dev` PRF compatibility probe.
   - Test registration and authentication.
   - Test `create()` PRF enablement.
   - Test `get()` PRF output.
   - Test browser tab vs installed PWA.
   - Capture browser, platform, authenticator type, and whether output was present.
   - Never log PRF output or derived keys.

2. Design a vault wrapper format.
   - Store encrypted vault payload separately from key wrappers.
   - Support multiple wrapper records per vault.
   - Include wrapper type, version, salt id, credential id, KDF parameters, and ciphertext.

3. Implement PRF as optional.
   - Offer "Unlock with passkey" only when a probe confirms support.
   - Fall back gracefully when PRF output is missing.
   - Do not make PRF the only beta recovery path.

4. Migrate legacy NIP-44 vaults carefully.
   - Decrypt legacy envelopes once.
   - Re-encrypt into local WebCrypto vault format.
   - Publish the new vault.
   - Keep migration explicit and warn when extension-based decrypt is required.

## Recommendation

Proceed with a compatibility spike and prototype. Do not make PRF mandatory for beta release.

The right beta posture is:

- Prefer local WebCrypto vault encryption.
- Use passkey PRF as the best low-friction wrapper when available.
- Keep a fallback wrapper so users are not locked out by PRF support gaps.
- Treat WebView and Capacitor PRF support as unproven until tested on target devices.

## Sources

- MDN WebAuthn extensions: https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/WebAuthn_extensions
- W3C WebAuthn Level 3 PRF extension: https://w3c.github.io/webauthn/#prf-extension
- Chromium Intent to Ship: WebAuthn PRF extension: https://groups.google.com/a/chromium.org/g/blink-dev/c/iTNOgLwD2bI
- Yubico Developers Guide to PRF: https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/Developers_Guide_to_PRF.html
- SimpleWebAuthn PRF warning: https://simplewebauthn.dev/docs/advanced/prf
