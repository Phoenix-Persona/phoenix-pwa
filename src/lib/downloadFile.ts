/**
 * Force a browser download of a remote URL.
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
