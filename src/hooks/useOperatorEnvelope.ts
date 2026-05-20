/**
 * Hook for fetching + mutating the operator's encrypted envelope.
 *
 * Mirrors the usePersona pattern: query kind 30078 events authored by
 * the current user, attempt NIP-44 decryption on each, return the first
 * one whose plaintext is a valid `OperatorEnvelope`. One per user.
 *
 * Mutations:
 *   - `mint(input?)` — generate a fresh wallet seed (or pass overrides)
 *     and publish a brand-new operator envelope. Used at first login.
 *   - `update(input)` — re-encrypt + republish. Used to add or rotate
 *     the embedded PPQ account, swap wallet seed, etc.
 *   - `ensureWithPpq(ppq)` — convenience: if no envelope exists, mint
 *     with this PPQ account; if one exists, update it to carry this
 *     PPQ account. Idempotent — returns immediately if the existing
 *     envelope already carries the same api_key.
 *
 * No localStorage cache — Nostr is the source of truth and react-query
 * caches per-user-pubkey across the session.
 */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";
import type { NostrEvent } from "@nostrify/nostrify";

import {
  buildOperatorEventTemplate,
  encryptOperatorEnvelope,
  generateOperatorDTag,
  PHOENIX_OPERATOR_APP,
  PHOENIX_OPERATOR_VERSION,
  type OperatorEnvelope,
  type OperatorEnvelopeInput,
  type OperatorPpqAccount,
} from "@/lib/operator";
import type { Nip44Signer } from "@/lib/personaCrypto";
import { publishWithTimeout } from "@/lib/nostrPublish";
import { queryKeys } from "@/lib/queryKeys";
import { generateMnemonic } from "@/lib/wallet/client";
import {
  DEFAULT_AUTO_TOPUP_CONFIG,
  autoTopupConfigToPersisted,
  type AutoTopupConfig,
} from "@/lib/wallet/types";
import type { PersonaWallet } from "@/lib/persona";
import {
  classifyEncryptedAppDataEvent,
  operatorEncryptedAppDataQuery,
  upsertEncryptedAppDataEvent,
} from "./useEncryptedAppData";

import { useCurrentUser } from "./useCurrentUser";

interface OperatorEnvelopeState {
  event: NostrEvent;
  envelope: OperatorEnvelope;
}

function eventDTag(event: NostrEvent | undefined): string | undefined {
  return event?.tags.find(([name]) => name === "d")?.[1];
}

async function findOperatorEnvelope(
  events: NostrEvent[],
  userPubkey: string,
  signer: Nip44Signer,
): Promise<OperatorEnvelopeState | null> {
  for (const ev of events) {
    const classified = await classifyEncryptedAppDataEvent(
      ev,
      userPubkey,
      signer,
    );
    if (classified.type === "operator") {
      return { event: ev, envelope: classified.envelope };
    }
  }
  return null;
}

/** Default wallet at mint time: fresh seed + DEFAULT_AUTO_TOPUP_CONFIG. */
async function buildFreshWallet(): Promise<PersonaWallet> {
  const seed = await generateMnemonic();
  const cfg: AutoTopupConfig = DEFAULT_AUTO_TOPUP_CONFIG;
  return {
    kind: "spark",
    seed,
    auto_topup: autoTopupConfigToPersisted(cfg),
  };
}

export function useOperatorEnvelope() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.operator.envelope(user?.pubkey),
    enabled: Boolean(user),
    queryFn: async (c): Promise<OperatorEnvelopeState | null> => {
      if (!user) return null;
      const events = await qc.fetchQuery(
        operatorEncryptedAppDataQuery(nostr, user.pubkey),
      );
      if (c.signal.aborted) return null;
      const signer = user.signer as unknown as Nip44Signer;
      return findOperatorEnvelope(events, user.pubkey, signer);
    },
  });

  async function publish(input: OperatorEnvelopeInput): Promise<OperatorEnvelopeState> {
    if (!user) throw new Error("Not logged in");
    const signer = user.signer as unknown as Nip44Signer;
    const current = qc.getQueryData<OperatorEnvelopeState | null>(
      queryKeys.operator.envelope(user?.pubkey),
    );
    const dTag =
      input.dTag ??
      current?.envelope.dTag ??
      eventDTag(current?.event) ??
      generateOperatorDTag();
    const ciphertext = await encryptOperatorEnvelope(
      { ...input, dTag },
      user.pubkey,
      signer,
    );
    const template = buildOperatorEventTemplate({
      dTag,
      encryptedContent: ciphertext,
    });
    const signed = await user.signer.signEvent(template);
    await publishWithTimeout(nostr, signed);

    const envelope: OperatorEnvelope = {
      app: PHOENIX_OPERATOR_APP,
      version: PHOENIX_OPERATOR_VERSION,
      dTag,
      wallet: input.wallet,
      ppq: input.ppq,
      created_at: signed.created_at,
    };
    return { event: signed, envelope };
  }

  const mintMutation = useMutation<
    OperatorEnvelopeState,
    Error,
    OperatorEnvelopeInput | undefined
  >({
    mutationFn: async (overrides) => {
      const current = qc.getQueryData<OperatorEnvelopeState | null>(
        queryKeys.operator.envelope(user?.pubkey),
      );
      const wallet =
        overrides?.wallet ??
        current?.envelope.wallet ??
        (await buildFreshWallet());
      const ppq = overrides?.ppq ?? current?.envelope.ppq;
      return publish({ wallet, ppq });
    },
    onSuccess: (state) => {
      qc.setQueryData(queryKeys.operator.envelope(user?.pubkey), state);
      qc.setQueryData(
        queryKeys.encryptedAppData.events(user?.pubkey),
        (current: NostrEvent[] | undefined) =>
          upsertEncryptedAppDataEvent(current, state.event),
      );
    },
  });

  const updateMutation = useMutation<
    OperatorEnvelopeState,
    Error,
    OperatorEnvelopeInput
  >({
    mutationFn: async (next) => publish(next),
    onSuccess: (state) => {
      qc.setQueryData(queryKeys.operator.envelope(user?.pubkey), state);
      qc.setQueryData(
        queryKeys.encryptedAppData.events(user?.pubkey),
        (current: NostrEvent[] | undefined) =>
          upsertEncryptedAppDataEvent(current, state.event),
      );
    },
  });

  /**
   * Ensure the operator envelope carries the given PPQ account.
   * Mints if missing; updates if existing carries a different
   * account; no-ops if it already matches. Returns the resulting
   * envelope.
   */
  const ensureWithPpq = useCallback(
    async (ppq: OperatorPpqAccount): Promise<OperatorEnvelope> => {
      const current = qc.getQueryData<OperatorEnvelopeState | null>(
        queryKeys.operator.envelope(user?.pubkey),
      );
      if (current?.envelope.ppq?.api_key === ppq.api_key) {
        return current.envelope;
      }
      const result = current
        ? await updateMutation.mutateAsync({
            wallet: current.envelope.wallet,
            ppq,
          })
        : await mintMutation.mutateAsync({ ppq });
      return result.envelope;
    },
    [user?.pubkey, qc, mintMutation, updateMutation],
  );

  return {
    envelope: query.data?.envelope,
    event: query.data?.event,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    mint: mintMutation.mutateAsync,
    isMinting: mintMutation.isPending,
    /**
     * Last error from a mint attempt (auto or manual). Stays set until
     * a fresh `mint()` call clears it. Surfaced by `<AppHeader>` so
     * the user can see when an auto-mint silently failed.
     */
    mintError: mintMutation.error ?? undefined,
    update: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    ensureWithPpq,
  };
}
