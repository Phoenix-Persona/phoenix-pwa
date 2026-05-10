/**
 * Free-tier image generation via Pollinations AI.
 *
 * Used as the onboarding fallback when the operator hasn't funded
 * their PPQ account yet — by definition a brand-new user can't
 * Lightning-pay for image inference, but we still need to give them
 * a persona portrait. Pollinations' public endpoint is unauth'd,
 * fast, and produces a single PNG per request.
 *
 * The endpoint is unusual: the prompt rides in the URL *path*, not a
 * query string. Width / height / model / nologo go in the query.
 *
 *   GET https://image.pollinations.ai/prompt/<encoded prompt>
 *       ?width=1024&height=1024&model=flux&nologo=true
 *
 * Response is the raw PNG bytes — no JSON wrapping. We return the
 * Blob directly so callers can re-upload to Blossom the same way they
 * do today for PPQ-generated images.
 *
 * No API key, no rate-limit headers documented. We treat this as a
 * best-effort path; PPQ remains the canonical (paid) generation route
 * for personas that have funds.
 */

const ENDPOINT_BASE = "https://image.pollinations.ai/prompt";

export interface PollinationsImageRequest {
  prompt: string;
  /** Output width in pixels. Default 1024. */
  width?: number;
  /** Output height in pixels. Default 1024. */
  height?: number;
  /** Model name. Default "flux" — currently the highest quality on the free tier. */
  model?: string;
  /** Strip the Pollinations watermark. Default true (we own the post). */
  nologo?: boolean;
  /** Optional deterministic seed — same prompt + seed yields the same image. */
  seed?: number;
  /** AbortSignal so callers can cancel a slow generation (the API can take 5-15s). */
  signal?: AbortSignal;
}

export class PollinationsError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "PollinationsError";
    this.status = status;
  }
}

/**
 * Generate an image and return the bytes as a Blob. Caller is
 * responsible for uploading to Blossom (or wherever) — we don't
 * persist anything here.
 */
export async function generatePollinationsImage(
  req: PollinationsImageRequest,
): Promise<Blob> {
  const prompt = req.prompt?.trim();
  if (!prompt) throw new Error("Pollinations: prompt is required");

  const url = new URL(`${ENDPOINT_BASE}/${encodeURIComponent(prompt)}`);
  url.searchParams.set("width", String(req.width ?? 1024));
  url.searchParams.set("height", String(req.height ?? 1024));
  url.searchParams.set("model", req.model ?? "flux");
  url.searchParams.set("nologo", String(req.nologo ?? true));
  if (typeof req.seed === "number") {
    url.searchParams.set("seed", String(req.seed));
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    credentials: "omit",
    signal: req.signal,
  });
  if (!res.ok) {
    throw new PollinationsError(
      res.status,
      `Pollinations request failed (${res.status})`,
    );
  }
  const blob = await res.blob();
  if (blob.size === 0) {
    throw new PollinationsError(
      500,
      "Pollinations returned an empty response",
    );
  }
  return blob;
}
