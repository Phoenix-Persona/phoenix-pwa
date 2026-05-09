import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { Loader2, Send, Sparkles } from "lucide-react";

import { PhoenixHeader } from "@/components/PhoenixHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
        personaName: config.name,
        regionSlug: regionSlug(config.region),
        causeSlug: config.cause,
        operatorPubkey: user.pubkey,
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

      <main className="flex-1 container py-8 max-w-4xl space-y-8">
        {/* Persona header */}
        {!user ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              Sign in to access this persona's dashboard.
            </CardContent>
          </Card>
        ) : persona.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : config ? (
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-wider text-imigongo-clay font-medium mb-1">
                {config.region} · {config.cause}
              </div>
              <h1 className="text-3xl font-bold tracking-tight">{config.name}</h1>
              <p className="text-muted-foreground mt-2 max-w-2xl">{config.bio}</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to={`/p/${npub}`}>View public feed →</Link>
            </Button>
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
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                Compose
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Your raw thought</label>
                <Textarea
                  rows={4}
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  placeholder="Type a thought, a fact, a reaction. The persona will style it."
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={onStyle} disabled={!raw.trim() || styling} variant="outline">
                  {styling ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Styling…
                    </>
                  ) : (
                    "Style in voice →"
                  )}
                </Button>
              </div>

              {styled && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Styled in {config.name}'s voice
                    </label>
                    <Textarea
                      rows={6}
                      value={styled}
                      onChange={(e) => setStyled(e.target.value)}
                      className="border-imigongo-clay/40 bg-imigongo-clay/5"
                    />
                    <p className="text-xs text-muted-foreground">
                      You can edit before posting. Sources from the persona
                      config will be attached as attribution tags.
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={onPost} disabled={publish.isPending}>
                      {publish.isPending ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Publishing…
                        </>
                      ) : (
                        <>
                          <Send className="mr-2 size-4" />
                          Publish to relays
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Recent posts */}
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Recent posts</h2>
          {posts.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : posts.data && posts.data.length > 0 ? (
            <ul className="space-y-3">
              {posts.data.map((p) => (
                <li key={p.id} className="rounded-lg border border-border bg-card p-4">
                  <p className="whitespace-pre-wrap leading-relaxed">{p.content}</p>
                  <div className="mt-3 text-xs text-muted-foreground">
                    {new Date(p.created_at * 1000).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-8 px-6 text-sm text-muted-foreground text-center">
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
