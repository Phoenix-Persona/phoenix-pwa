/**
 * Generate a multi-segment monologue script for an i2v video chain.
 *
 * Calls ppq.ai's chat completions endpoint (claude-sonnet-4.5 by
 * default), grounded in:
 *   - The persona's voice (system_prompt + bio + tags + languages).
 *   - The user's idea (the Dashboard composer "raw" field).
 *   - Optional sources (URLs the user wants the persona to ground in).
 *   - Optional style hints (tone / framing direction).
 *   - The total target duration.
 *
 * Output is a strict JSON object with N segments where N = ⌈duration/segmentSecs⌉
 * and each segment has its `dialog` calibrated to fit comfortably in
 * one i2v clip's worth of speech (~2.4 wpsec ≈ 24 words / 10s).
 *
 * Pure async — no React, no hooks. Caller passes `apiKey` directly so
 * this module can be exercised from any context.
 */

import { chatCompletion } from "@/lib/ppq/client";
import type { Persona } from "@/lib/persona";

export interface ScriptSegment {
  /** Per-clip duration in seconds. Defaults to the chain's segment length. */
  duration: number;
  /** What the persona says in this segment. */
  dialog: string;
  /** Short label for UI display (e.g. "1 — hook"). */
  label: string;
}

export interface GenerateScriptArgs {
  apiKey: string;
  persona: Persona;
  idea: string;
  sources?: string[];
  hints?: string;
  /** Total target footage in seconds. Rounded up to a multiple of segmentSecs. */
  totalDurationSecs: number;
  /** Per-clip duration. Default 10 — matches the proven Seedance default. */
  segmentSecs?: number;
  /** LLM model. Default `claude-sonnet-4.5`. */
  model?: string;
  signal?: AbortSignal;
}

const DEFAULT_SEGMENT_SECS = 10;
const DEFAULT_MODEL = "claude-sonnet-4.5";

const SYSTEM_PROMPT = [
  "You are a screenwriter generating monologue scripts for a Phoenix",
  "AI persona — a journalist or activist character speaking directly",
  "to camera in a short-form video.",
  "",
  "You will be given:",
  "  • the persona's voice spec (system prompt, bio, tags, languages)",
  "  • the user's raw idea for what the persona should say",
  "  • optional sources the persona should cite or ground in",
  "  • optional style hints (tone, framing)",
  "  • a total target duration and a per-clip segment length",
  "",
  "Your job is to break the monologue into N segments where",
  "  N = ceil(totalDurationSecs / segmentSecs)",
  "each segment fitting comfortably in one clip with breathing room.",
  "Aim for ~2.4 words/second pacing — for a 10-second clip, that's",
  "about 22-26 words including natural pauses. Do NOT cram.",
  "",
  "Each segment should:",
  "  • start where the previous one ended (continuity of thought)",
  "  • introduce a fresh emotional beat or new fact",
  "  • leave at least one natural pause (signaled by punctuation)",
  "  • stay in the persona's voice throughout",
  "",
  "Return STRICT JSON only. No prose around the JSON. Schema:",
  "  {",
  '    "segments": [',
  '      { "label": "1 — hook",        "duration": 10, "dialog": "..." },',
  '      { "label": "2 — escalation",  "duration": 10, "dialog": "..." },',
  "      ...",
  "    ]",
  "  }",
  "",
  "Do not include language directives, stage directions, or any text",
  "the persona is not literally saying. The dialog field is exactly",
  "what will be spoken in the clip.",
].join("\n");

export async function generateMonologueScript(
  args: GenerateScriptArgs,
): Promise<ScriptSegment[]> {
  const segmentSecs = args.segmentSecs ?? DEFAULT_SEGMENT_SECS;
  const numSegments = Math.max(
    1,
    Math.ceil(args.totalDurationSecs / segmentSecs),
  );

  const persona = args.persona;
  const userPayload = {
    persona: {
      name: persona.name,
      system_prompt: persona.system_prompt,
      bio: persona.bio,
      tags: persona.tags,
      languages: persona.languages,
      tone: persona.tone,
      region: persona.region,
      cause: persona.cause,
    },
    idea: args.idea,
    sources: args.sources ?? [],
    hints: args.hints ?? "",
    totalDurationSecs: args.totalDurationSecs,
    segmentSecs,
    numSegments,
  };

  const response = await chatCompletion(
    args.apiKey,
    {
      model: args.model ?? DEFAULT_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `Generate ${numSegments} segments of ${segmentSecs}s each ` +
            `for a total of ${args.totalDurationSecs}s of footage.\n\n` +
            "Inputs:\n```json\n" +
            JSON.stringify(userPayload, null, 2) +
            "\n```\n\nReturn the JSON now.",
        },
      ],
      // Conservative ceiling — N segments × ~30 words × ~5 tokens/word.
      max_tokens: Math.max(1024, numSegments * 200),
    },
    { signal: args.signal },
  );

  const text = response.choices?.[0]?.message?.content ?? "";
  const segments = parseSegments(text, segmentSecs);

  if (segments.length === 0) {
    throw new Error(
      `Script generation returned 0 segments. Raw response:\n${text.slice(0, 500)}`,
    );
  }
  return segments;
}

/**
 * Tolerant JSON extraction. Models sometimes wrap the JSON in markdown
 * code fences or add a sentence of preamble; this helper finds the
 * first {...} block, parses it, and validates the shape.
 */
function parseSegments(text: string, segmentSecs: number): ScriptSegment[] {
  const jsonText = extractFirstJsonObject(text);
  if (!jsonText) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const obj = parsed as Record<string, unknown>;
  const raw = obj.segments;
  if (!Array.isArray(raw)) return [];

  const out: ScriptSegment[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i] as Record<string, unknown> | null | undefined;
    if (!s || typeof s !== "object") continue;
    const dialog = typeof s.dialog === "string" ? s.dialog.trim() : "";
    if (!dialog) continue;
    const duration =
      typeof s.duration === "number" && Number.isFinite(s.duration)
        ? s.duration
        : segmentSecs;
    const label =
      typeof s.label === "string" && s.label.trim().length > 0
        ? s.label.trim()
        : `${i + 1}`;
    out.push({ duration, dialog, label });
  }
  return out;
}

function extractFirstJsonObject(text: string): string | undefined {
  const start = text.indexOf("{");
  if (start === -1) return undefined;
  // Walk forward, tracking brace depth, ignoring braces inside strings.
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return undefined;
}
