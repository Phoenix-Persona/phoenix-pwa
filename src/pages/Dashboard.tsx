/**
 * Dashboard — the active persona's composer + recent feed.
 *
 * The composer publishes raw text directly. AI styling (PPQ), image
 * generation, and the wallet/cost layer are Jim's surface area and
 * land separately on this page when they're ready.
 */

import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { FileText, Film, Loader2, Sparkles, Wand2 } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { FlagStripe, ImigongoSeal } from "@/components/ImigongoBand";
import { PersonaActionsMenu } from "@/components/PersonaActionsMenu";
import { PostCard } from "@/components/PostCard";
import { PostListSkeleton } from "@/components/Skeletons";
import { WalletBadge } from "@/components/wallet/WalletBadge";
import { WalletDialog } from "@/components/wallet/WalletDialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/useToast";
import { useAuthor } from "@/hooks/useAuthor";
import { useCrossPost } from "@/hooks/useCrossPost";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePersona, usePersonaPosts } from "@/hooks/usePersona";
import { usePersonaPublish } from "@/hooks/usePersonaPublish";
import { usePpqInference } from "@/hooks/usePpqInference";
import { useWallet } from "@/hooks/useWallet";
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
  useSeoMeta({ title: "Dashboard — Zuka" });

  const { user } = useCurrentUser();
  const { toast } = useToast();
  const persona = usePersona(npub);
  const posts = usePersonaPosts(npub, 20);
  const publish = usePersonaPublish();
  const crossPost = useCrossPost();

  // Composer fields. `raw` is the idea/draft body (legacy name kept
  // for git-blame continuity); the new V1.5 composer also collects
  // sources and style hints to ground the eventual AI styling +
  // video gen — both are wired into the post template now (sources
  // emit `r` tags) so the kind 1 carries them even before the AI
  // pipeline is live.
  const [sourcesInput, setSourcesInput] = useState("");
  const [hintsInput, setHintsInput] = useState("");

  const personaHex = useMemo(() => npubToHex(npub), [npub]);
  const author = useAuthor(personaHex ?? undefined);
  const publicBio = author.data?.metadata?.about ?? "";
  const picture = author.data?.metadata?.picture;

  const [raw, setRaw] = useState("");
  const [walletOpen, setWalletOpen] = useState(false);

  const envelope = persona.data?.envelope ?? null;
  const personaConfig = envelope?.persona ?? null;
  // Persona wallets are NOT subject to env override — donations go to
  // each persona's own wallet, always. The operator's `VITE_WALLET_SEED`
  // pin only applies to the header (operator) wallet badge. PPQ env
  // overrides still apply globally for inference (PROJECT.md §6).
  const walletSeed = envelope?.wallet?.seed;
  const stylingModel =
    envelope?.model_prefs?.agent ?? "anthropic/claude-sonnet-4.5";

  const wallet = useWallet({ mnemonic: walletSeed });
  const styling = usePpqInference();

  async function onStyle() {
    if (!personaConfig || !raw.trim()) return;
    try {
      const res = await styling.mutateAsync({
        model: stylingModel,
        messages: [
          { role: "system", content: personaConfig.system_prompt },
          { role: "user", content: raw },
        ],
      });
      const styled = res.choices?.[0]?.message?.content?.trim();
      if (styled) {
        setRaw(styled);
        wallet.refreshPpqBalance();
        wallet.refreshInfo();
      }
    } catch (e) {
      toast({
        title: "Styling failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  async function onPost() {
    if (!personaConfig || !user || !raw.trim()) return;
    try {
      // The hints field is captured for the future styling pipeline
      // but not surfaced in the published event (style is shape, not
      // content). Sources DO go on the event as `r` tags so
      // attribution rides the post immediately. AI styling is opt-in
      // via the "Style in voice" button — by the time we get here,
      // `raw` is whatever the user wants to publish (literal or
      // styled).
      const sources = sourcesInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const template = buildPersonaPostTemplate({
        text: raw,
        tags: personaConfig.tags,
        sources,
      });
      const signed = await publish.mutateAsync({
        personaNsec: personaConfig.nsec,
        template,
      });

      // Successful Nostr publish — try the cross-post webhook if
      // configured. Failures are non-fatal: the post is already live
      // on relays, so we surface a non-blocking warning toast.
      if (personaConfig.cross_post?.webhook_url) {
        try {
          await crossPost.mutateAsync({
            persona: personaConfig,
            event: signed,
          });
          toast({
            title: "Published",
            description: "Live on relays and dispatched to your cross-post webhook.",
          });
        } catch (e) {
          toast({
            title: "Cross-post failed",
            description:
              e instanceof Error
                ? `Posted to relays, but the webhook returned: ${e.message}`
                : "Posted to relays, but the cross-post webhook didn't accept the event.",
            variant: "destructive",
          });
        }
      } else {
        toast({ title: "Published", description: "Post is live on relays." });
      }

      setRaw("");
      setSourcesInput("");
      setHintsInput("");
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
      <AppHeader />

      <main id="main-content" className="flex-1">
        {/* Persona cover header — charcoal mat with avatar + tags */}
        {!user ? (
          <section className="cream-wash py-20">
            <div className="container max-w-3xl">
              <Card className="border-dashed border-imigongo-clay/30 bg-imigongo-cream/40">
                <CardContent className="py-12 text-center text-muted-foreground">
                  Sign in to access this persona's dashboard.
                </CardContent>
              </Card>
            </div>
          </section>
        ) : persona.isLoading ? (
          <section className="hero-mat text-imigongo-cream">
            <div className="container py-12 md:py-16 max-w-4xl flex items-center gap-6">
              <div className="w-28 h-28 rounded-full bg-imigongo-cream/10 animate-pulse" />
              <div className="flex-1 space-y-3">
                <div className="h-3 w-24 bg-imigongo-cream/15 rounded animate-pulse" />
                <div className="h-10 w-72 bg-imigongo-cream/15 rounded animate-pulse" />
                <div className="h-4 w-96 max-w-full bg-imigongo-cream/10 rounded animate-pulse" />
              </div>
            </div>
            <FlagStripe height={4} />
          </section>
        ) : personaConfig ? (
          <section className="relative overflow-hidden hero-mat text-imigongo-cream">
            <div
              className="absolute inset-0 imigongo-pattern-bold text-imigongo-cream opacity-[0.05] pointer-events-none"
              aria-hidden="true"
            />
            <div
              className="absolute -top-40 -right-32 w-[36rem] h-[36rem] rounded-full bg-rw-gold/10 blur-3xl pointer-events-none"
              aria-hidden="true"
            />

            <div className="container relative py-10 md:py-14 max-w-4xl">
              <div className="flex items-start gap-6 flex-wrap md:flex-nowrap">
                <div className="relative flex-shrink-0">
                  <div
                    className="absolute -inset-2 rounded-full bg-gradient-to-br from-rw-gold/40 via-imigongo-ochre/40 to-imigongo-clay/40 blur-2xl"
                    aria-hidden="true"
                  />
                  <div className="relative w-24 h-24 md:w-28 md:h-28 rounded-full overflow-hidden ring-2 ring-rw-gold/40 shadow-2xl shadow-black/40 bg-imigongo-charcoal flex items-center justify-center">
                    {picture ? (
                      <img
                        src={picture}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="eager"
                        crossOrigin="anonymous"
                      />
                    ) : (
                      <ImigongoSeal size={56} colorClass="text-rw-gold/80" />
                    )}
                  </div>
                </div>

                <div className="flex-1 min-w-0 space-y-3">
                  <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-rw-gold font-semibold">
                    <span className="h-px w-6 bg-rw-gold" />
                    Composer
                  </p>
                  <h1 className="font-display text-3xl md:text-5xl font-medium tracking-tight leading-tight">
                    {personaConfig.name}
                  </h1>
                  {publicBio && (
                    <p className="text-imigongo-cream/80 max-w-2xl leading-relaxed">
                      {publicBio}
                    </p>
                  )}
                  {personaConfig.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1 items-center">
                      {personaConfig.tags.slice(0, 4).map((t) => (
                        <Badge
                          key={t}
                          variant="secondary"
                          className="text-[10px] bg-imigongo-cream/15 text-imigongo-cream border-0"
                        >
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-2">
                    {walletSeed ? (
                      <WalletBadge
                        wallet={wallet}
                        onClick={() => setWalletOpen(true)}
                      />
                    ) : null}
                    <PersonaActionsMenu
                      npub={npub}
                      backupEvent={persona.data!.event}
                      personaPubkey={personaConfig.pubkey}
                      personaName={personaConfig.name}
                      variant="inline"
                      publicFeedNpub={npub}
                      inverse
                    />
                  </div>
                </div>
              </div>
            </div>
            <FlagStripe height={4} />
          </section>
        ) : persona.isError ? (
          <section className="cream-wash py-12">
            <div className="container max-w-3xl">
              <Card className="border-dashed border-destructive/30 bg-destructive/5">
                <CardContent className="py-12 px-8 text-center text-muted-foreground space-y-2">
                  <p>
                    Couldn't decrypt this persona. Either it isn't yours, or your
                    signer rejected the decryption request.
                  </p>
                  <p className="text-xs">{String(persona.error)}</p>
                </CardContent>
              </Card>
            </div>
          </section>
        ) : (
          <section className="cream-wash py-12">
            <div className="container max-w-3xl">
              <Card className="border-dashed border-imigongo-clay/30">
                <CardContent className="py-12 px-8 text-center text-muted-foreground">
                  No persona found at this npub for your account. It may not
                  have published yet, or the relays haven't seen it.
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {/* Composer + feed body */}
        <div className="container py-10 max-w-4xl space-y-8">
          {personaConfig && !walletSeed ? (
            <Card className="border-dashed border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/20">
              <CardContent className="py-4 px-6 text-sm text-amber-900 dark:text-amber-200">
                This persona was created before wallets were wired. AI styling
                and image generation are disabled. Mint a new persona from the
                onboard wizard to enable them.
              </CardContent>
            </Card>
          ) : null}

          {personaConfig && (
            <Card className="border-imigongo-clay/20 bg-gradient-to-br from-card via-card to-rw-gold-soft/10 overflow-hidden">
              <div className="bg-gradient-to-r from-rw-sky/10 via-rw-gold/10 to-rw-green/10 px-6 py-4 border-b border-imigongo-clay/15 flex items-center gap-2">
                <Film className="size-5 text-imigongo-clay" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <h2 className="font-display text-2xl font-medium tracking-tight">
                    Compose a video
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Idea + sources + hints feed the AI prompt that
                    generates the persona's video. Text-only posting
                    is available as a fallback.
                  </p>
                </div>
              </div>
              <CardContent className="space-y-5 pt-5">
                {/* Idea — drives both the video script and the text fallback */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="composer-raw"
                      className="text-sm font-medium"
                    >
                      Idea
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
                    placeholder="What does the persona need to say? Drop the rawest version of your brief — Zuka turns it into a video script in the persona's voice."
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
                    className="resize-y min-h-[8rem] bg-background/60"
                  />
                </div>

                {/* Sources + style hints — feed the AI prompt */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="composer-sources"
                      className="text-sm font-medium"
                    >
                      Sources{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        (optional)
                      </span>
                    </label>
                    <Textarea
                      id="composer-sources"
                      rows={2}
                      value={sourcesInput}
                      onChange={(e) => setSourcesInput(e.target.value)}
                      placeholder="https://hrw.org/..., https://cpj.org/..."
                      className="text-sm bg-background/60 resize-none"
                    />
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Comma-separated URLs. Grounds the video script
                      and rides the published post as{" "}
                      <code className="font-mono">r</code> tags for
                      attribution.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="composer-hints"
                      className="text-sm font-medium"
                    >
                      Style hints{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        (optional)
                      </span>
                    </label>
                    <Textarea
                      id="composer-hints"
                      rows={2}
                      value={hintsInput}
                      onChange={(e) => setHintsInput(e.target.value)}
                      placeholder="measured, first-person, vertical 9:16"
                      className="text-sm bg-background/60 resize-none"
                    />
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Tone, framing, length. Steers the AI prompt for
                      both video script and visual direction.
                    </p>
                  </div>
                </div>

                {/* Cross-post indicator (read-only) */}
                {personaConfig.cross_post?.webhook_url && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rw-sky/25 bg-rw-sky/5 px-4 py-2.5 text-xs">
                    <span className="font-medium text-foreground">
                      Cross-post:
                    </span>
                    <span className="text-muted-foreground">
                      Will dispatch to your webhook
                    </span>
                    {(personaConfig.cross_post.webhook_platforms ?? [])
                      .length > 0 && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <div className="flex flex-wrap gap-1">
                          {(
                            personaConfig.cross_post.webhook_platforms ?? []
                          ).map((p) => (
                            <Badge
                              key={p}
                              variant="secondary"
                              className="text-[10px] bg-rw-sky/10 text-rw-sky border border-rw-sky/20"
                            >
                              {p}
                            </Badge>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Action row — primary 'Generate video' (disabled until
                    Jim's PPQ video → Blossom seam lands), secondary
                    'Publish text-only' fallback that ships the kind 1
                    immediately. "Style in voice" rewrites the idea
                    text using the persona's system prompt before
                    publish (PPQ chat completion). */}
                <div className="space-y-3 pt-1">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setRaw("");
                        setSourcesInput("");
                        setHintsInput("");
                      }}
                      disabled={
                        publish.isPending ||
                        crossPost.isPending ||
                        styling.isPending
                      }
                    >
                      Discard
                    </Button>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={onStyle}
                        disabled={
                          styling.isPending ||
                          publish.isPending ||
                          crossPost.isPending ||
                          !raw.trim() ||
                          !walletSeed
                        }
                        title={
                          !walletSeed
                            ? "Mint a new persona to enable AI styling"
                            : "Rewrite the idea in the persona's voice (PPQ chat)"
                        }
                      >
                        {styling.isPending ? (
                          <>
                            <Loader2
                              className="mr-2 size-4 animate-spin"
                              aria-hidden="true"
                            />
                            Styling…
                          </>
                        ) : (
                          <>
                            <Wand2
                              className="mr-2 size-4"
                              aria-hidden="true"
                            />
                            Style in voice
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={onPost}
                        disabled={
                          publish.isPending ||
                          crossPost.isPending ||
                          styling.isPending ||
                          !raw.trim()
                        }
                        title="Publish a text-only kind 1 note (no video)"
                      >
                        {publish.isPending || crossPost.isPending ? (
                          <>
                            <Loader2
                              className="mr-2 size-4 animate-spin"
                              aria-hidden="true"
                            />
                            Publishing…
                          </>
                        ) : (
                          <>
                            <FileText
                              className="mr-2 size-4"
                              aria-hidden="true"
                            />
                            Publish text-only
                          </>
                        )}
                      </Button>
                      <Button
                        disabled
                        className="shadow-lg shadow-primary/20"
                        title="Video generation lands once the PPQ video pipeline + Blossom upload seam ships"
                      >
                        <Sparkles
                          className="mr-2 size-4"
                          aria-hidden="true"
                        />
                        Generate video
                      </Button>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground text-right">
                    <span className="opacity-80">
                      Video generation arrives in the next build —
                      until then, the text-only fallback publishes
                      a clean kind 1 note grounded by your sources.
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent posts */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-medium tracking-tight">
                Recent posts
              </h2>
              <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                Live on relays
              </span>
            </div>
            {posts.isLoading ? (
              <PostListSkeleton count={2} />
            ) : posts.data && posts.data.length > 0 ? (
              <ul className="space-y-3">
                {posts.data.map((p) => (
                  <li key={p.id}>
                    <PostCard event={p} />
                  </li>
                ))}
              </ul>
            ) : (
              <Card className="border-dashed border-imigongo-clay/30 bg-gradient-to-br from-imigongo-cream/30 to-rw-gold-soft/10">
                <CardContent className="py-12 px-6 text-center text-muted-foreground space-y-3">
                  <ImigongoSeal
                    size={48}
                    colorClass="text-imigongo-clay/60"
                    className="mx-auto"
                  />
                  <p className="text-sm">
                    No posts yet. Compose the first one above.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      {walletSeed && personaConfig ? (
        <WalletDialog
          wallet={wallet}
          open={walletOpen}
          onOpenChange={setWalletOpen}
          personaName={personaConfig.name}
        />
      ) : null}
    </div>
  );
};

export default Dashboard;
