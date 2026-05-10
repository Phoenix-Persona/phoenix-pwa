import { useLocalStorage } from "./useLocalStorage";
import {
  DEFAULT_NOSTR_VIEWER_URL,
  NOSTR_VIEWER_STORAGE_KEY,
} from "@/lib/nostrViewer";

export function useNostrViewer() {
  const [viewerUrl, setViewerUrl] = useLocalStorage<string>(
    NOSTR_VIEWER_STORAGE_KEY,
    DEFAULT_NOSTR_VIEWER_URL,
    {
      serialize: (v) => v,
      deserialize: (v) => v,
    },
  );

  return { viewerUrl, setViewerUrl };
}
