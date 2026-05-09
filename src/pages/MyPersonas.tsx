import { Link } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { Plus } from "lucide-react";

import { PhoenixHeader } from "@/components/PhoenixHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useMyPersonas } from "@/hooks/usePersona";

const MyPersonas = () => {
  useSeoMeta({ title: "My personas — Phoenix" });
  const { user } = useCurrentUser();
  const { data, isLoading, isError, error } = useMyPersonas();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PhoenixHeader />

      <main className="flex-1 container py-10 max-w-5xl space-y-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.18em] text-imigongo-clay font-semibold">
              Your voices
            </p>
            <h1 className="font-display text-4xl md:text-5xl font-medium tracking-tight">
              My personas
            </h1>
            <p className="text-muted-foreground max-w-2xl leading-relaxed">
              Every voice you operate. Persona configurations are encrypted to
              your Nostr key — only you can operate them. Sign in on any
              device with the same key to recover them.
            </p>
          </div>
          <Button asChild className="shadow-md shadow-primary/20">
            <Link to="/onboard">
              <Plus className="mr-2 size-4" />
              New persona
            </Link>
          </Button>
        </div>

        {!user ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              Sign in to view your personas.
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        ) : isError ? (
          <Card className="border-dashed">
            <CardContent className="py-12 px-8 text-center text-muted-foreground space-y-2">
              <p>Couldn't load your personas.</p>
              <p className="text-xs">{String(error)}</p>
            </CardContent>
          </Card>
        ) : data && data.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.map(({ event, config, npub }) => (
              <Link
                key={event.id}
                to={`/dashboard/${npub}`}
                className="group relative rounded-2xl border border-border bg-card p-6 hover:border-imigongo-clay hover:shadow-lg hover:shadow-imigongo-clay/10 transition-all space-y-3 overflow-hidden"
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-imigongo-clay via-rw-gold to-rw-green opacity-70 group-hover:opacity-100 transition-opacity" />
                <div className="text-xs uppercase tracking-[0.18em] text-imigongo-clay font-semibold pt-1">
                  {config.region} · {config.cause}
                </div>
                <h3 className="font-display text-2xl font-medium tracking-tight group-hover:text-primary transition-colors">
                  {config.name}
                </h3>
                <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                  {config.bio}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {config.languages.slice(0, 3).map((l) => (
                    <Badge key={l} variant="secondary" className="text-[10px]">
                      {l.toUpperCase()}
                    </Badge>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-12 px-8 text-center text-muted-foreground space-y-3">
              <p>You don't have any personas yet.</p>
              <Button asChild>
                <Link to="/onboard">
                  <Plus className="mr-2 size-4" />
                  Create your first persona
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default MyPersonas;
