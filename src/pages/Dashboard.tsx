import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { Loader2, Send, Sparkles } from "lucide-react";

import { PhoenixHeader } from "@/components/PhoenixHeader";
import { PostCard } from "@/components/PostCard";
import { PersonaHeaderSkeleton, PostListSkeleton } from "@/components/Skeletons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/useToast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePersona, usePersonaPosts } from "@/hooks/usePersona";
import { usePersonaPublish } from "@/hooks/usePersonaPublish";
import { styleText, toStylingPayload } from "@/lib/styleClient";
import { buildPersonaPostTemplate } from "@/lib/personaPost";

function regionSlug(region: string): string {
  return region.toLowerCase();
}

const Dashboard = () => {
  const { npub = "" } = useParams();
  useSeoMeta({ title: "Dashboard — Phoenix" });

  const { user } = useCurrentUser();
  const { toast } = useToast();
  const persona = usePersona(npub);
  const posts = usePersonaPosts(npub, 20);
  const publish = usePersonaPublish();

  const [raw, setRaw] = useState("");
  const [styled, setStyled] = useState("");
  const [styling, setStyling] = useState(false);

  const config = persona.data?.config ?? null;

  async function onStyle() {
    if (!config || !raw.trim()) return;
    setStyling(true);
    try {
      const res = await styleText({
        text: raw,
        persona: toStylingPayload(config),
      });
      setStyled(res.styled);
    } catch (e) {
      toast({
        title: "Styling failed",
        description: e instanceof Error ? e.message : "Endpoint unreachable.",
        variant: "destructive",
      });
    } finally {
      setStyling(false);
    }
  }

  async function onPost() {
    if (!config || !user || !styled.trim()) return;
    try {
      const template = buildPersonaPostTemplate({
        text: styled,
        regionSlug: regionSlug(config.region),
        causeSlug: config.cause,
        sources: config.sources.map((s) => s.url).filter(Boolean),
      });
      await publish.mutateAsync({
        personaNsec: config.personaNsec,
        template,
      });
      toast({ title: "Published", description: "Post is live on relays." });
      setRaw("");
      setStyled("");
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

      <main id="main-content" className="flex-1 container py-8 max-w-4xl space-y-8">
        {/* Persona header */}
        {!user ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              Sign in to access this persona's dashboard.
            </CardContent>
          </Card>
        ) : persona.isLoading ? (
          <PersonaHeaderSkeleton />
        ) : config ? (
          <div className="rounded-2xl border border-border bg-card p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-imigongo-clay via-rw-gold to-rw-green" />
            <div className="flex items-start justify-between gap-4 flex-wrap relative">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-imigongo-clay font-semibold mb-1">
                  {config.region} · {config.cause}
                </div>
                <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight">
                  {config.name}
                </h1>
                <p className="text-muted-foreground mt-3 max-w-2xl">{config.bio}</p>
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
              No persona found at this npub for your account. It may not have
              published yet, or the relays haven't seen it.
            </CardContent>
          </Card>
        )}

        {/* Composer */}
        {config && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 font-display text-2xl font-medium">
                <Sparkles className="size-5 text-primary" aria-hidden="true" />
                Compose
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="composer-raw"
                    className="text-sm font-medium"
                  >
                    Your raw thought
                  </label>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {raw.length} chars
                  </span>
                </div>
                <Textarea
                  id="composer-raw"
                  rows={4}
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  placeholder="Type a thought, a fact, a reaction. The persona will style it."
                  onKeyDown={(e) => {
                    if (
                      (e.metaKey || e.ctrlKey) &&
                      e.key === "Enter" &&
                      raw.trim() &&
                      !styling
                    ) {
                      e.preventDefault();
                      onStyle();
                    }
                  }}
                  className="resize-y min-h-[6rem]"
                />
                <p className="text-[11px] text-muted-foreground">
                  Press{" "}
                  <kbd className="font-mono px-1 py-0.5 rounded bg-muted border border-border text-[10px]">
                    ⌘ Enter
                  </kbd>{" "}
                  to style.
                </p>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={onStyle}
                  disabled={!raw.trim() || styling}
                  variant="outline"
                >
                  {styling ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                      Styling…
                    </>
                  ) : (
                    "Style in voice →"
                  )}
                </Button>
              </div>

              {styled && (
                <div className="space-y-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 duration-300">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="composer-styled"
                        className="text-sm font-medium"
                      >
                        Styled in {config.name}'s voice
                      </label>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {styled.length} chars
                      </span>
                    </div>
                    <Textarea
                      id="composer-styled"
                      rows={6}
                      value={styled}
                      onChange={(e) => setStyled(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          (e.metaKey || e.ctrlKey) &&
                          e.key === "Enter" &&
                          styled.trim() &&
                          !publish.isPending
                        ) {
                          e.preventDefault();
                          onPost();
                        }
                      }}
                      className="border-imigongo-clay/40 bg-imigongo-clay/5 focus-visible:bg-card transition-colors resize-y min-h-[8rem]"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Edit freely before posting. Source URLs from the persona
                      config attach as <code className="font-mono">r</code> tags
                      for attribution. Press{" "}
                      <kbd className="font-mono px-1 py-0.5 rounded bg-muted border border-border text-[10px]">
                        ⌘ Enter
                      </kbd>{" "}
                      to publish.
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => setStyled("")}
                      disabled={publish.isPending}
                    >
                      Discard
                    </Button>
                    <Button
                      onClick={onPost}
                      disabled={publish.isPending || !styled.trim()}
                    >
                      {publish.isPending ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
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
                </div>
              )}
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
