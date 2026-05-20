import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  beforeEach,
  describe,
  expect,
  it,
  mockFn,
  hoisted,
  mockModule,
} from "@/test/api";
import type { UseWalletOptions, UseWalletResult } from "@/hooks/useWallet";
import type { UsePersonaPpqAccountOptionsArgs } from "@/hooks/usePersonaPpqAccountOptions";
import type { PpqAccountOptions } from "@/hooks/usePpqAccount";

import Dashboard from "./Dashboard";

const mocks = hoisted(() => {
  const ppqAccountOptions = {
    scope: "persona" as const,
    ownerKey: "persona-pubkey",
    account: { api_key: "api-persona", credit_id: "credit-persona" },
    isLoading: false,
  };
  return {
    ppqAccountOptions,
    useWallet: mockFn(),
    usePersonaComposer: mockFn(),
    usePersonaPpqAccountOptions: mockFn<
      (args: UsePersonaPpqAccountOptionsArgs) => PpqAccountOptions
    >(() => ppqAccountOptions),
    dashboardComposerProps: undefined as
      | { ppqAccountOptions?: unknown; walletSeed?: string }
      | undefined,
    videoComposerProps: undefined as { ppqAccountOptions?: unknown } | undefined,
    postWizardProps: undefined as { ppqAccountOptions?: unknown } | undefined,
    walletDialogProps: undefined as { wallet?: unknown } | undefined,
    personaEvent: {
      id: "persona-event",
      kind: 30078,
      pubkey: "operator-pubkey",
      created_at: 1_700_000_000,
      tags: [["d", "persona-fixture"]],
      content: "ciphertext",
      sig: "sig",
    },
    envelope: {
      app: "phoenix-persona" as const,
      version: 1 as const,
      persona: {
        pubkey: "persona-pubkey",
        nsec: "nsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
        dTag: "persona-fixture",
        name: "Amina Voice",
        system_prompt: "Speak clearly.",
        created_at: 1_700_000_000,
      },
      wallet: {
        kind: "spark" as const,
        seed: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
      },
      ppq: { api_key: "api-persona", credit_id: "credit-persona" },
    },
  };
});

mockModule("@/components/AppHeader", () => ({
  AppHeader: () => <header />,
}));

mockModule("@/components/ImigongoBand", () => ({
  FlagStripe: () => <div />,
  ImigongoSeal: () => <div />,
}));

mockModule("@/components/PersonaActionsMenu", () => ({
  PersonaActionsMenu: () => <div data-testid="persona-actions" />,
}));

mockModule("@/components/persona/PersonaHero", () => ({
  PersonaHero: ({ name, actions }: { name: string; actions?: ReactNode }) => (
    <section>
      <h1>{name}</h1>
      {actions}
    </section>
  ),
}));

mockModule("@/components/persona/DashboardComposerCard", () => ({
  DashboardComposerCard: (props: {
    ppqAccountOptions?: unknown;
    walletSeed?: string;
  }) => {
    mocks.dashboardComposerProps = props;
    return <div data-testid="dashboard-composer" />;
  },
}));

mockModule("@/components/persona/PostWizardDialog", () => ({
  PostWizardDialog: (props: { ppqAccountOptions?: unknown }) => {
    mocks.postWizardProps = props;
    return <div data-testid="post-wizard" />;
  },
}));

mockModule("@/components/VideoComposerDialog", () => ({
  VideoComposerDialog: (props: { ppqAccountOptions?: unknown }) => {
    mocks.videoComposerProps = props;
    return <div data-testid="video-composer" />;
  },
}));

mockModule("@/components/wallet/WalletBadge", () => ({
  WalletBadge: () => <button type="button">Wallet</button>,
}));

mockModule("@/components/wallet/WalletDialog", () => ({
  WalletDialog: (props: { wallet?: unknown }) => {
    mocks.walletDialogProps = props;
    return <div data-testid="wallet-dialog" />;
  },
}));

mockModule("@/components/PostCard", () => ({
  PostCard: () => <article />,
}));

mockModule("@/components/Skeletons", () => ({
  PostListSkeleton: () => <div />,
}));

mockModule("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    user: { pubkey: "operator-pubkey", signer: { signEvent: mockFn() } },
  }),
}));

mockModule("@/hooks/useToast", () => ({
  useToast: () => ({ toast: mockFn() }),
}));

mockModule("@/hooks/usePageMeta", () => ({
  usePageMeta: () => undefined,
}));

mockModule("@/hooks/useAuthor", () => ({
  useAuthor: () => ({
    data: { metadata: { about: "Public bio", picture: "" } },
  }),
}));

