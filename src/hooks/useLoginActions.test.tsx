import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NostrLoginProvider, useNostrLogin } from "@nostrify/react/login";
import { nip19 } from "nostr-tools";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import type { PropsWithChildren } from "react";
import {
  beforeEach,
  describe,
  expect,
  it,
  mockFn,
  hoisted,
  mockModule,
} from "@/test/api";

import { AppProvider } from "@/components/AppProvider";
import type { AppConfig } from "@/contexts/AppContext";
import { createMemoryNostrLoginStorage } from "@/lib/nostrLoginStorage";

import { useLoginActions } from "./useLoginActions";

const mocks = hoisted(() => ({
  clearOperatorSessionState: mockFn(async () => undefined),
}));

mockModule("@nostrify/react", () => ({
  useNostr: () => ({ nostr: {} }),
}));

mockModule("@/lib/operatorSessionState", () => ({
  clearOperatorSessionState: mocks.clearOperatorSessionState,
}));

const FIRST_SECRET = generateSecretKey();
const FIRST_NSEC = nip19.nsecEncode(FIRST_SECRET);
const FIRST_PUBKEY = getPublicKey(FIRST_SECRET);
const SECOND_SECRET = generateSecretKey();
const SECOND_NSEC = nip19.nsecEncode(SECOND_SECRET);
const SECOND_PUBKEY = getPublicKey(SECOND_SECRET);

function wrapper({ children }: PropsWithChildren) {
  const config: AppConfig = {
    theme: "light",
    relayMetadata: {
      relays: [{ url: "wss://relay.example", read: true, write: true }],
      updatedAt: 0,
    },
    blossomServerMetadata: { servers: [], updatedAt: 0 },
    useAppBlossomServers: false,
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return (
    <AppProvider storageKey="test-app" defaultConfig={config}>
      <QueryClientProvider client={queryClient}>
        <NostrLoginProvider
          storageKey="test-login"
          storage={createMemoryNostrLoginStorage()}
        >
          {children}
        </NostrLoginProvider>
      </QueryClientProvider>
    </AppProvider>
  );
}

function LoginProbe() {
  const login = useLoginActions();
  const { logins } = useNostrLogin();
  return (
    <>
      <button type="button" onClick={() => void login.nsec(FIRST_NSEC)}>
        Log in first
      </button>
      <button type="button" onClick={() => void login.nsec(SECOND_NSEC)}>
        Log in second
      </button>
      <button type="button" onClick={() => void login.logout()}>
        Log out
      </button>
      <output data-testid="login-count">{logins.length}</output>
      <output data-testid="active-pubkey">{logins[0]?.pubkey ?? "none"}</output>
    </>
  );
}

describe("useLoginActions", () => {
  beforeEach(() => {
    mocks.clearOperatorSessionState.mockReset().mockResolvedValue(undefined);
  });

  it("keeps only one active login and clears prior operator runtime state on replacement", async () => {
    render(<LoginProbe />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Log in first" }));
    await waitFor(() => expect(screen.getByTestId("login-count").textContent).toBe("1"));
    expect(screen.getByTestId("active-pubkey").textContent).toBe(FIRST_PUBKEY);

    fireEvent.click(screen.getByRole("button", { name: "Log in second" }));
    await waitFor(() =>
      expect(screen.getByTestId("active-pubkey").textContent).toBe(SECOND_PUBKEY),
    );
    expect(screen.getByTestId("login-count").textContent).toBe("1");
    expect(mocks.clearOperatorSessionState).toHaveBeenCalledWith(
      expect.anything(),
      FIRST_PUBKEY,
    );
  });

  it("logs out the active account without deleting the stored local account backup", async () => {
    render(<LoginProbe />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Log in first" }));
    await waitFor(() => expect(screen.getByTestId("login-count").textContent).toBe("1"));

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => expect(screen.getByTestId("login-count").textContent).toBe("0"));
    expect(screen.getByTestId("active-pubkey").textContent).toBe("none");
    expect(mocks.clearOperatorSessionState).toHaveBeenCalledWith(
      expect.anything(),
      FIRST_PUBKEY,
    );
  });
});
