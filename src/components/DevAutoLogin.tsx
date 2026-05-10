/**
 * Optional auto-login from `VITE_APP_USER_NSEC` (env).
 *
 * When the env var is set to a valid `nsec1…` AND no user is currently
 * logged in, this component fires `useLoginActions().nsec(...)` once on
 * mount. Useful for dev — skip the AuthDialog on each `localStorage`
 * clear / fresh browser profile.
 *
 * Mounted from `App.tsx`. Renders nothing.
 *
 * Behavior is conservative:
 *   - If a user is already logged in, do nothing (don't override).
 *   - If the env var is unset, empty, the placeholder `nsec1...`, or
 *     not an `nsec1…` string, do nothing.
 *   - Runs exactly once per session (a `useRef` guards against the
 *     re-fire that would happen if the user manually logged out).
 *
 * Production safety: `VITE_APP_USER_NSEC` is a `VITE_*` variable, so it
 * IS exposed to the browser bundle if present at build time. Keep it
 * unset in any production `.env` (and yes, that means the `.env.example`
 * documents it as a *dev only* knob).
 */

import { useEffect, useRef } from "react";
import { nip19 } from "nostr-tools";

import { useLoggedInAccounts } from "@/hooks/useLoggedInAccounts";
import { useLoginActions } from "@/hooks/useLoginActions";
import { readEnv } from "@/lib/env";

const PLACEHOLDER = "nsec1...";

function isValidNsec(value: string): boolean {
  if (!value || value === PLACEHOLDER) return false;
  if (!value.startsWith("nsec1")) return false;
  try {
    const decoded = nip19.decode(value);
    return decoded.type === "nsec";
  } catch {
    return false;
  }
}

export function DevAutoLogin() {
  const { currentUser } = useLoggedInAccounts();
  const actions = useLoginActions();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    if (currentUser) return;

    const candidate = readEnv("VITE_APP_USER_NSEC");
    if (!candidate || !isValidNsec(candidate)) return;

    ran.current = true;
    try {
      actions.nsec(candidate);
    } catch (err) {
      // Don't crash the app if auto-login fails for any reason — fall
      // back to the manual AuthDialog flow.
      console.warn("[DevAutoLogin] auto-login failed:", err);
    }
  }, [currentUser, actions]);

  return null;
}
