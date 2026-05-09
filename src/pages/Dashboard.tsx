/**
 * Dashboard — the active persona's composer + recent feed.
 *
 * Phase 1 status: the composer publishes raw text directly. PPQ
 * styling, image generation, wallet badge, and cost estimates land
 * in Phase 2 (tasks/derek-plan.md). Anything depending on Jim's PPQ
 * hooks is stubbed with a TODO comment.
 */

import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { Loader2, Send } from "lucide-react";

import { PhoenixHeader } from "@/components/PhoenixHeader";
import { PostCard } from "@/components/PostCard";
import { PersonaHeaderSkeleton, PostListSkeleton } from "@/components/Skeletons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/useToast";
import { useAuthor } from "@/hooks/useAuthor";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePersona, usePersonaPosts } from "@/hooks/usePersona";
import { usePersonaPublish } from "@/hooks/usePersonaPublish";
import { buildPersonaPostTemplate } from "@/lib/personaPost";
import { nip19 } from "nostr-tools";

function npubToHex(npub: string): string | null {
  try {
    const decoded = nip19.decode(npub);
    if (decoded.type !== "npub") return null;
    return decoded.data;
  } catch {
    return null;
  }
}

const Dashboard = () => {
  const { npub = "" } = useParams();
  useSeoMeta({ title: "Dashboard — Phoenix" });

  const { user } = useCurrentUser();
  const { toast } = useToast();
  const persona = usePersona(npub);
  const posts = usePersonaPosts(npub, 20);
  const publish = usePersonaPublish();

  const personaHex = useMemo(() => npubToHex(npub), [npub]);
  const author = useAuthor(personaHex ?? undefined);
  const publicBio = author.data?.metadata?.about ?? "";

  const [raw, setRaw] = useState("");

  const envelope = persona.data?.envelope ?? null;
  const personaConfig = envelope?.persona ?? null;

  async function onPost() {
    if (!personaConfig || !user || !raw.trim()) return;
    try {
      // Phase 1: no styling step yet — publish the raw text directly.
      // Phase 2 wires `pi-ai` (Jim's hook) between raw and template.
      const template = buildPersonaPostTemplate({
        text: raw,
        tags: personaConfig.tags,
      });
      await publish.mutateAsync({
        personaNsec: personaConfig.nsec,
        template,
      });
      toast({ title: "Published", description: "Post is live on relays." });
      setRaw("");
      posts.refetch();
    } catch (e) {
      toast({
        title: "Publish failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PhoenixHeader />

      <main
        id="main-content"
        className="flex-1 container py-8 max-w-4xl space-y-8"
      >
        {/* Persona header */}
        {!user ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              Sign in to access this persona's dashboard.
            </CardContent>
          </Card>
        ) : persona.isLoading ? (
          <PersonaHeaderSkeleton />
        ) : personaConfig ? (
          <div className="rounded-2xl border border-border bg-card p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-imigongo-clay via-rw-gold to-rw-green" />
            <div className="flex items-start justify-between gap-4 flex-wrap relative">
              <div className="space-y-2">
                {personaConfig.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {personaConfig.tags.slice(0, 4).map((t) => (
                      <Badge
                        key={t}
                        variant="secondary"
                        className="text-[10px]"
                      >
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
                <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight">
                  {personaConfig.name}
                </h1>
                {publicBio && (
                  <p className="text-muted-foreground mt-3 max-w-2xl">
                    {publicBio}
                  </p>
                )}
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to={`/p/${npub}`}>View public feed →</Link>
              </Button>
            </div>
          </div>
        ) : persona.isError ? (
          <Card className="border-dashed">
            <CardContent className="py-12 px-8 text-center text-muted-foreground space-y-2">
              <p>
                Couldn't decrypt this persona. Either it isn't yours, or your
                signer rejected the decryption request.
              </p>
              <p className="text-xs">{String(persona.error)}</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-12 px-8 text-center text-muted-foreground">
              No persona found at this npub for your account. It may not
              have published yet, or the relays haven't seen it.
            </CardContent>
          </Card>
        )}

        {/* Composer (Phase 1: raw publish; Phase 2: PPQ styling) */}
        {personaConfig && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 font-display text-2xl font-medium">
                <Send className="size-5 text-primary" aria-hidden="true" />
                Compose
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="composer-raw" className="text-sm font-medium">
                    Post body
                  </label>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {raw.length} chars
                  </span>
                </div>
                <Textarea
                  id="composer-raw"
                  rows={5}
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  placeholder="Phase 1: publishes as-is. Phase 2: AI styling will run before publish."
                  onKeyDown={(e) => {
                    if (
                      (e.metaKey || e.ctrlKey) &&
                      e.key === "Enter" &&
                      raw.trim() &&
                      !publish.isPending
                    ) {
                      e.preventDefault();
                      onPost();
                    }
                  }}
                  className="resize-y min-h-[8rem]"
                />
                <p className="text-[11px] text-muted-foreground">
                  Press{" "}
                  <kbd className="font-mono px-1 py-0.5 rounded bg-muted border border-border text-[10px]">
                    ⌘ Enter
                  </kbd>{" "}
                  to publish.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setRaw("")}
                  disabled={publish.isPending}
                >
                  Discard
                </Button>
                <Button
                  onClick={onPost}
                  disabled={publish.isPending || !raw.trim()}
                >
                  {publish.isPending ? (
                    <>
                      <Loader2
                        className="mr-2 size-4 animate-spin"
                        aria-hidden="true"
                      />
                      Publishing…
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 size-4" aria-hidden="true" />
                      Publish to relays
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent posts */}
        <div className="space-y-4">
          <h2 className="font-display text-2xl font-medium tracking-tight">
            Recent posts
          </h2>
          {posts.isLoading ? (
            <PostListSkeleton count={2} />
          ) : posts.data && posts.data.length > 0 ? (
            <ul className="space-y-3">
              {posts.data.map((p) => (
                <li key={p.id}>
                  <PostCard event={p} showOperatorBadge />
                </li>
              ))}
            </ul>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-10 px-6 text-sm text-muted-foreground text-center">
                No posts yet. Compose the first one above.
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
