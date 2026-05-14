import { type ReactNode, useEffect } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { AppContext, type AppConfig, type AppContextType, type Theme, type RelayMetadata, type BlossomServerMetadata } from '@/contexts/AppContext';

interface AppProviderProps {
  children: ReactNode;
  /** Application storage key */
  storageKey: string;
  /** Default app configuration */
  defaultConfig: AppConfig;
}

export function AppProvider(props: AppProviderProps) {
  const {
    children,
    storageKey,
    defaultConfig,
  } = props;

  // App configuration state with localStorage persistence
  const [rawConfig, setConfig] = useLocalStorage<Partial<AppConfig>>(
    storageKey,
    {},
    {
      serialize: JSON.stringify,
      deserialize: (value: string) => {
        const parsed = JSON.parse(value);
        return parsePartialAppConfig(parsed);
      }
    }
  );

  // Generic config updater with callback pattern
  const updateConfig = (updater: (currentConfig: Partial<AppConfig>) => Partial<AppConfig>) => {
    setConfig(updater);
  };

  const config = { ...defaultConfig, ...rawConfig };

  const appContextValue: AppContextType = {
    config,
    updateConfig,
  };

  // Apply theme effects to document
  useApplyTheme(config.theme);

  return (
    <AppContext.Provider value={appContextValue}>
      {children}
    </AppContext.Provider>
  );
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function parseRelayMetadata(value: unknown): RelayMetadata | null {
  if (!isRecord(value) || !Array.isArray(value.relays) || typeof value.updatedAt !== "number") {
    return null;
  }
  const relays = value.relays.map((relay) => {
    if (
      !isRecord(relay) ||
      !isUrl(relay.url) ||
      typeof relay.read !== "boolean" ||
      typeof relay.write !== "boolean"
    ) {
      return null;
    }
    return {
      url: relay.url,
      read: relay.read,
      write: relay.write,
    };
  });
  if (relays.some((relay) => relay === null)) return null;
  return {
    relays: relays as RelayMetadata["relays"],
    updatedAt: value.updatedAt,
  };
}

function parseBlossomServerMetadata(value: unknown): BlossomServerMetadata | null {
  if (!isRecord(value) || !Array.isArray(value.servers) || typeof value.updatedAt !== "number") {
    return null;
  }
  if (!value.servers.every(isUrl)) return null;
  return {
    servers: value.servers,
    updatedAt: value.updatedAt,
  };
}

function parsePartialAppConfig(value: unknown): Partial<AppConfig> {
  if (!isRecord(value)) throw new Error("App config must be an object.");
  const out: Partial<AppConfig> = {};

  if (value.theme !== undefined) {
    if (value.theme !== "dark" && value.theme !== "light" && value.theme !== "system") {
      throw new Error("Invalid app config theme.");
    }
    out.theme = value.theme;
  }
  if (value.relayMetadata !== undefined) {
    const relayMetadata = parseRelayMetadata(value.relayMetadata);
    if (!relayMetadata) throw new Error("Invalid app config relay metadata.");
    out.relayMetadata = relayMetadata;
  }
  if (value.blossomServerMetadata !== undefined) {
    const blossomServerMetadata = parseBlossomServerMetadata(value.blossomServerMetadata);
    if (!blossomServerMetadata) throw new Error("Invalid app config Blossom server metadata.");
    out.blossomServerMetadata = blossomServerMetadata;
  }
  if (value.useAppBlossomServers !== undefined) {
    if (typeof value.useAppBlossomServers !== "boolean") {
      throw new Error("Invalid app config Blossom server toggle.");
    }
    out.useAppBlossomServers = value.useAppBlossomServers;
  }

  return out;
}

/**
 * Hook to apply theme changes to the document root
 */
function useApplyTheme(theme: Theme) {
  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
        .matches
        ? 'dark'
        : 'light';

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  // Handle system theme changes when theme is set to "system"
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      const root = window.document.documentElement;
      root.classList.remove('light', 'dark');

      const systemTheme = mediaQuery.matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);
}
