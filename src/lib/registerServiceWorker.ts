export function registerServiceWorker() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    localHosts.has(window.location.hostname)
  ) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.warn("[pwa] service worker registration failed:", error);
    });
  });
}
