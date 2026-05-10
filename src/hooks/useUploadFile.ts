import { useMutation } from "@tanstack/react-query";
import type { NostrSigner } from "@nostrify/types";

import { useCurrentUser } from "./useCurrentUser";
import { useAppContext } from "./useAppContext";
import { APP_BLOSSOM_SERVERS, getEffectiveBlossomServers } from "@/lib/appBlossom";
import { uploadFileToBlossom } from "@/lib/blossomUpload";

export interface UseUploadFileOptions {
  /**
   * Override the signer that authorizes the BUD-01 upload event.
   *
   * **Privacy-critical.** When a persona's media is being uploaded, this MUST
   * be the persona's `NSecSigner` — otherwise the operator's pubkey appears
   * on the kind 24242 auth event and any party with access to that event
   * (the Blossom server, network observers) can correlate operator ↔ persona.
   *
   * When unset, the logged-in user (operator) signs.
   */
  signer?: NostrSigner;

  /**
   * Override the Blossom server list. When set, this list is used verbatim
   * (no merge with the operator's NIP-65 servers).
   *
   * Pass this alongside `signer` for persona uploads. Without it, the upload
   * still works but the *server list* is the operator's effective list,
   * which is itself a soft correlation surface (servers the operator
   * routinely talks to).
   *
   * If left unset on a persona upload (`signer` provided, `blossomServers`
   * not), the upload falls back to `APP_BLOSSOM_SERVERS` — the hardcoded
   * project defaults — so the persona never inherits the operator's
   * server preferences.
   */
  blossomServers?: string[];
}

export function useUploadFile(options: UseUploadFileOptions = {}) {
  const { user } = useCurrentUser();
  const { config } = useAppContext();

  return useMutation({
    mutationFn: async (file: File) => {
      const signer = options.signer ?? user?.signer;
      if (!signer) {
        throw new Error("Must be logged in or supply a signer to upload files");
      }

      const servers = (() => {
        if (options.blossomServers && options.blossomServers.length > 0) {
          return options.blossomServers;
        }
        // Persona-keypair upload (signer override) without an explicit
        // server list → use APP defaults only, NOT the operator's
        // effective list, to avoid inheriting the operator's server
        // preferences as a correlation surface.
        if (options.signer) {
          return [...APP_BLOSSOM_SERVERS.servers];
        }
        return getEffectiveBlossomServers(
          config.blossomServerMetadata,
          config.useAppBlossomServers,
        );
      })();

      if (servers.length === 0) {
        throw new Error("No Blossom servers configured");
      }

      return uploadFileToBlossom({
        file,
        signer,
        blossomServers: servers,
      });
    },
  });
}
