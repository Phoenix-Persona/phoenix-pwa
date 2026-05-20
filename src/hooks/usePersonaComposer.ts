import { useCallback } from "react";
import type { NostrEvent } from "@nostrify/nostrify";

import type { Persona } from "@/lib/persona";
import { buildPersonaPostTemplate } from "@/lib/personaPost";
import { parseCommaList } from "@/lib/text";

import { useCrossPost } from "./useCrossPost";
import { useCurrentUser } from "./useCurrentUser";
import { usePersonaPublish } from "./usePersonaPublish";
import { getInferenceText, usePpqInference } from "./usePpqInference";
import type { PpqAccountOptions } from "./usePpqAccount";

export interface PersonaComposerWalletRefresh {
  refreshInfo: () => void;
  refreshPpqBalance: () => void;
}

export interface UsePersonaComposerOptions {
  persona: Persona | null | undefined;
  stylingModel: string;
  crossPostEnabled?: boolean;
  wallet?: PersonaComposerWalletRefresh;
  ppqAccountOptions?: PpqAccountOptions;
  onPublished?: () => void | Promise<void>;
}

export interface PublishTextOnlyInput {
  text: string;
  sourcesInput: string;
}

export interface PublishTextOnlyResult {
  event: NostrEvent;
  crossPost: "skipped" | "sent" | "failed";
  crossPostError?: Error;
}

export function usePersonaComposer({
  persona,
  stylingModel,
  crossPostEnabled = false,
  wallet,
  ppqAccountOptions,
  onPublished,
}: UsePersonaComposerOptions) {
  const { user } = useCurrentUser();
  const publish = usePersonaPublish();
  const crossPost = useCrossPost();
  const styling = usePpqInference(ppqAccountOptions);

  const styleInVoice = useCallback(
    async (text: string): Promise<string | null> => {
      const trimmed = text.trim();
      if (!persona || !trimmed) return null;

      const res = await styling.mutateAsync({
        model: stylingModel,
        messages: [
          { role: "system", content: persona.system_prompt },
          { role: "user", content: trimmed },
        ],
      });
      const styled = getInferenceText(res).trim();
      if (!styled) return null;

      wallet?.refreshPpqBalance();
      wallet?.refreshInfo();
      return styled;
    },
    [persona, styling, stylingModel, wallet],
  );

  const publishTextOnly = useCallback(
    async ({
      text,
      sourcesInput,
    }: PublishTextOnlyInput): Promise<PublishTextOnlyResult | null> => {
      const trimmed = text.trim();
      if (!persona || !user || !trimmed) return null;

      const template = buildPersonaPostTemplate({
        text: trimmed,
        sources: parseCommaList(sourcesInput, []),
      });
      const event = await publish.mutateAsync({
        personaNsec: persona.nsec,
        template,
      });
      const shouldCrossPost = Boolean(
        crossPostEnabled && persona.cross_post?.webhook_url,
      );

      let result: PublishTextOnlyResult = {
        event,
        crossPost: shouldCrossPost ? "sent" : "skipped",
      };

      if (shouldCrossPost) {
        try {
          await crossPost.mutateAsync({ persona, event });
        } catch (error) {
          result = {
            event,
            crossPost: "failed",
            crossPostError:
              error instanceof Error ? error : new Error("Cross-post failed"),
          };
        }
      }

      await onPublished?.();
      return result;
    },
    [crossPost, crossPostEnabled, onPublished, persona, publish, user],
  );

  return {
    styleInVoice,
    publishTextOnly,
    isStyling: styling.isPending,
    isPublishing: publish.isPending || crossPost.isPending,
  };
}
