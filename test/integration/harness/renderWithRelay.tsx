import type { ReactElement, ReactNode } from "react";
import { render, type RenderResult } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import type { NostrEvent } from "@nostrify/nostrify";
import type { NLoginType } from "@nostrify/react/login";
import { WebSocket } from "ws";

import { TestApp } from "@/test/TestApp";
import { TestRelay } from "../relay/TestRelay";

let harnessId = 0;

export type RelayHarness = {
  relay: TestRelay;
  relayUrl: string;
  wrapper: ({ children }: { children: ReactNode }) => ReactElement;
  cleanup: () => Promise<void>;
};

export async function createRelayHarness(args: {
  events?: NostrEvent[];
  logins?: NLoginType[];
  queryClient?: QueryClient;
} = {}): Promise<RelayHarness> {
  installTestWebSocket();
  const relay = await TestRelay.start();
  relay.seed(args.events ?? []);
  const keySuffix = nextHarnessKey();
  const appStorageKey = `test-app-config:integration:${keySuffix}`;
  const loginStorageKey = `test-login:integration:${keySuffix}`;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestApp
      relayUrls={[relay.url]}
      initialLogins={args.logins}
      queryClient={args.queryClient}
      appStorageKey={appStorageKey}
      loginStorageKey={loginStorageKey}
    >
      {children}
    </TestApp>
  );

  return {
    relay,
    relayUrl: relay.url,
    wrapper,
    cleanup: () => relay.close(),
  };
}

export async function renderWithRelay(
  ui: ReactElement,
  args: {
    events?: NostrEvent[];
    logins?: NLoginType[];
    initialRoute?: string;
    queryClient?: QueryClient;
  } = {},
): Promise<RelayHarness & { renderResult: RenderResult }> {
  installTestWebSocket();
  const relay = await TestRelay.start();
  relay.seed(args.events ?? []);
  const keySuffix = nextHarnessKey();
  const appStorageKey = `test-app-config:integration:${keySuffix}`;
  const loginStorageKey = `test-login:integration:${keySuffix}`;

  const renderResult = render(
    <TestApp
      relayUrls={[relay.url]}
      initialLogins={args.logins}
      initialRoute={args.initialRoute}
      queryClient={args.queryClient}
      appStorageKey={appStorageKey}
      loginStorageKey={loginStorageKey}
    >
      {ui}
    </TestApp>,
  );

  return {
    relay,
    relayUrl: relay.url,
    wrapper: ({ children }) => (
      <TestApp
        relayUrls={[relay.url]}
        initialLogins={args.logins}
        initialRoute={args.initialRoute}
        queryClient={args.queryClient}
        appStorageKey={appStorageKey}
        loginStorageKey={loginStorageKey}
      >
        {children}
      </TestApp>
    ),
    renderResult,
    cleanup: async () => {
      renderResult.unmount();
      await relay.close();
    },
  };
}

function installTestWebSocket(): void {
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    writable: true,
    value: WebSocket,
  });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      writable: true,
      value: WebSocket,
    });
  }
}

function nextHarnessKey(): string {
  harnessId += 1;
  return `${Date.now()}:${harnessId}:${Math.random().toString(36).slice(2)}`;
}
