/**
 * Generate the kind 1 caption that will accompany the published video.
 *
 * Same shape as `generateMonologueScript` but produces a single short
 * social-media-ready caption — the text the user will see in their
 * Nostr client's feed before the video plays.
 *
 * The caption gets pre-filled into an editable textarea on the final
 * step of the dialog. The user always has the last word; this is just
 * a starting draft.
 */

import { chatCompletion } from "@/lib/ppq/client";
import type { Persona } from "@/lib/persona";

import type { ScriptSegment } from "./generateMonologueScript";

export interface GenerateCaptionArgs {
  apiKey: string;
  persona: Persona;
  idea: string;
  sources?: string[];
  segments: ScriptSegment[];
  /** LLM model. Default `claude-sonnet-4.5`. */
  model?: string;
  signal?: AbortSignal;
}

const DEFAULT_MODEL = "claude-sonnet-4.5";

const SYSTEM_PROMPT = [
  "You are writing a short social-media caption for a Nostr post that",
  "carries an AI-generated talking-head video.",
  "",
  "You will be given:",
  "  • the persona's voice spec (so the caption sounds like them)",
  "  • the user's original idea",
  "  • the spoken script of the video, segment by segment",
  "  • optional source URLs",
  "",
  "Write a single caption between 1 and 3 short paragraphs (max ~280",
  "characters total — Twitter-shaped). It should:",
  "  • land the headline message in the first sentence",
  "  • match the persona's voice",
  "  • read naturally to a viewer who hasn't pressed play yet",
  "  • NOT repeat the script verbatim — the video says that already",
  "  • NOT include hashtags or @-mentions (the post will get its `t`",
  "    tags from the persona's tag list separately)",
  "  • end without a sign-off (no \"— Imani\" / no signature)",
  "",
  "Return ONLY the caption text. No JSON, no preamble, no explanation.",
].join("\n");

export async function generateCaption(args: GenerateCaptionArgs): Promise<string> {
  const persona = args.persona;
  const userPayload = {
    persona: {
      name: persona.name,
      system_prompt: persona.system_prompt,
      bio: persona.bio,
      tone: persona.tone,
      languages: persona.languages,
      tags: persona.tags,
    },
    idea: args.idea,
    sources: args.sources ?? [],
    script: args.segments.map((s) => ({
      label: s.label,
      dialog: s.dialog,
    })),
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
            "Inputs:\n```json\n" +
            JSON.stringify(userPayload, null, 2) +
            "\n```\n\nWrite the caption now.",
        },
      ],
      max_tokens: 400,
    },
    { signal: args.signal },
  );

  const text = response.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) {
    throw new Error("Caption generation returned empty content");
  }
  return text;
}
