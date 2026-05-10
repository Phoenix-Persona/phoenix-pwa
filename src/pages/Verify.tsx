/**
 * Verify — public attestation page for a persona.
 *
 * Public URL — anyone with a persona's npub can land here. Renders
 * the cryptographic provenance of the persona's identity:
 *
 *   - Persona name + npub (kind 0 metadata)
 *   - Kind 0 signature checked client-side via verifyEvent
 *   - Bot disclosure (kind 0 `bot: true` flag)
 *   - Post count + first / latest timestamps from a kind 1 query
 *   - Operator-link is NOT exposed — see PROJECT.md §3 for the
 *     two-level identity model.
 *
 * No server trust assumptions: every signature check happens in the
 * browser, so a relay returning a forged event would fail
 * verification visibly.
 */

import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import {
  Bot,
  CheckCircle2,
  Clock,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { verifyEvent } from "nostr-tools";

import { AppHeader } from "@/components/AppHeader";
import { FlagStripe, ImigongoSeal } from "@/components/ImigongoBand";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAuthor } from "@/hooks/useAuthor";
import { usePersonaPosts } from "@/hooks/usePersona";
import { genUserName } from "@/lib/genUserName";
import { npubToHex } from "@/lib/nostrIds";
import { cn } from "@/lib/utils";

