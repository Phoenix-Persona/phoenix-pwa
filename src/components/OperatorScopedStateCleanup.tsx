import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  clearOperatorLegacyStorage,
  clearOperatorRuntimeState,
} from "@/lib/operatorSessionState";

export function OperatorScopedStateCleanup() {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const previousPubkey = useRef<string | undefined>(undefined);
  const pubkey = user?.pubkey;

  useEffect(() => {
    clearOperatorLegacyStorage();

    const previous = previousPubkey.current;
    if (previous && previous !== pubkey) {
      void clearOperatorRuntimeState(qc, previous);
    }

    previousPubkey.current = pubkey;
  }, [pubkey, qc]);

  return null;
}
