/**
 * Extract the last frame of a video URL as a PNG Blob — browser-side,
 * no ffmpeg.
 *
 * Strategy:
 *   1. Fetch the URL into a Blob (avoids cross-origin canvas tainting
 *      that would otherwise break `canvas.toBlob` for ppq.ai's signed
 *      URLs).
 *   2. Wrap it in an object URL and feed it to a hidden `<video>`.
 *   3. On `loadedmetadata`, seek to `duration - epsilon`. The epsilon
 *      keeps us off the very-last-presentation boundary, which some
 *      browsers refuse to seek to.
 *   4. On `seeked`, draw the frame to a canvas at the video's natural
 *      resolution.
 *   5. Convert the canvas to a PNG Blob.
 *
 * The returned Blob is suitable for direct upload to Blossom or use
 * as `image_url` for the next i2v generation in the chain.
 *
 * Caller is responsible for revoking object URLs they create from the
 * returned Blob; this function cleans up its own internal one.
 */

export interface ExtractLastFrameOptions {
  /** Seconds before video end to sample. Default 0.1. */
  epsilonSecs?: number;
  /** PNG quality 0..1. Ignored for PNG (lossless), kept for API symmetry. */
  quality?: number;
  /** AbortSignal to cancel mid-flight (e.g. dialog closed). */
  signal?: AbortSignal;
}

const DEFAULT_EPSILON_SECS = 0.1;

export async function extractLastFrame(
  videoUrl: string,
  opts: ExtractLastFrameOptions = {},
): Promise<Blob> {
  const { signal } = opts;
  if (signal?.aborted) throw abortError();

  // 1. Fetch into a Blob so we don't taint the canvas on cross-origin
  // ppq.ai signed URLs.
  const res = await fetch(videoUrl, { signal });
  if (!res.ok) {
    throw new Error(`extractLastFrame: fetch failed ${res.status}`);
  }
  const videoBlob = await res.blob();
  const objectUrl = URL.createObjectURL(videoBlob);

  try {
    return await captureFrameFromObjectUrl(objectUrl, opts);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function captureFrameFromObjectUrl(
  objectUrl: string,
  opts: ExtractLastFrameOptions,
): Promise<Blob> {
  const epsilon = opts.epsilonSecs ?? DEFAULT_EPSILON_SECS;
  const { signal } = opts;

  return new Promise<Blob>((resolve, reject) => {
    const video = document.createElement("video");
    // Hidden + offscreen so we never paint into the user's view.
    video.style.position = "fixed";
    video.style.left = "-9999px";
    video.style.top = "-9999px";
    video.style.width = "1px";
    video.style.height = "1px";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";

    let settled = false;
    const cleanup = () => {
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        /* fine */
      }
      if (video.parentNode) video.parentNode.removeChild(video);
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
    };
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const succeed = (blob: Blob) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(blob);
    };

    const abortHandler = signal
      ? () => fail(abortError())
      : null;
    if (signal && abortHandler) {
      if (signal.aborted) {
        fail(abortError());
        return;
      }
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    video.addEventListener("error", () => {
      fail(
        new Error(
          `extractLastFrame: <video> failed to load (code=${video.error?.code ?? "?"})`,
        ),
      );
    });

    video.addEventListener(
      "loadedmetadata",
      () => {
        const duration = video.duration;
        if (!Number.isFinite(duration) || duration <= 0) {
          fail(
            new Error(
              `extractLastFrame: invalid duration ${String(duration)}`,
            ),
          );
          return;
        }
        // Leave a tiny gap before the end — some browsers won't seek
        // exactly to `duration` and the resulting frame may be black.
        video.currentTime = Math.max(0, duration - epsilon);
      },
      { once: true },
    );

    video.addEventListener(
      "seeked",
      () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            fail(new Error("extractLastFrame: 2D canvas context unavailable"));
            return;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                fail(new Error("extractLastFrame: canvas.toBlob returned null"));
                return;
              }
              succeed(blob);
            },
            "image/png",
          );
        } catch (err) {
          fail(err);
        }
      },
      { once: true },
    );

    document.body.appendChild(video);
    video.src = objectUrl;
  });
}

function abortError(): DOMException {
  return new DOMException("extractLastFrame aborted", "AbortError");
}
