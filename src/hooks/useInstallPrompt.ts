/**
 * useInstallPrompt — capture the `beforeinstallprompt` event and
 * expose a handle the UI can fire when the user opts in.
 *
 * Browsers fire `beforeinstallprompt` once when the PWA becomes
 * install-eligible (proper manifest + service worker + HTTPS, the
 * site has been engaged with at least a little). We intercept it,
 * suppress the auto-banner with `preventDefault()`, and stash the
 * event so our own UI can call `event.prompt()` at a moment that
 * makes sense.
 *
 * Caller pattern:
 *   const { canInstall, install, dismiss, dismissedAt } = useInstallPrompt();
 *   if (canInstall && !dismissedAt) <InstallBanner onInstall={install} onDismiss={dismiss} />
 *
 * Dismissal is sticky: once the user dismisses, we don't re-show
 * until 30 days later. After a successful install, the prompt event
 * is consumed and `canInstall` becomes false until the next visit
 * from a non-installed browser.
 */

import { useEffect, useState, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = "zuka:install-banner-dismissed-at";
/** Don't re-prompt for 30 days after a dismissal. */
const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function readDismissedAt(): number | null {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    // Expire stale entries so the prompt comes back after the cooldown.
    if (Date.now() - n > DISMISS_TTL_MS) {
      localStorage.removeItem(DISMISS_KEY);
      return null;
    }
    return n;
  } catch {
    return null;
  }
}

export function useInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(() =>
    readDismissedAt()
  );
  // Initialize from display-mode synchronously so we never call
  // setState inside the listener-setup effect (React 19 lint rule).
  // The `appinstalled` event handler below still updates via the
  // setter — that's a user-event callback, not an effect.
  const [installed, setInstalled] = useState(() => {
    if (typeof window === "undefined") return false;
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
    // iOS Safari exposes `standalone` on navigator instead.
    return Boolean(
      (window.navigator as unknown as { standalone?: boolean }).standalone
    );
  });

  useEffect(() => {
    function handleBeforeInstall(e: Event) {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    }
    function handleAppInstalled() {
      setInstalled(true);
      setEvent(null);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!event) return null;
    try {
      await event.prompt();
      const choice = await event.userChoice;
      // After a prompt, the browser invalidates the event handle —
      // either we got installed (handleAppInstalled fires too) or the
      // user dismissed. Either way we drop our reference.
      setEvent(null);
      if (choice.outcome === "dismissed") {
        const now = Date.now();
        try {
          localStorage.setItem(DISMISS_KEY, String(now));
        } catch {
          /* ignore */
        }
        setDismissedAt(now);
      }
      return choice.outcome;
    } catch {
      setEvent(null);
      return null;
    }
  }, [event]);

  const dismiss = useCallback(() => {
    const now = Date.now();
    try {
      localStorage.setItem(DISMISS_KEY, String(now));
    } catch {
      /* ignore */
    }
    setDismissedAt(now);
  }, []);

  return {
    /** True only when the browser has fired `beforeinstallprompt` and
     *  we have a pending event handle to invoke. */
    canInstall: !installed && event !== null,
    /** Trigger the browser's install prompt. Resolves to the user's
     *  choice or null if the prompt failed / wasn't available. */
    install,
    /** User chose to dismiss the banner — suppresses for 30 days. */
    dismiss,
    /** Timestamp of last dismissal (within TTL), or null. */
    dismissedAt,
    /** True once `appinstalled` fires or the app loads in standalone mode. */
    installed,
  };
}
