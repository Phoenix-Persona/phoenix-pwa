import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, mockFn, hoisted, mockModule } from "@/test/api";

import { queryKeys } from "@/lib/queryKeys";
import { OperatorScopedStateCleanup } from "./OperatorScopedStateCleanup";

const mocks = hoisted(() => ({
  currentUser: {
    user: { pubkey: "operator-old" } as { pubkey: string } | undefined,
  },
  clearEncryptedAppDataDecryptCache: mockFn(),
}));

mockModule("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => mocks.currentUser,
}));

mockModule("@/hooks/useEncryptedAppData", () => ({
  clearEncryptedAppDataDecryptCache: mocks.clearEncryptedAppDataDecryptCache,
}));

function renderWithClient(client: QueryClient) {
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  return render(<OperatorScopedStateCleanup />, { wrapper: Wrapper });
}

describe("OperatorScopedStateCleanup", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.currentUser.user = { pubkey: "operator-old" };
    mocks.clearEncryptedAppDataDecryptCache.mockClear();
  });

  it("hard-clears the legacy global PPQ account cache on mount", async () => {
    const client = new QueryClient();
    window.localStorage.setItem(
      "phoenix:ppq:account",
      JSON.stringify({ api_key: "api-old", credit_id: "credit-old" }),
    );

    renderWithClient(client);

    await waitFor(() =>
      expect(window.localStorage.getItem("phoenix:ppq:account")).toBeNull(),
    );
  });

  it("removes operator-scoped caches when the active operator changes", async () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.ppq.account("operator-old"), {
      api_key: "api-old",
      credit_id: "credit-old",
    });
    client.setQueryData(queryKeys.wallet.detail("operator:operator-old"), {
      balanceSats: 10,
    });
    client.setQueryData(queryKeys.wallet.payments("operator:operator-old"), []);
    client.setQueryData(queryKeys.encryptedAppData.events("operator-old"), []);

    const view = renderWithClient(client);
    mocks.currentUser.user = { pubkey: "operator-new" };
    view.rerender(<OperatorScopedStateCleanup />);

    await waitFor(() =>
      expect(client.getQueryData(queryKeys.ppq.account("operator-old"))).toBeUndefined(),
    );
    expect(
      client.getQueryData(queryKeys.wallet.detail("operator:operator-old")),
    ).toBeUndefined();
    expect(
      client.getQueryData(queryKeys.wallet.payments("operator:operator-old")),
    ).toBeUndefined();
    expect(
      client.getQueryData(queryKeys.encryptedAppData.events("operator-old")),
    ).toBeUndefined();
    expect(mocks.clearEncryptedAppDataDecryptCache).toHaveBeenCalledTimes(1);
  });
});
