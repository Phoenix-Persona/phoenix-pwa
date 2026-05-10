/**
 * BlossomServerListManager — UI for editing the user's BUD-03
 * Blossom server list (kind 10063).
 *
 * Mirrors `RelayListManager` in structure but simpler — Blossom
 * servers don't have read/write semantics, just a URL list. Adds
 * one extra control: a toggle for `useAppBlossomServers`, which
 * decides whether Feniksi's defaults are merged with the user's
 * list (per `getEffectiveBlossomServers` in `appBlossom.ts`).
 *
 * On every change we update local AppContext (so uploads use the
 * new list immediately) and, when signed in, publish a fresh kind
 * 10063 so the list rides the user's account across devices.
 */

import { useEffect, useState } from "react";
import { HardDrive, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAppContext } from "@/hooks/useAppContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { useToast } from "@/hooks/useToast";

/** Trim, default to https://, validate parses + has a host. */
function normalizeBlossomUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  try {
    const u = new URL(candidate);
    // Blossom URLs are conventionally trailing-slash; preserve user
    // input but normalise no-path → trailing slash for consistency.
    return u.toString();
  } catch {
    return candidate;
  }
}

/** Same-server detector (case-insensitive, ignoring trailing slashes). */
function sameServer(a: string, b: string): boolean {
  const norm = (u: string) => u.toLowerCase().replace(/\/+$/, "");
  return norm(a) === norm(b);
}

/** Compact display: hostname + path (no protocol, no trailing slash). */
function renderServerUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.host;
    const path = u.pathname.replace(/\/+$/, "");
    return path && path !== "/" ? host + path : host;
  } catch {
    return url;
  }
}

export function BlossomServerListManager() {
  const { config, updateConfig } = useAppContext();
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const { toast } = useToast();

  const [servers, setServers] = useState<string[]>(
    config.blossomServerMetadata.servers
  );
  const [newUrl, setNewUrl] = useState("");

  // Mirror the AppContext list — keeps the UI in sync when
  // NostrSync writes a freshly-pulled kind 10063 into config or
  // when the user changes (we reset to defaults on user change).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setServers(config.blossomServerMetadata.servers);
  }, [config.blossomServerMetadata.servers]);

  const persist = (next: string[]) => {
    // Event-handler context, not render — Date.now() is safe.
    // eslint-disable-next-line react-hooks/purity
    const now = Math.floor(Date.now() / 1000);
    updateConfig((current) => ({
      ...current,
      blossomServerMetadata: {
        servers: next,
        updatedAt: now,
      },
    }));
    if (user) publishKind10063(next);
  };

  const publishKind10063 = (list: string[]) => {
    publishEvent(
      {
        kind: 10063,
        content: "",
        tags: list.map((url) => ["server", url]),
      },
      {
        onSuccess: () => {
          toast({
            title: "Blossom servers published",
            description: "Your media-server list is live on Nostr.",
          });
        },
        onError: (error) => {
          console.error("Failed to publish Blossom server list:", error);
          toast({
            title: "Failed to publish server list",
            description:
              "We saved your changes locally but couldn't reach a relay to publish them.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleAdd = () => {
    const normalized = normalizeBlossomUrl(newUrl);
    let parsedHost = "";
    try {
      parsedHost = new URL(normalized).host;
    } catch {
      // fall through
    }
    if (!parsedHost) {
      toast({
        title: "Invalid Blossom server URL",
        description: "Use the full URL, e.g. https://blossom.example.com",
        variant: "destructive",
      });
      return;
    }
    if (servers.some((s) => sameServer(s, normalized))) {
      toast({
        title: "Already in your list",
        description: "That server is already configured.",
        variant: "destructive",
      });
      return;
    }
    const next = [...servers, normalized];
    setServers(next);
    setNewUrl("");
    persist(next);
  };

  const handleRemove = (url: string) => {
    const next = servers.filter((s) => !sameServer(s, url));
    setServers(next);
    persist(next);
  };

  const handleToggleAppDefaults = (value: boolean) => {
    updateConfig((current) => ({
      ...current,
      useAppBlossomServers: value,
    }));
  };

  return (
    <div className="space-y-4">
      {/* Server list */}
      <div className="space-y-2">
        {servers.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            No Blossom servers configured.
            {config.useAppBlossomServers
              ? " Feniksi's defaults are still in use for uploads."
              : " Add at least one to enable uploads."}
          </div>
        ) : (
          servers.map((url) => (
            <div
              key={url}
              className="flex items-center gap-3 p-3 rounded-md border bg-muted/20"
            >
              <HardDrive
                className="h-4 w-4 text-muted-foreground shrink-0"
                aria-hidden="true"
              />
              <span
                className="font-mono text-sm flex-1 truncate"
                title={url}
              >
                {renderServerUrl(url)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemove(url)}
                className="size-5 text-muted-foreground hover:text-destructive hover:bg-transparent shrink-0"
                aria-label={`Remove ${renderServerUrl(url)}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Add server form */}
      <div className="flex gap-2">
        <div className="flex-1">
          <Label htmlFor="new-blossom-url" className="sr-only">
            Blossom server URL
          </Label>
          <Input
            id="new-blossom-url"
            placeholder="Enter Blossom server URL (e.g., https://blossom.example.com)"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
          />
        </div>
        <Button
          onClick={handleAdd}
          disabled={!newUrl.trim()}
          variant="outline"
          size="sm"
          className="h-10 shrink-0"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add server
        </Button>
      </div>

      {/* App defaults toggle */}
      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 p-3">
        <div className="space-y-0.5 min-w-0">
          <Label
            htmlFor="use-app-blossom-defaults"
            className="text-sm font-medium cursor-pointer"
          >
            Include Feniksi's default servers
          </Label>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Mirrors uploads to Feniksi's vetted servers (Ditto, Dreamith,
            Primal) alongside your own. Recommended for redundancy.
          </p>
        </div>
        <Switch
          id="use-app-blossom-defaults"
          checked={config.useAppBlossomServers}
          onCheckedChange={handleToggleAppDefaults}
          className="data-[state=checked]:bg-rw-green shrink-0"
        />
      </div>

      {!user && (
        <p className="text-xs text-muted-foreground">
          Sign in to sync your media-server list with Nostr.
        </p>
      )}
    </div>
  );
}