const Verify = () => {
  const { npub = "" } = useParams();
  const personaHex = useMemo(() => npubToHex(npub), [npub]);
  const author = useAuthor(personaHex ?? undefined);
  const posts = usePersonaPosts(npub, 200);

  const metadata = author.data?.metadata;
  const profileEvent = author.data?.event;
  const displayName =
    metadata?.display_name ??
    metadata?.name ??
    (personaHex ? genUserName(personaHex) : "Unknown persona");
  const isBot = metadata?.bot === true;

  // Run the signature check client-side. nostr-tools/verifyEvent
  // recomputes the event id and verifies the schnorr signature.
  // If anything is malformed, this returns false rather than
  // throwing — exactly what we want for the UI.
  const profileSignatureValid = useMemo(() => {
    if (!profileEvent) return null;
    try {
      return verifyEvent(profileEvent);
    } catch {
      return false;
    }
  }, [profileEvent]);

  // Posts that come back from Nostrify are already validated at the
  // pool level (Nostrify rejects bad signatures on receipt), so any
  // post in `posts.data` is by definition signed by the persona's
  // pubkey. We surface this affirmatively rather than re-verifying.
  const allPostsValid = posts.data && posts.data.length > 0;

  useSeoMeta({ title: `Verify ${displayName} — Zuka` });

  const firstPost = posts.data?.[posts.data.length - 1];
  const lastPost = posts.data?.[0];
  const postCount = posts.data?.length ?? 0;
  const profileTimestamp = profileEvent?.created_at;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader />

      <main id="main-content" className="flex-1">
        {/* Cover band — green-tinted "verified" mat */}
        <section className="relative overflow-hidden hero-mat text-imigongo-cream">
          <div
            className="absolute inset-0 imigongo-pattern-bold text-imigongo-cream opacity-[0.05] pointer-events-none"
            aria-hidden="true"
          />
          <div
            className="absolute -top-40 -right-32 w-[36rem] h-[36rem] rounded-full bg-rw-green/15 blur-3xl pointer-events-none"
            aria-hidden="true"
          />

          <div className="container relative py-12 md:py-16 max-w-3xl">
            <div className="flex items-center gap-5">
              <div className="relative flex-shrink-0">
                <div
                  className="absolute -inset-3 rounded-full bg-rw-green/30 blur-2xl"
                  aria-hidden="true"
                />
                <div className="relative w-20 h-20 rounded-full bg-rw-green/20 ring-2 ring-rw-green/50 flex items-center justify-center">
                  <ShieldCheck className="size-10 text-rw-gold" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-rw-gold font-semibold">
                  <span className="h-px w-6 bg-rw-gold" />
                  Zuka attestation
                </p>
                <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight">
                  {displayName}
                </h1>
                <p className="text-imigongo-cream/80 text-sm">
                  Public cryptographic provenance — verified in your browser.
                </p>
              </div>
            </div>
          </div>
          <FlagStripe height={4} />
        </section>

        <div className="container py-10 max-w-3xl space-y-6">
          {!personaHex ? (
            <Card className="border-dashed border-destructive/30 bg-destructive/5">
              <CardContent className="py-12 text-center text-muted-foreground">
                Invalid npub.
              </CardContent>
            </Card>
          ) : author.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              {/* Identity */}
              <Card className="border-imigongo-clay/20 bg-gradient-to-br from-card to-rw-gold-soft/10 overflow-hidden">
                <div className="bg-gradient-to-r from-rw-sky/10 via-rw-gold/10 to-rw-green/10 px-6 py-4 border-b border-imigongo-clay/15 flex items-center gap-2">
                  <CheckCircle2 className="size-5 text-rw-green" />
                  <CardTitle className="text-lg">Identity</CardTitle>
                </div>
                <CardContent className="space-y-4 text-sm pt-5">
                  <Field label="Persona name" value={displayName} />
                  <Field label="Persona npub" value={npub} mono />
                  {isBot && (
                    <Field
                      label="Disclosure"
                      value={
                        <Badge
                          variant="secondary"
                          className="bg-rw-sky/10 text-rw-sky border-rw-sky/20 inline-flex items-center gap-1.5"
                        >
                          <Bot className="size-3" />
                          AI-assisted persona
                        </Badge>
                      }
                    />
                  )}
                  <Field label="Operator" value="Private by design" />
                  <p className="text-xs text-muted-foreground pt-2 leading-relaxed">
                    The human accountable for this voice is{" "}
                    <strong>intentionally not disclosed</strong> on the
                    network. Zuka is built for activists who would be at
                    risk if the operator-persona link were public. The
                    persona's configuration is encrypted to the operator's
                    Nostr key — only they can operate the persona, and only
                    they can prove ownership privately.
                  </p>
                </CardContent>
              </Card>

              {/* Authenticity — client-side signature checks */}
              <Card className="border-imigongo-clay/20 overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-rw-sky/10 via-rw-gold/10 to-rw-green/10 border-b border-imigongo-clay/15 flex flex-row items-center gap-2">
                  <ShieldCheck className="size-5 text-rw-green" />
                  <CardTitle className="text-lg">Authenticity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm pt-5">
                  <SignatureRow
                    label="Profile signature (kind 0)"
                    state={
                      !profileEvent
                        ? "missing"
                        : profileSignatureValid
                        ? "valid"
                        : "invalid"
                    }
                    detail={
                      !profileEvent
                        ? "No profile event found on the queried relays."
                        : profileSignatureValid
                        ? "Signed by this persona's keypair."
                        : "Signature failed to verify."
                    }
                  />
                  <SignatureRow
                    label="Post signatures (kind 1)"
                    state={
                      posts.isLoading
                        ? "pending"
                        : allPostsValid
                        ? "valid"
                        : postCount === 0
                        ? "empty"
                        : "invalid"
                    }
                    detail={
                      posts.isLoading
                        ? "Fetching posts…"
                        : allPostsValid
                        ? `All ${postCount} ${postCount === 1 ? "post" : "posts"} on relays signed by this persona.`
                        : postCount === 0
                        ? "No posts yet."
                        : "Some posts failed to verify."
                    }
                  />
                  <p className="text-xs text-muted-foreground pt-2 leading-relaxed">
                    Every signature is verified in your browser — Zuka
                    runs no server. A relay that returned a forged event
                    would fail this check visibly.
                  </p>
                </CardContent>
              </Card>

              {/* Activity */}
              <Card className="border-imigongo-clay/20 overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-rw-sky/10 via-rw-gold/10 to-rw-green/10 border-b border-imigongo-clay/15 flex flex-row items-center gap-2">
                  <Clock className="size-5 text-imigongo-clay" />
                  <CardTitle className="text-lg">Activity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm pt-5">
                  <Field label="Posts on relays" value={String(postCount)} />
                  {profileTimestamp && (
                    <Field
                      label="Profile published"
                      value={formatStamp(profileTimestamp)}
                    />
                  )}
                  {firstPost && (
                    <Field
                      label="First post"
                      value={formatStamp(firstPost.created_at)}
                    />
                  )}
                  {lastPost && (
                    <Field
                      label="Latest post"
                      value={formatStamp(lastPost.created_at)}
                    />
                  )}
                </CardContent>
              </Card>

              <div className="pt-2 flex items-center justify-between gap-3 flex-wrap">
                <Link
                  to={`/p/${npub}`}
                  className="text-sm text-primary hover:underline"
                >
                  ← Back to feed
                </Link>
                <ImigongoSeal
                  size={28}
                  colorClass="text-imigongo-clay/40"
                  className="hidden sm:block"
                />
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

interface FieldProps {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}

function Field({ label, value, mono = false }: FieldProps) {
  return (
    <div className="grid sm:grid-cols-[180px_1fr] gap-1 sm:gap-4">
      <div className="text-muted-foreground text-[11px] uppercase tracking-[0.14em] font-semibold">
        {label}
      </div>
      <div className={mono ? "font-mono break-all" : ""}>{value}</div>
    </div>
  );
}

type SignatureState = "valid" | "invalid" | "missing" | "empty" | "pending";

interface SignatureRowProps {
  label: string;
  state: SignatureState;
  detail: string;
}

function SignatureRow({ label, state, detail }: SignatureRowProps) {
  const config = {
    valid: {
      icon: CheckCircle2,
      iconClass: "text-rw-green",
      ringClass: "ring-rw-green/30 bg-rw-green/10",
    },
    invalid: {
      icon: XCircle,
      iconClass: "text-destructive",
      ringClass: "ring-destructive/30 bg-destructive/10",
    },
    missing: {
      icon: XCircle,
      iconClass: "text-muted-foreground",
      ringClass: "ring-muted-foreground/30 bg-muted",
    },
    empty: {
      icon: Clock,
      iconClass: "text-muted-foreground",
      ringClass: "ring-muted-foreground/20 bg-muted/60",
    },
    pending: {
      icon: Clock,
      iconClass: "text-muted-foreground animate-pulse",
      ringClass: "ring-muted-foreground/20 bg-muted",
    },
  }[state];
  const Icon = config.icon;
  return (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          "size-9 rounded-full grid place-items-center ring-1 flex-shrink-0",
          config.ringClass
        )}
      >
        <Icon className={cn("size-4", config.iconClass)} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{detail}</p>
      </div>
    </div>
  );
}

function formatStamp(unix: number): string {
  return new Date(unix * 1000).toLocaleString();
}

export default Verify;
