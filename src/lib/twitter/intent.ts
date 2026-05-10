/**
 * "Post to X" via deep-link, no API integration required.
 *
 * Twitter / X exposes a documented intent endpoint that pre-fills the
 * compose box with arbitrary text. We open it in a new tab; on mobile
 * the X app intercepts the URL via universal links and opens its
 * native composer instead — same UX, zero code path divergence.
 *
 * Files (videos / images) cannot be attached via deep-link — the
 * intent API only accepts text. Best we can do is trigger a browser
 * download of the media URL so the file lands in the user's Downloads
 * folder; they then attach it manually in the composer.
 *
 * No auth, no JWT, no operator binding, no callback route — every
 * persona-author can post to whatever X handle is logged in on their
 * device, on demand.
 */

const TWITTER_INTENT_BASE = "https://twitter.com/intent/tweet";

export interface ComposeIntentArgs {
  /** Tweet body. URL appending happens here, not via &url= (more reliable on mobile). */
  text: string;
  /** Optional media URL — when present, also kicks off a download so the user can attach. */
  mediaUrl?: string;
  /** Suggested filename for the download. Defaults to the URL's last path segment. */
  filename?: string;
}

/**
 * Build the intent URL for a tweet body. We embed any media URL
 * directly in the text rather than the `&url=` parameter — the X
 * compose page renders both equivalently, but inline keeps tweets
 * predictable when shared back through clients that strip the param.
 */
export function buildTwitterIntentUrl(text: string): string {
  const url = new URL(TWITTER_INTENT_BASE);
  url.searchParams.set("text", text);
  return url.toString();
}

/**
 * Trigger a browser download of `url` with the given filename. The
 * fetch path lets us drop a real Blob into the download (so the file
 * is named correctly even when the server doesn't set
 * Content-Disposition) and bypasses cross-origin "open in new tab"
 * fallback that browsers do when `<a download>` points at a different
 * origin.
 *
 * Failures are non-fatal — the X compose tab still opens, and the
 * user can right-click → Save the video from the kind 1 in their feed
 * if the auto-download didn't work.
 */
export async function downloadVideoForAttach(
  url: string,
  filename?: string,
): Promise<void> {
  const name = filename ?? deriveFilename(url);
  try {
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(`download fetch ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerAnchorDownload(objectUrl, name);
    // Revoke after the click has had a tick to register.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5_000);
  } catch {
    // Cross-origin fetch blocked? Fall back to a same-tab anchor click —
    // browsers usually still grant the download when navigated directly.
    triggerAnchorDownload(url, name);
  }
}

/**
 * Open the X compose tab AND start downloading the video so the user
 * can attach it once they're in the composer. Both happen in
 * parallel — we don't await the download because the X tab opens
 * faster and the file finishes in the background.
 */
export function postToTwitterIntent(args: ComposeIntentArgs): void {
  const text = args.mediaUrl
    ? appendMediaUrl(args.text, args.mediaUrl)
    : args.text;
  const intent = buildTwitterIntentUrl(text);

  if (args.mediaUrl) {
    void downloadVideoForAttach(args.mediaUrl, args.filename);
  }

  // Open in a new tab. `noopener` cuts the opener reference so X can't
  // navigate us; `noreferrer` keeps our origin out of their referer log.
  window.open(intent, "_blank", "noopener,noreferrer");
}

/* ---------- helpers ---------- */

function appendMediaUrl(text: string, mediaUrl: string): string {
  const trimmed = (text ?? "").trim();
  if (trimmed.includes(mediaUrl)) return trimmed;
  if (trimmed.length === 0) return mediaUrl;
  return `${trimmed}\n\n${mediaUrl}`;
}

function deriveFilename(url: string): string {
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
