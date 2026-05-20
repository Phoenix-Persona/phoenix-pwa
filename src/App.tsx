// NOTE: This file should normally not be modified unless you are adding a new provider.
// To add new routes, edit the AppRouter.tsx file.

import { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NostrProvider from "@/components/NostrProvider";
import { NostrSync } from "@/components/NostrSync";
import { AppToaster } from "@/components/AppToaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NostrLoginProvider } from "@nostrify/react/login";
import { AppProvider } from "@/components/AppProvider";
import type { AppConfig } from "@/contexts/AppContext";
import { APP_RELAYS } from "@/lib/appRelays";
import { InstallBanner } from "@/components/InstallBanner";
import { DevAutoLogin } from "@/components/DevAutoLogin";
import { OperatorWalletInit } from "@/components/OperatorWalletInit";
import { OperatorScopedStateCleanup } from "@/components/OperatorScopedStateCleanup";
import { appNostrLoginStorage } from "@/lib/nostrLoginStorage";
import AppRouter from "./AppRouter";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60000, // 1 minute
      gcTime: Infinity,
    },
  },
});

const defaultConfig: AppConfig = {
  theme: "light",
  relayMetadata: APP_RELAYS,
  blossomServerMetadata: {
    servers: [
      'https://blossom.ditto.pub/',
      'https://blossom.dreamith.to/',
      'https://blossom.primal.net/',
    ],
    updatedAt: 0,
  },
  useAppBlossomServers: true,
};

export function App() {
  return (
    <AppProvider storageKey="nostr:app-config" defaultConfig={defaultConfig}>
      <QueryClientProvider client={queryClient}>
        <NostrLoginProvider
          storageKey='nostr:login'
          storage={appNostrLoginStorage}
        >
          <NostrProvider>
            <DevAutoLogin />
            <OperatorScopedStateCleanup />
            <OperatorWalletInit />
            <NostrSync />
            <TooltipProvider>
              <AppToaster />
              <Suspense fallback={<div className="min-h-dvh bg-background" />}>
                <AppRouter />
              </Suspense>
              <InstallBanner />
            </TooltipProvider>
          </NostrProvider>
        </NostrLoginProvider>
      </QueryClientProvider>
    </AppProvider>
  );
}

export default App;
