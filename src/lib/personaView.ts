import type { NostrMetadata } from "@nostrify/nostrify";

import { genUserName } from "@/lib/genUserName";
import type { Persona } from "@/lib/persona";
import { sanitizeHttpUrl } from "@/lib/url";

export interface PersonaDisplayProfile {
  displayName: string;
  bio: string;
  pictureUrl: string | null;
}

export function safePersonaPictureUrl(
  raw: string | null | undefined,
): string | null {
  return sanitizeHttpUrl(raw);
}

export function backupPersonaPictureUrl(
  persona: Pick<Persona, "reference_image_url">,
): string | null {
  return safePersonaPictureUrl(persona.reference_image_url);
}

export function buildPersonaDisplayProfile({
  metadata,
  fallbackPubkey,
  fallbackName,
}: {
  metadata: NostrMetadata | undefined;
  fallbackPubkey?: string;
  fallbackName?: string;
}): PersonaDisplayProfile {
  const generatedName = fallbackPubkey ? genUserName(fallbackPubkey) : undefined;
  return {
    displayName:
      metadata?.display_name ??
      metadata?.name ??
      fallbackName ??
      generatedName ??
      "Unknown persona",
    bio: metadata?.about ?? "",
    pictureUrl: safePersonaPictureUrl(metadata?.picture),
  };
}
