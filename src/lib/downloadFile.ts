import { Capacitor } from '@capacitor/core';

/**
 * Download a text file to the user's device.
 *
 * On the web this uses the classic `<a download>` trick.
 * On native (Android & iOS) the file is saved to the app's Documents
 * directory, which is visible in the iOS Files app and Android's
 * app-scoped documents. No permissions are required.
 *
 * @example
 *   await downloadTextFile('backup.json', JSON.stringify(data));
 */
export async function downloadTextFile(filename: string, content: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');

    // Write straight to Documents — visible in the iOS Files app and
    // Android's app-scoped documents. No storage permissions needed.
    // NOTE: encoding is required — without it Capacitor expects base64 data
    // and will throw for plain-text strings.
    await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
  } else {
    // Web: anchor-click download from a Blob URL.
    const blob = new Blob([content], { type: 'text/plain; charset=utf-8' });
    const url = globalThis.URL.createObjectURL(blob);
    triggerAnchorDownload(url, filename);
    setTimeout(() => globalThis.URL.revokeObjectURL(url), 5_000);
  }
}

/**
 * Open a URL in a new browser tab, or present the native share sheet on Capacitor.
 *
 * The programmatic `<a target="_blank">` click pattern doesn't work inside
 * WKWebView on iOS. On native platforms this presents the share sheet instead,
 * letting the user open, save, or share the resource.
 *
 * @example
 *   <Button onClick={() => openUrl('https://example.com')}>Visit site</Button>
 */
export async function openUrl(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Share } = await import('@capacitor/share');
    await Share.share({ url });
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Force a browser download of a remote URL (e.g. a video on a Blossom
 * server). Used by the cross-post-to-X flow to save the rendered video
 * locally before opening the X intent.
 *
 * Two paths:
 *   1. fetch the bytes into a Blob → object URL → hidden `<a download>`
 *      click. This is the reliable path: it lets us name the file
 *      correctly even if the server doesn't set Content-Disposition,
 *      and it bypasses the "open in new tab instead of download"
 *      fallback browsers do for cross-origin `<a download>`.
 *   2. If the fetch is blocked (CORS / CORP), fall back to a same-tab
 *      anchor click. Browsers usually still grant the download for
 *      direct user-initiated navigations.
 *
 * Failures are non-fatal — caller decides whether to surface them.
 * Returns the route that was used so callers can log it if they care.
 */
export async function downloadFile(
  url: string,
  filename?: string,
): Promise<"blob" | "anchor"> {
  const name = filename ?? deriveFilename(url);
  try {
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(`download fetch ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerAnchorDownload(objectUrl, name);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5_000);
    return "blob";
  } catch {
    triggerAnchorDownload(url, name);
    return "anchor";
  }
}

export function deriveFilename(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (last && /\.[a-z0-9]{2,5}$/i.test(last)) return last;
    if (last) return `${last}.mp4`;
  } catch {
    /* fall through */
  }
  return "video.mp4";
}

function triggerAnchorDownload(href: string, filename: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener noreferrer";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
