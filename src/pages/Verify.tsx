import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { ShieldCheck } from "lucide-react";
import { nip19 } from "nostr-tools";

import { PhoenixHeader } from "@/components/PhoenixHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthor } from "@/hooks/useAuthor";
import { usePersonaPosts } from "@/hooks/usePersona";
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

const Verify = () => {
  const { npub = "" } = useParams();
  const personaHex = useMemo(() => npubToHex(npub), [npub]);
  const author = useAuthor(personaHex ?? undefined);
  const posts = usePersonaPosts(npub, 200);

  const displayName =
    author.data?.metadata?.display_name ??
    author.data?.metadata?.name ??
    (personaHex ? genUserName(personaHex) : "Unknown persona");

  useSeoMeta({ title: `Verify ${displayName} — Phoenix` });

  const firstPost = posts.data?.[posts.data.length - 1];
  const lastPost = posts.data?.[0];
  const postCount = posts.data?.length ?? 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PhoenixHeader />

      <main className="flex-1 container py-10 max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Persona verification
            </h1>
            <p className="text-muted-foreground text-sm">
              Public-facing identity for {displayName}.
            </p>
          </div>
        </div>

        {posts.isLoading || author.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !personaHex ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              Invalid npub.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Identity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <Field label="Persona name" value={displayName} />
                <Field label="Persona npub" value={npub} mono />
                <Field
                  label="Operator"
                  value="Private by design"
                />
                <p className="text-xs text-muted-foreground pt-2 leading-relaxed">
                  The human accountable for this voice is{" "}
                  <strong>intentionally not disclosed</strong> on the network.
                  Phoenix is built for activists who would be at risk if the
                  operator-persona link were public. The persona's
                  configuration is encrypted to the operator's Nostr key —
                  only they can operate the persona, and only they can prove
                  ownership privately.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <Field label="Posts on relays" value={String(postCount)} />
                {firstPost && (
                  <Field
                    label="First post"
                    value={new Date(firstPost.created_at * 1000).toLocaleString()}
                  />
                )}
                {lastPost && (
                  <Field
                    label="Latest post"
                    value={new Date(lastPost.created_at * 1000).toLocaleString()}
                  />
                )}
              </CardContent>
            </Card>

            <div className="pt-4">
              <Link to={`/p/${npub}`} className="text-sm text-primary hover:underline">
                ← Back to feed
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid sm:grid-cols-[160px_1fr] gap-1 sm:gap-4">
      <div className="text-muted-foreground">{label}</div>
      <div className={mono ? "font-mono break-all" : ""}>{value}</div>
    </div>
  );
}

export default Verify;
