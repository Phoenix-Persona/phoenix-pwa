import type { QueryClient } from "@tanstack/react-query";

import { clearEncryptedAppDataDecryptCache } from "@/hooks/useEncryptedAppData";
import {
  clearPersistedNostrLogin,
  clearSessionUnlocked,
  clearUserNcryptsec,
} from "@/lib/nip49Storage";
import { clearLegacyPpqAccountStorage } from "@/lib/ppq/storage";
import { queryKeys } from "@/lib/queryKeys";
import { clearAllVideoChains } from "@/lib/video/chainStore";

export function clearOperatorLegacyStorage(): void {
  clearLegacyPpqAccountStorage();
}

export async function clearOperatorRuntimeState(
  queryClient?: QueryClient,
  previousPubkey?: string,
): Promise<void> {
  clearLegacyPpqAccountStorage();
  queryClient?.removeQueries({ queryKey: queryKeys.ppq.all() });
  queryClient?.removeQueries({ queryKey: queryKeys.wallet.allDetails() });
  queryClient?.removeQueries({ queryKey: queryKeys.wallet.allPayments() });
  queryClient?.removeQueries({ queryKey: queryKeys.persona.allMine() });
  queryClient?.removeQueries({ queryKey: queryKeys.persona.allDetails() });
  queryClient?.removeQueries({ queryKey: queryKeys.encryptedAppData.all() });
  queryClient?.removeQueries({
    queryKey: previousPubkey
      ? queryKeys.operator.envelope(previousPubkey)
      : queryKeys.operator.all(),
    exact: Boolean(previousPubkey),
  });
  clearEncryptedAppDataDecryptCache();
  await clearAllVideoChains();
}

export async function clearOperatorSessionState(
  queryClient?: QueryClient,
  previousPubkey?: string,
): Promise<void> {
  clearSessionUnlocked();
  clearPersistedNostrLogin();
  await clearOperatorRuntimeState(queryClient, previousPubkey);
}

export async function clearOperatorDeviceSecrets(
  queryClient?: QueryClient,
  previousPubkey?: string,
): Promise<void> {
  clearUserNcryptsec();
  await clearOperatorSessionState(queryClient, previousPubkey);
}
