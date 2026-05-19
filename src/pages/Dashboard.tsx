/**
 * Dashboard — the active persona's composer + recent feed.
 *
 * The composer publishes raw text directly. AI styling (PPQ), image
 * generation, and the wallet/cost layer are Jim's surface area and
 * land separately on this page when they're ready.
 */

import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { X } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { FlagStripe, ImigongoSeal } from "@/components/ImigongoBand";
import { PersonaActionsMenu } from "@/components/PersonaActionsMenu";
import { DashboardComposerCard } from "@/components/persona/DashboardComposerCard";
import { PersonaHero } from "@/components/persona/PersonaHero";
import { PostWizardDialog } from "@/components/persona/PostWizardDialog";
import { PostCard } from "@/components/PostCard";
import { PostListSkeleton } from "@/components/Skeletons";
import { VideoComposerDialog } from "@/components/VideoComposerDialog";
import { WalletBadge } from "@/components/wallet/WalletBadge";
import { WalletDialog } from "@/components/wallet/WalletDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { impactLight, notificationError, notificationSuccess } from "@/lib/haptics";
import { useToast } from "@/hooks/useToast";
import { useAuthor } from "@/hooks/useAuthor";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePageMeta } from "@/hooks/usePageMeta";
import { usePersonaComposer } from "@/hooks/usePersonaComposer";
import { usePersonaPpqAccountOptions } from "@/hooks/usePersonaPpqAccountOptions";
import { usePersona, usePersonaPosts } from "@/hooks/usePersona";
import { useOperatorWallet } from "@/hooks/useOperatorWallet";
import { useWallet } from "@/hooks/useWallet";
import { useUpdateWalletAutoTopup } from "@/hooks/useUpdateWalletAutoTopup";
import { featureFlags } from "@/lib/features";
import { npubToHex } from "@/lib/nostrIds";
import { sanitizeHttpsUrl } from "@/lib/url";
import { autoTopupConfigFromPersisted } from "@/lib/wallet/types";

