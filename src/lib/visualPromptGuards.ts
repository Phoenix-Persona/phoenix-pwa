/**
 * Shared "what NOT to render" directives that get appended to every
 * image / video generation prompt.
 *
 * Image and video models don't have a true system-prompt channel — the
 * whole request is one prose string. So instead of a per-call config
 * surface we keep these directives in one module and concatenate them
 * onto the user's prompt at the call site. One source of truth across
 * Seedance (video), grok-imagine-edit (preview seed frame), PPQ image
 * generation (persona portrait), and Pollinations (free-tier fallback
 * persona portrait).
 *
 * Keep these conservative:
 *   - Phrase as instructions the model will respect ("avoid", "do not")
 *   - Always provide an escape hatch ("unless the user explicitly
 *     requests…") so a future caller can ask for subtitles when they
 *     genuinely need them.
 */

/**
 * No subtitles, captions, on-screen text, watermarks, or logos in the
 * generated frame. Kept narrow on purpose — talking-head clips and
 * persona portraits should be clean cinema unless someone explicitly
 * asks for chyron-style text overlays.
 */
export const NO_TEXT_OVERLAY_DIRECTIVE =
  "Do not render subtitles, captions, on-screen text, lower-thirds, " +
  "watermarks, channel logos, news tickers, or any baked-in typography " +
  "in the frame unless the prompt explicitly requests them.";

/**
 * Append the no-subtitle directive to a free-text prompt. Idempotent —
 * if the directive (or a clear caller intent to include text) is
 * already present, the prompt is returned untouched.
 */
export function withNoTextOverlay(prompt: string): string {
  const trimmed = (prompt ?? "").trim();
  if (!trimmed) return NO_TEXT_OVERLAY_DIRECTIVE;
  if (trimmed.includes(NO_TEXT_OVERLAY_DIRECTIVE)) return trimmed;
  // Crude opt-out: if the caller's prompt already mentions wanting text,
  // don't fight it — the model will weight the user's words anyway, and
  // suppressing would create contradictory instructions.
  if (/\b(subtitle|caption|on-?screen text|chyron|lower-?third)s?\b/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}\n\n${NO_TEXT_OVERLAY_DIRECTIVE}`;
}
