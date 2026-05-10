import { useQuery } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";

import { queryKeys } from "@/lib/queryKeys";

export interface PersonaPublicProfile {
  bio: string;
  picture: string;
}

function parsePublicProfile(content: string): PersonaPublicProfile {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== "object") {
      return { bio: "", picture: "" };
    }
    const metadata = parsed as Record<string, unknown>;
    return {
      bio: typeof metadata.about === "string" ? metadata.about : "",
      picture: typeof metadata.picture === "string" ? metadata.picture : "",
    };
  } catch {
    return { bio: "", picture: "" };
  }
}

export function usePersonaPublicProfile(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: queryKeys.persona.publicProfile(pubkey),
    enabled: Boolean(pubkey),
    queryFn: async (c): Promise<PersonaPublicProfile> => {
      if (!pubkey) return { bio: "", picture: "" };
      const events = await nostr.query(
        [{ kinds: [0], authors: [pubkey], limit: 1 }],
        { signal: c.signal },
      );
      const event = events[0];
      return event ? parsePublicProfile(event.content) : { bio: "", picture: "" };
    },
  });
}
