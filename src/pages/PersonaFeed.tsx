import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { ShieldCheck } from "lucide-react";
import { nip19 } from "nostr-tools";

import { PhoenixHeader } from "@/components/PhoenixHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuthor } from "@/hooks/useAuthor";
import { usePersonaPosts } from "@/hooks/usePersona";
import { extractSourceDomains } from "@/lib/personaPost";
import { genUserName } from "@/lib/genUserName";

function npubToHex(npub: string): string | null {
  try {
    const decoded = nip19.decode(npub);
    if (decoded.type !== "npub") return null;
    return decoded.data;
  } catch {
    return null;
  }
}

const PersonaFeed = () => {
  const { npub = "" } = useParams();
  const personaHex = useMemo(() => npubToHex(npub), [npub]);
  const author = useAuthor(personaHex ?? undefined);
  const posts = usePersonaPosts(npub, 50);

  const displayName =
    author.data?.metadata?.display_name ??
    author.data?.metadata?.name ??
    (personaHex ? genUserName(personaHex) : "Unknown persona");
  const bio = author.data?.metadata?.about ?? "";

  useSeoMeta({
    title: `${displayName} — Phoenix`,
    description: bio || undefined,
  });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PhoenixHeader />

      <main className="flex-1 container py-8 max-w-3xl space-y-8">
        {/* Header */}
        {!personaHex ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              Invalid persona npub.
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6 relative overflow-hidden">
            <div className="absolute inset-0 imigongo-pattern text-imigongo-clay opacity-[0.05] pointer-events-none" />
            <div className="relative space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  {displayName}
                </h1>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/verify/${npub}`}>
                    <ShieldCheck className="mr-2 size-4" />
                    Verify
                  </Link>
                </Button>
              </div>
              {bio && (
                <p className="text-muted-foreground max-w-2xl">{bio}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {npub.slice(0, 16)}…
                </Badge>
              </div>
            </div>
          </div>
        )}

        {/* Feed */}
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Feed</h2>
          {posts.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : posts.data && posts.data.length > 0 ? (
            <ul className="space-y-3">
              {posts.data.map((p) => {
                const domains = extractSourceDomains(p.tags);
                return (
                  <li key={p.id} className="rounded-lg border border-border bg-card p-5">
                    <p className="whitespace-pre-wrap leading-relaxed">{p.content}</p>
                    <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
                      <div className="flex flex-wrap gap-1.5">
                        {domains.map((d) => (
                          <Badge key={d} variant="outline" className="text-xs font-normal">
                            {d}
                          </Badge>
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(p.created_at * 1000).toLocaleString()}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-12 px-8 text-center text-muted-foreground">
                No posts yet. The voice is preparing to speak.
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default PersonaFeed;
