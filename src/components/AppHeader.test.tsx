import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import {
  beforeEach,
  describe,
  expect,
  it,
  mockFn,
  hoisted,
  mockModule,
} from "@/test/api";

import { AppHeader } from "./AppHeader";

const mocks = hoisted(() => ({
  currentUser: { user: { pubkey: "operator-pubkey" } },
  operatorWallet: {
    seed: "operator seed",
    wallet: {
      handle: {},
      isConnecting: false,
      isInfoLoading: false,
      info: { balanceSats: 12345, raw: {} },
      ppqBalanceUsd: 4.25,
    },
    operator: {
      isLoading: false,
      isMinting: false,
      mint: mockFn(),
      mintError: undefined,
      event: undefined,
      envelope: undefined,
    },
  },
}));

mockModule("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => mocks.currentUser,
}));

mockModule("@/hooks/useOperatorWallet", () => ({
  useOperatorWallet: () => mocks.operatorWallet,
}));

mockModule("@/hooks/useToast", () => ({
  useToast: () => ({ toast: mockFn() }),
}));

mockModule("@/components/auth/LoginArea", () => ({
  LoginArea: () => <button type="button">Profile menu</button>,
}));

describe("AppHeader", () => {
  beforeEach(() => {
    mocks.currentUser.user = { pubkey: "operator-pubkey" };
  });

  it("removes the redundant mobile burger menu", () => {
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("button", { name: /open menu/i })).not.toBeInTheDocument();
  });

  it("shows operator sats and AI credit balance in the wallet badge", () => {
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: /12,345 sats/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\$4.25 ai/i })).toBeInTheDocument();
  });
});
