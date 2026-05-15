import type { QueryClient } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import type { NostrEvent } from "@nostrify/nostrify";
import type { NLoginType } from "@nostrify/react/login";
import type { ReactElement, ReactNode } from "react";
import { WebSocket } from "ws";

import { stubEnv, unstubAllEnvs } from "@/test/api";
import { TestApp } from "@/test/TestApp";
import { TestHttpServer } from "../http/TestHttpServer";
import { TestRelay } from "../relay/TestRelay";

let harnessId = 0;

export interface ServicesHarness {
  relay: TestRelay;
  relayUrl: string;
  http: TestHttpServer | undefined;
  httpUrl: string | undefined;
  wrapper: ({ children }: { children: ReactNode }) => ReactElement;
  cleanup: () => Promise<void>;
}

export interface ServicesHarnessArgs {
  events?: NostrEvent[];
  logins?: NLoginType[];
  initialRoute?: string;
  queryClient?: QueryClient;
  withHttp?: boolean;
  stubPpqBaseUrl?: boolean;
}

export async function createServicesHarness(
  args: ServicesHarnessArgs = {},
): Promise<ServicesHarness> {
  installTestWebSocket();
  const relay = await TestRelay.start();
  relay.seed(args.events ?? []);
  const http = args.withHttp ? await TestHttpServer.start() : undefined;
  if (http && args.stubPpqBaseUrl !== false) {
    stubEnv("VITE_PPQ_BASE_URL", http.url);
  }

  const keySuffix = nextHarnessKey();
  const appStorageKey = `test-app-config:services:${keySuffix}`;
  const loginStorageKey = `test-login:services:${keySuffix}`;

  const wrapper = ({ children }: { children: ReactNode }) => (
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
  );

  return {
    relay,
    relayUrl: relay.url,
    http,
    httpUrl: http?.url,
    wrapper,
    cleanup: async () => {
      await http?.close();
      await relay.close();
      unstubAllEnvs();
    },
  };
}

export async function renderWithServices(
  ui: ReactElement,
  args: ServicesHarnessArgs = {},
): Promise<ServicesHarness & { renderResult: RenderResult }> {
  const harness = await createServicesHarness(args);
  const renderResult = render(ui, { wrapper: harness.wrapper });
  return {
    ...harness,
    renderResult,
    cleanup: async () => {
      renderResult.unmount();
      await harness.cleanup();
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
