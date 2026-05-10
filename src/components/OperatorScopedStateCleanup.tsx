import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { clearLegacyPpqAccountStorage } from "@/lib/ppq/storage";
import { queryKeys } from "@/lib/queryKeys";

export function OperatorScopedStateCleanup() {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const previousPubkey = useRef<string | undefined>(undefined);
  const pubkey = user?.pubkey;

  useEffect(() => {
    clearLegacyPpqAccountStorage();

    const previous = previousPubkey.current;
    if (previous && previous !== pubkey) {
      qc.removeQueries({ queryKey: queryKeys.ppq.all() });
      qc.removeQueries({ queryKey: queryKeys.wallet.allDetails() });
      qc.removeQueries({ queryKey: queryKeys.wallet.allPayments() });
      qc.removeQueries({
        queryKey: queryKeys.operator.envelope(previous),
        exact: true,
      });
      qc.removeQueries({ queryKey: queryKeys.persona.allMine() });
      qc.removeQueries({ queryKey: queryKeys.persona.allDetails() });
    }

    previousPubkey.current = pubkey;
  }, [pubkey, qc]);

  return null;
}