mockModule("@/hooks/usePersona", () => ({
  usePersona: () => ({
    data: { event: mocks.personaEvent, envelope: mocks.envelope },
    isLoading: false,
    isError: false,
    error: undefined,
    refetch: mockFn().mockResolvedValue({
      data: { event: mocks.personaEvent, envelope: mocks.envelope },
    }),
  }),
  usePersonaPosts: () => ({
    data: [],
    isLoading: false,
    refetch: mockFn(),
  }),
}));

mockModule("@/hooks/usePersonaPpqAccountOptions", () => ({
  usePersonaPpqAccountOptions: (args: UsePersonaPpqAccountOptionsArgs) =>
    mocks.usePersonaPpqAccountOptions(args),
}));

mockModule("@/hooks/useOperatorWallet", () => ({
  useOperatorWallet: () => ({
    seed: "operator seed",
    wallet: {
      handle: {},
      refreshInfo: mockFn(),
      refreshPayments: mockFn(),
      isConnecting: false,
    },
  }),
}));

mockModule("@/hooks/useWallet", () => ({
  useWallet: (opts: UseWalletOptions) => mocks.useWallet(opts),
}));

mockModule("@/hooks/usePersonaComposer", () => ({
  usePersonaComposer: (opts: { ppqAccountOptions?: unknown }) =>
    mocks.usePersonaComposer(opts),
}));

mockModule("@/hooks/useUpdateWalletAutoTopup", () => ({
  useUpdateWalletAutoTopup: () => ({ mutateAsync: mockFn() }),
}));

function makeWallet(): UseWalletResult {
  return {
    handle: {} as UseWalletResult["handle"],
    isConnecting: false,
    connectError: undefined,
    info: { balanceSats: 1, raw: {} } as UseWalletResult["info"],
    isInfoLoading: false,
    infoError: undefined,
    refreshInfo: mockFn(),
    payments: [],
    refreshPayments: mockFn(),
    receive: mockFn(),
    isReceiving: false,
    receiveError: undefined,
    send: mockFn(),
    isSending: false,
    sendError: undefined,
    ppqBalanceUsd: 1,
    ppqAccount: { api_key: "api-persona", credit_id: "credit-persona" },
    rotatePpqAccount: mockFn(),
    isPpqRotating: false,
    ppqRotateError: undefined,
    isPpqBalanceLoading: false,
    refreshPpqBalance: mockFn(),
    ppqQueryHistory: [],
    isPpqQueryHistoryLoading: false,
    ppqQueryHistoryError: undefined,
    refreshPpqQueryHistory: mockFn(),
    autoTopup: {
      enabled: false,
      thresholdUsd: 5,
      topupAmountUsd: 5,
      fundingSource: "persona",
    },
    setAutoTopup: mockFn(),
    autoTopupRun: { isRunning: false },
    triggerAutoTopup: mockFn(),
    fundingSources: [{ source: "persona", label: "Persona", isAvailable: true }],
    manualTopup: mockFn(),
    isManualTopupRunning: false,
    manualTopupError: undefined,
    manualTopupResult: undefined,
  };
}

function renderDashboard() {
  render(
    <MemoryRouter initialEntries={["/dashboard/npub1persona"]}>
      <Routes>
        <Route path="/dashboard/:npub" element={<Dashboard />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Dashboard", () => {
  beforeEach(() => {
    mocks.dashboardComposerProps = undefined;
    mocks.videoComposerProps = undefined;
    mocks.postWizardProps = undefined;
    mocks.walletDialogProps = undefined;
    mocks.useWallet.mockReset().mockReturnValue(makeWallet());
    mocks.usePersonaComposer.mockReset().mockReturnValue({
      styleInVoice: mockFn(),
      publishTextOnly: mockFn(),
      isStyling: false,
      isPublishing: false,
    });
    mocks.usePersonaPpqAccountOptions.mockReset().mockReturnValue(
      mocks.ppqAccountOptions,
    );
  });

  it("threads persona-scoped PPQ options into dashboard wallet and AI surfaces", () => {
    renderDashboard();

    expect(screen.getByTestId("dashboard-composer")).toBeInTheDocument();
    expect(mocks.usePersonaPpqAccountOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        npub: "npub1persona",
        backupEvent: mocks.personaEvent,
        envelope: mocks.envelope,
      }),
    );
    expect(mocks.useWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        ppqAccountOptions: mocks.ppqAccountOptions,
      }),
    );
    expect(mocks.usePersonaComposer).toHaveBeenCalledWith(
      expect.objectContaining({
        ppqAccountOptions: mocks.ppqAccountOptions,
      }),
    );
    expect(mocks.dashboardComposerProps?.ppqAccountOptions).toBe(
      mocks.ppqAccountOptions,
    );
    expect(mocks.postWizardProps?.ppqAccountOptions).toBe(
      mocks.ppqAccountOptions,
    );
    expect(mocks.videoComposerProps?.ppqAccountOptions).toBe(
      mocks.ppqAccountOptions,
    );
  });
});
