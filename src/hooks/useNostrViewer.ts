import { useLocalStorage } from "./useLocalStorage";
import {
  DEFAULT_NOSTR_VIEWER_URL,
  NOSTR_VIEWER_STORAGE_KEY,
  sanitizeNostrViewerUrlPrefix,
} from "@/lib/nostrViewer";

export function useNostrViewer() {
  const [viewerUrl, setViewerUrl] = useLocalStorage<string>(
    NOSTR_VIEWER_STORAGE_KEY,
    DEFAULT_NOSTR_VIEWER_URL,
    {
      serialize: (v) => v,
      deserialize: (v) =>
        sanitizeNostrViewerUrlPrefix(v) ?? DEFAULT_NOSTR_VIEWER_URL,
    },
  );

  const setSafeViewerUrl = (value: string) => {
    if (value === "") {
      setViewerUrl("");
      return;
    }
    const safe = sanitizeNostrViewerUrlPrefix(value);
    if (safe) setViewerUrl(safe);
  };

  return { viewerUrl, setViewerUrl: setSafeViewerUrl };
}