const Dashboard = () => {
  const { npub = "" } = useParams();
  usePageMeta({ title: "Dashboard — Zuka" });
  const crossPostEnabled = featureFlags.crossPost;

  const { user } = useCurrentUser();
  const { toast } = useToast();
  const persona = usePersona(npub);
  const posts = usePersonaPosts(npub, 20);
  const updateWalletAutoTopup = useUpdateWalletAutoTopup();
  const operatorWallet = useOperatorWallet();

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
  const picture = sanitizeHttpsUrl(author.data?.metadata?.picture);

  const [raw, setRaw] = useState("");
  const [postWizardOpen, setPostWizardOpen] = useState(false);
  // Open state for the video composer modal. Mounted alongside the
  // Generate video button so it carries the current `raw` / sources /
  // hints when launched.
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const missingDonateDismissKey = `zuka:missing-ln-address:${npub}`;
  const [dismissedDonateKeys, setDismissedDonateKeys] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const donateNudgeDismissed =
    dismissedDonateKeys.has(missingDonateDismissKey) ||
    (typeof window !== "undefined" &&
      window.sessionStorage.getItem(missingDonateDismissKey) === "1");

  const envelope = persona.data?.envelope ?? null;
  const personaConfig = envelope?.persona ?? null;
  // Persona wallets are NOT subject to env override — donations go to
  // each persona's own wallet, always. Dev-only operator wallet / PPQ
  // pins are handled by the operator hooks, never the persona wallet.
  const walletSeed = envelope?.wallet?.seed;
  const walletAutoTopup = useMemo(
    () => autoTopupConfigFromPersisted(envelope?.wallet?.auto_topup),
    [envelope?.wallet?.auto_topup],
  );
  const refetchPersonaEnvelope = useCallback(async () => {
    const refreshed = await persona.refetch();
    return refreshed.data?.envelope ?? null;
  }, [persona.refetch]);
  const ppqAccountOptions = usePersonaPpqAccountOptions({
    npub,
    backupEvent: persona.data?.event,
    envelope,
    isLoading: persona.isLoading,
    refetchEnvelope: refetchPersonaEnvelope,
  });
  const stylingModel =
    envelope?.model_prefs?.agent ?? "anthropic/claude-sonnet-4.5";
  const operatorFundingWallet = useMemo(
    () => ({
      handle: operatorWallet.wallet.handle,
      walletId:
        user?.pubkey && operatorWallet.seed
          ? `operator:${user.pubkey}`
          : undefined,
      label: "Operator",
      refreshInfo: operatorWallet.wallet.refreshInfo,
      refreshPayments: operatorWallet.wallet.refreshPayments,
      isConnecting: operatorWallet.wallet.isConnecting,
    }),
    [
      operatorWallet.wallet.handle,
      operatorWallet.wallet.refreshInfo,
      operatorWallet.wallet.refreshPayments,
      operatorWallet.wallet.isConnecting,
      operatorWallet.seed,
      user?.pubkey,
    ],
  );

  const wallet = useWallet({
    walletId: personaConfig ? `persona:${personaConfig.pubkey}` : undefined,
    mnemonic: walletSeed,
    autoTopup: walletAutoTopup,
    operatorFundingWallet,
    ppqAccountOptions,
  });
  const showDonateHandleNudge =
    Boolean(personaConfig && walletSeed) &&
    !wallet.isInfoLoading &&
    !wallet.info?.lightningAddress &&
    !donateNudgeDismissed;

  const composer = usePersonaComposer({
    persona: personaConfig,
    stylingModel,
    crossPostEnabled,
    wallet,
    ppqAccountOptions,
    onPublished: () => {
      posts.refetch();
    },
  });

  async function onStyle() {
    try {
      const styled = await composer.styleInVoice(raw);
      if (styled) setRaw(styled);
    } catch (e) {
      toast({
        title: "Styling failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  async function onPost() {
    impactLight();
    try {
      const result = await composer.publishTextOnly({
        text: raw,
        sourcesInput,
      });
      if (!result) return;

      if (result.crossPost === "sent") {
        notificationSuccess();
        toast({
          title: "Published",
          description: "Live on relays and dispatched to your cross-post webhook.",
        });
      } else if (result.crossPost === "failed") {
        notificationError();
        toast({
          title: "Cross-post failed",
          description: `Posted to relays, but the webhook returned: ${
            result.crossPostError?.message ?? "Unknown error"
          }`,
          variant: "destructive",
        });
      } else {
        notificationSuccess();
        toast({ title: "Published", description: "Post is live on relays." });
      }

      setRaw("");
      setSourcesInput("");
      setHintsInput("");
    } catch (e) {
      notificationError();
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
          <PersonaHero
            name={personaConfig.name}
            bio={publicBio || undefined}
            pictureUrl={picture ?? null}
            avatarSize="dashboard"
            actions={
              <div className="flex items-center gap-2 pt-2">
                {walletSeed ? (
                  <WalletBadge
                    wallet={wallet}
                    onClick={() => setWalletOpen(true)}
                    inverse
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
            }
          />
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
                and image generation are disabled. Create a new persona from the
                onboard wizard to enable them.
              </CardContent>
            </Card>
          ) : null}

          {showDonateHandleNudge ? (
            <Card className="border-rw-sky/30 bg-rw-sky/5">
              <CardContent className="py-4 px-6">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm text-foreground">
                    No public donate handle yet —{" "}
                    <Link
                      to={`/dashboard/${npub}/edit`}
                      className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
                    >
                      claim a username on Edit persona
                    </Link>{" "}
                    to enable zaps.
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="-my-2 -mr-2 size-8 shrink-0"
                    aria-label="Dismiss donate handle notice"
                    onClick={() => {
                      window.sessionStorage.setItem(
                        missingDonateDismissKey,
                        "1",
                      );
                      setDismissedDonateKeys((prev) => {
                        const next = new Set(prev);
                        next.add(missingDonateDismissKey);
                        return next;
                      });
                    }}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {personaConfig && (
            <DashboardComposerCard
              personaName={personaConfig.name}
              personaBio={publicBio}
              raw={raw}
              sourcesInput={sourcesInput}
              hintsInput={hintsInput}
              crossPostEnabled={crossPostEnabled}
              crossPost={personaConfig.cross_post}
              walletSeed={walletSeed}
              ppqAccountOptions={ppqAccountOptions}
              isPublishing={composer.isPublishing}
              isStyling={composer.isStyling}
              onRawChange={setRaw}
              onSourcesInputChange={setSourcesInput}
              onHintsInputChange={setHintsInput}
              onDiscard={() => {
                setRaw("");
                setSourcesInput("");
                setHintsInput("");
              }}
              onStyle={onStyle}
              onOpenPostWizard={() => setPostWizardOpen(true)}
              onPost={onPost}
              onOpenVideo={() => setVideoDialogOpen(true)}
              // Research-panel injection: append to the existing
              // sources field (comma-separated, becomes `r` tags) and
              // to the idea textarea (the styling pass rewrites it in
              // voice). Both helpers dedupe so re-clicking the same
              // result doesn't duplicate.
              onAppendSource={(url) =>
                setSourcesInput((prev) => appendSourceUrls(prev, [url]))
              }
              onAppendIdea={(text) =>
                setRaw((prev) =>
                  prev.includes(text)
                    ? prev
                    : prev.trim().length === 0
                      ? text
                      : `${prev.trimEnd()}\n\n${text}`,
                )
              }
            />
          )}

          {/* Recent posts */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-medium tracking-tight">
                Recent posts
              </h2>
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

      {personaConfig && (
        <VideoComposerDialog
          open={videoDialogOpen}
          onOpenChange={setVideoDialogOpen}
          persona={personaConfig}
          idea={raw}
          sourcesInput={sourcesInput}
          hintsInput={hintsInput}
          personaAvatarUrl={picture ?? undefined}
          ppqAccountOptions={ppqAccountOptions}
          onPublished={() => {
            posts.refetch();
            setRaw("");
            setSourcesInput("");
            setHintsInput("");
          }}
        />
      )}
      {personaConfig ? (
        <PostWizardDialog
          key={`${npub}:${postWizardOpen ? "open" : "closed"}`}
          open={postWizardOpen}
          onOpenChange={setPostWizardOpen}
          persona={personaConfig}
          model={stylingModel}
          walletSeed={walletSeed}
          ppqAccountOptions={ppqAccountOptions}
          onUseDraft={(draft, sourceUrls) => {
            setRaw(draft);
            setSourcesInput((prev) => appendSourceUrls(prev, sourceUrls));
            wallet.refreshPpqBalance();
            wallet.refreshInfo();
          }}
        />
      ) : null}
      {walletSeed && personaConfig && envelope ? (
        <WalletDialog
          wallet={wallet}
          open={walletOpen}
          onOpenChange={setWalletOpen}
          personaName={personaConfig.name}
          editPersonaHref={`/dashboard/${npub}/edit`}
          onAutoTopupSave={(autoTopup) =>
            updateWalletAutoTopup.mutateAsync({
              npub,
              backupEvent: persona.data!.event,
              envelope,
              autoTopup,
            })
          }
        />
      ) : null}
    </div>
  );
};

export default Dashboard;

function appendSourceUrls(current: string, urls: string[]): string {
  const existing = current
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  const seen = new Set(existing.map((url) => url.toLowerCase()));
  const next = [...existing];

  for (const url of urls) {
    const trimmed = url.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    next.push(trimmed);
    seen.add(trimmed.toLowerCase());
  }

  return next.join(", ");
}
