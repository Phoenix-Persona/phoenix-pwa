import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import {
  NostrLoginProvider,
  type NLoginStorage,
  type NLoginType,
} from "@nostrify/react/login";
import { useMemo } from "react";
import NostrProvider from "@/components/NostrProvider";
import { AppProvider } from "@/components/AppProvider";
import type { AppConfig } from "@/contexts/AppContext";
import { createMemoryNostrLoginStorage } from "@/lib/nostrLoginStorage";

interface TestAppProps {
  children: React.ReactNode;
  initialRoute?: string;
  relayUrls?: string[];
  blossomServers?: string[];
  defaultConfig?: AppConfig;
  initialLogins?: NLoginType[];
  loginStorage?: NLoginStorage;
  loginStorageKey?: string;
  appStorageKey?: string;
  queryClient?: QueryClient;
}

export function TestApp({
  children,
  initialRoute,
  relayUrls,
  blossomServers,
  defaultConfig,
  initialLogins,
  loginStorage,
  loginStorageKey = "test-login",
  appStorageKey = "test-app-config",
  queryClient: providedQueryClient,
}: TestAppProps) {
  const resolvedLoginStorage = useMemo(() => {
    const storage = loginStorage ?? createMemoryNostrLoginStorage();
    if (initialLogins) {
      storage.setItem(loginStorageKey, JSON.stringify(initialLogins));
    }
    return storage;
  }, [initialLogins, loginStorage, loginStorageKey]);

  const queryClient = useMemo(
    () =>
      providedQueryClient ??
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      }),
    [providedQueryClient],
  );

  const resolvedConfig: AppConfig = defaultConfig ?? {
    theme: "light",
    relayMetadata: {
      relays: (relayUrls ?? ["wss://relay.primal.net"]).map((url) => ({
        url,
        read: true,
        write: true,
      })),
      updatedAt: 0,
    },
    blossomServerMetadata: {
      servers: blossomServers ?? ["https://blossom.primal.net/"],
      updatedAt: 0,
    },
    useAppBlossomServers: true,
  };

  const routedChildren = initialRoute ? (
    <MemoryRouter initialEntries={[initialRoute]}>{children}</MemoryRouter>
  ) : (
    <BrowserRouter>{children}</BrowserRouter>
  );

  return (
    <AppProvider storageKey={appStorageKey} defaultConfig={resolvedConfig}>
      <QueryClientProvider client={queryClient}>
        <NostrLoginProvider
          storageKey={loginStorageKey}
          storage={resolvedLoginStorage}
        >
          <NostrProvider>{routedChildren}</NostrProvider>
        </NostrLoginProvider>
      </QueryClientProvider>
    </AppProvider>
  );
}

export default TestApp;
