/**
 * Dashboard — the active persona's composer + recent feed.
 *
 * Compose workflow (Zuka pitch — "Step 02: Speak"):
 *   1. User drops in an Idea + optional Sources + optional Style hints.
 *   2. "Style in voice"  → PPQ chat rewrites the idea in the persona's voice.
 *   3. "Generate video"  → builds a video prompt from the styled brief, submits
 *      to PPQ (Veo 3 / Kling / Runway via usePpqVideo), polls until done, fetches
 *      the MP4, re-uploads to Blossom, then publishes a kind 1 with NIP-92
 *      imeta tags + source `r` tags + cross-post webhook dispatch.
 *   4. "Publish text-only" → fallback that ships the kind 1 immediately without
 *      video (used when wallet is empty or video gen is too slow).
 *
 * Ownership: Derek owns the composer shell; Jim owns the PPQ video pipeline
 * wiring (see tasks/derek-plan.md §"Video generation"). This file merges both
 * seams so the button is live for the first time.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import {
  CheckCircle2,
  FileText,
  Film,
  Loader2,
  Sparkles,
  Wand2,
  XCircle,
} from "lucide-react";

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
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/useToast";
import { useAuthor } from "@/hooks/useAuthor";
import { useCrossPost } from "@/hooks/useCrossPost";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePersona, usePersonaPosts } from "@/hooks/usePersona";
import { usePersonaPublish } from "@/hooks/usePersonaPublish";
import { usePpqInference, getInferenceText } from "@/hooks/usePpqInference";
import { usePpqVideoSubmit, usePpqVideoJob } from "@/hooks/usePpqVideo";
import { useUploadFile } from "@/hooks/useUploadFile";
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

/** Video generation progress phases shown to the user. */
type VideoPhase =
  | "idle"
  | "scripting"   // PPQ chat: turning the brief into a video prompt
  | "submitting"  // POST /v1/videos
  | "generating"  // polling until status === "completed"
  | "uploading"   // fetch MP4 → re-upload to Blossom
  | "publishing"  // usePersonaPublish + optional cross-post
  | "done"
  | "error";

const VIDEO_PHASE_LABELS: Record<VideoPhase, string> = {
  idle: "",
  scripting: "Writing video script…",
  submitting: "Submitting to AI video engine…",
  generating: "Generating video — this takes 1–3 minutes…",
  uploading: "Uploading to decentralised storage…",
  publishing: "Publishing to relays…",
  done: "Video published!",
  error: "Video generation failed",
};

/** Rough progress % per phase (for the progress bar). */
const VIDEO_PHASE_PCT: Record<VideoPhase, number> = {
  idle: 0,
  scripting: 10,
  submitting: 20,
  generating: 60,
  uploading: 80,
  publishing: 90,
  done: 100,
  error: 0,
};

const Dashboard = () => {
  const { npub = "" } = useParams();
  useSeoMeta({ title: "Dashboard — Zuka" });

  const { user } = useCurrentUser();
  const { toast } = useToast();
  const persona = usePersona(npub);
  const posts = usePersonaPosts(npub, 20);
  const publish = usePersonaPublish();
  const crossPost = useCrossPost();
  const uploadFile = useUploadFile();

  // Composer fields.
  const [raw, setRaw] = useState("");
  const [sourcesInput, setSourcesInput] = useState("");
  const [hintsInput, setHintsInput] = useState("");
  const [walletOpen, setWalletOpen] = useState(false);

  // Video generation state machine.
  const [videoPhase, setVideoPhase] = useState<VideoPhase>("idle");
  const [videoError, setVideoError] = useState<string | null>(null);
  // The PPQ job id we're polling.
  const [videoJobId, setVideoJobId] = useState<string | undefined>(undefined);
  // Abort controller so the user can cancel mid-flight.
  const abortRef = useRef<AbortController | null>(null);

  const personaHex = useMemo(() => npubToHex(npub), [npub]);
  const author = useAuthor(personaHex ?? undefined);
  const publicBio = author.data?.metadata?.about ?? "";
  const picture = author.data?.metadata?.picture;

  const envelope = persona.data?.envelope ?? null;
  const personaConfig = envelope?.persona ?? null;
  const walletSeed = envelope?.wallet?.seed;
  const stylingModel =
    envelope?.model_prefs?.agent ?? "anthropic/claude-sonnet-4.5";

  const wallet = useWallet({ mnemonic: walletSeed });
  const styling = usePpqInference();
  const videoSubmit = usePpqVideoSubmit();

  // Poll the video job while videoJobId is set and we're still generating.
  const videoJob = usePpqVideoJob(
    videoPhase === "generating" ? videoJobId : undefined,
  );

  // When the video job completes, advance the pipeline.
  const handleVideoJobDone = useCallback(async () => {
    if (!videoJob.data || videoJob.data.status !== "completed") return;
    const videoUrl = videoJob.data.data?.url;
    if (!videoUrl) {
      setVideoPhase("error");
      setVideoError("Video job completed but returned no URL.");
      return;
    }

    try {
      setVideoPhase("uploading");

      // Fetch the MP4 from PPQ's signed URL and re-upload to Blossom so it
      // lives on the decentralised network (no PPQ URL in the final event).
      const mp4Res = await fetch(videoUrl, {
        signal: abortRef.current?.signal,
      });
      if (!mp4Res.ok) throw new Error(`Fetch MP4 failed (${mp4Res.status})`);
      const blob = await mp4Res.blob();
      const file = new File([blob], "video.mp4", { type: "video/mp4" });

      // useUploadFile returns NIP-92 imeta tags straight from Blossom.
      const imetaTags = await uploadFile.mutateAsync(file);

      setVideoPhase("publishing");

      const sources = sourcesInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const template = buildPersonaPostTemplate({
        text: raw,
        tags: personaConfig!.tags,
        sources,
        // Merge in the imeta tags that came back from Blossom.
        extraTags: imetaTags,
      });

      const signed = await publish.mutateAsync({
        personaNsec: personaConfig!.nsec,
        template,
      });

      // Cross-post (non-fatal).
      if (personaConfig!.cross_post?.webhook_url) {
        try {
          await crossPost.mutateAsync({
            persona: personaConfig!,
            event: signed,
          });
          toast({
            title: "Video published",
            description:
              "Live on relays and dispatched to your cross-post webhook.",
          });
        } catch (e) {
          toast({
            title: "Cross-post failed",
            description:
              e instanceof Error
                ? `Video on relays, but the webhook returned: ${e.message}`
                : "Video on relays, but the cross-post webhook didn't accept the event.",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Video published",
          description: "Live on relays.",
        });
      }

      setVideoPhase("done");
      setRaw("");
      setSourcesInput("");
      setHintsInput("");
      setVideoJobId(undefined);
      posts.refetch();
      wallet.refreshPpqBalance();
      wallet.refreshInfo();
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setVideoPhase("error");
      setVideoError(e instanceof Error ? e.message : "Unknown error");
    }
  }, [
    videoJob.data,
    sourcesInput,
    raw,
    personaConfig,
    publish,
    crossPost,
    uploadFile,
    toast,
    posts,
    wallet,
  ]);

  // React to job completion.
  useMemo(() => {
    if (videoJob.isTerminal && videoJob.data?.status === "completed") {
      handleVideoJobDone();
    }
    if (videoJob.isTerminal && videoJob.data?.status === "failed") {
      setVideoPhase("error");
      setVideoError(
        videoJob.data?.error ?? "Video generation failed on the AI engine.",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoJob.isTerminal, videoJob.data?.status]);

  /** Rewrite the idea textarea in the persona's voice via PPQ chat. */
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
      const styled = getInferenceText(res);
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

  /** Publish text-only (no video). Sources ride as `r` tags. */
  async function onPost() {
    if (!personaConfig || !user || !raw.trim()) return;
    try {
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

      if (personaConfig.cross_post?.webhook_url) {
        try {
          await crossPost.mutateAsync({ persona: personaConfig, event: signed });
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

  /**
   * Full video pipeline:
   *   brief → PPQ chat script → PPQ video submit → poll → fetch → Blossom →
   *   kind 1 with imeta → cross-post.
   */
  async function onGenerateVideo() {
    if (!personaConfig || !user || !raw.trim() || !walletSeed) return;
    abortRef.current = new AbortController();

    try {
      // ── Step 1: Turn the brief into a focused video prompt ──────────
      setVideoPhase("scripting");
      setVideoError(null);

      const hints = hintsInput.trim();
      const sources = sourcesInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const scriptSystemPrompt = [
        personaConfig.system_prompt,
        "You are writing a short-form video script (30–60 seconds, spoken first-person).",
        hints ? `Style guidance: ${hints}` : "",
        sources.length
          ? `Draw on these sources: ${sources.join(", ")}`
          : "",
        "Return only the final narration script — no scene directions, no labels.",
      ]
        .filter(Boolean)
        .join("\n");

      const scriptRes = await styling.mutateAsync({
        model: stylingModel,
        messages: [
          { role: "system", content: scriptSystemPrompt },
          { role: "user", content: raw },
        ],
      });
      const videoScript = getInferenceText(scriptRes).trim() || raw;

      // ── Step 2: Build the video generation prompt ────────────────────
      //   We give the AI engine the narration + persona visual identity.
      const referenceImage =
        author.data?.metadata?.picture ?? personaConfig.picture;
      const videoPrompt = [
        videoScript,
        referenceImage
          ? `Persona reference image: ${referenceImage}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      // Derive aspect ratio from hints (default portrait for social).
      const aspectRatio: "9:16" | "16:9" | "1:1" =
        /16:9/.test(hints)
          ? "16:9"
          : /1:1/.test(hints)
          ? "1:1"
          : "9:16";

      // ── Step 3: Submit the video job to PPQ ──────────────────────────
      setVideoPhase("submitting");

      const job = await videoSubmit.mutateAsync({
        model: "veo3-fast",
        prompt: videoPrompt,
        aspect_ratio: aspectRatio,
      });

      setVideoJobId(job.id);
      setVideoPhase("generating");
      // usePpqVideoJob polls automatically from here; handleVideoJobDone
      // picks up when the job terminates.
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setVideoPhase("idle");
        return;
      }
      setVideoPhase("error");
      setVideoError(e instanceof Error ? e.message : "Unknown error");
      toast({
        title: "Video generation failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  function onCancelVideo() {
    abortRef.current?.abort();
    setVideoPhase("idle");
    setVideoError(null);
    setVideoJobId(undefined);
  }

  function onResetAfterError() {
    setVideoPhase("idle");
    setVideoError(null);
    setVideoJobId(undefined);
  }

  const isVideoRunning =
    videoPhase === "scripting" ||
    videoPhase === "submitting" ||
    videoPhase === "generating" ||
    videoPhase === "uploading" ||
    videoPhase === "publishing";

  const anyPending =
    publish.isPending ||
    crossPost.isPending ||
    styling.isPending ||
    isVideoRunning;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader />

      <main id="main-content" className="flex-1">
        {/* Persona cover header */}
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
                and video generation are disabled. Mint a new persona from the
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
                    Drop in your brief — Zuka writes the script, generates a
                    persona-signed video, and publishes everywhere at once.
                  </p>
                </div>
              </div>

              <CardContent className="space-y-5 pt-5">
                {/* ── Idea ─────────────────────────────────────────── */}
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
                        !anyPending
                      ) {
                        e.preventDefault();
                        onPost();
                      }
                    }}
                    className="resize-y min-h-[8rem] bg-background/60"
                    disabled={anyPending}
                  />
                </div>

                {/* ── Sources + Style hints ─────────────────────────── */}
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
                      disabled={anyPending}
                    />
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Comma-separated URLs. Grounds the script and rides the
                      published post as{" "}
                      <code className="font-mono">r</code> tags.
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
                      disabled={anyPending}
                    />
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Tone, framing, aspect ratio (16:9 / 9:16 / 1:1). Steers
                      both the script and the video generation prompt.
                    </p>
                  </div>
                </div>

                {/* ── Cross-post indicator ──────────────────────────── */}
                {personaConfig.cross_post?.webhook_url && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rw-sky/25 bg-rw-sky/5 px-4 py-2.5 text-xs">
                    <span className="font-medium text-foreground">
                      Cross-post:
                    </span>
                    <span className="text-muted-foreground">
                      Will dispatch to your webhook
                    </span>
                    {(personaConfig.cross_post.webhook_platforms ?? []).length >
                      0 && (
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

                {/* ── Video pipeline progress ───────────────────────── */}
                {videoPhase !== "idle" && (
                  <div
                    className={`rounded-lg border px-4 py-3 space-y-2 text-sm ${
                      videoPhase === "error"
                        ? "border-destructive/40 bg-destructive/5"
                        : videoPhase === "done"
                        ? "border-rw-green/40 bg-rw-green/5"
                        : "border-rw-gold/30 bg-rw-gold/5"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {videoPhase === "done" ? (
                        <CheckCircle2 className="size-4 text-rw-green flex-shrink-0" />
                      ) : videoPhase === "error" ? (
                        <XCircle className="size-4 text-destructive flex-shrink-0" />
                      ) : (
                        <Loader2 className="size-4 animate-spin text-rw-gold flex-shrink-0" />
                      )}
                      <span
                        className={
                          videoPhase === "error"
                            ? "text-destructive"
                            : videoPhase === "done"
                            ? "text-rw-green font-medium"
                            : "text-foreground"
                        }
                      >
                        {VIDEO_PHASE_LABELS[videoPhase]}
                      </span>
                      {isVideoRunning && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-6 px-2 text-xs text-muted-foreground"
                          onClick={onCancelVideo}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                    {isVideoRunning && (
                      <Progress
                        value={VIDEO_PHASE_PCT[videoPhase]}
                        className="h-1"
                      />
                    )}
                    {videoPhase === "error" && videoError && (
                      <p className="text-xs text-destructive/80">{videoError}</p>
                    )}
                  </div>
                )}

                {/* ── Action row ────────────────────────────────────── */}
                <div className="space-y-3 pt-1">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setRaw("");
                        setSourcesInput("");
                        setHintsInput("");
                        if (videoPhase === "error" || videoPhase === "done") {
                          onResetAfterError();
                        }
                      }}
                      disabled={anyPending}
                    >
                      Discard
                    </Button>
                    <div className="flex flex-wrap gap-2">
                      {/* Style in voice */}
                      <Button
                        variant="outline"
                        onClick={onStyle}
                        disabled={
                          styling.isPending ||
                          anyPending ||
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

                      {/* Publish text-only */}
                      <Button
                        variant="outline"
                        onClick={onPost}
                        disabled={anyPending || !raw.trim()}
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

                      {/* Generate video — primary CTA, now live */}
                      {videoPhase === "error" ? (
                        <Button
                          variant="outline"
                          onClick={onResetAfterError}
                          className="border-destructive/40 text-destructive"
                        >
                          <XCircle className="mr-2 size-4" aria-hidden="true" />
                          Try again
                        </Button>
                      ) : videoPhase === "done" ? (
                        <Button
                          variant="outline"
                          onClick={onResetAfterError}
                          className="border-rw-green/40 text-rw-green"
                        >
                          <CheckCircle2
                            className="mr-2 size-4"
                            aria-hidden="true"
                          />
                          New post
                        </Button>
                      ) : (
                        <Button
                          onClick={onGenerateVideo}
                          disabled={
                            anyPending ||
                            !raw.trim() ||
                            !walletSeed
                          }
                          className="shadow-lg shadow-primary/20"
                          title={
                            !walletSeed
                              ? "Mint a new persona (with a wallet) to enable video generation"
                              : "Generate a persona-signed video and publish everywhere"
                          }
                        >
                          {isVideoRunning ? (
                            <>
                              <Loader2
                                className="mr-2 size-4 animate-spin"
                                aria-hidden="true"
                              />
                              Generating…
                            </>
                          ) : (
                            <>
                              <Sparkles
                                className="mr-2 size-4"
                                aria-hidden="true"
                              />
                              Generate video
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground text-right">
                    <kbd className="font-mono px-1 py-0.5 rounded bg-muted border border-border text-[10px]">
                      ⌘ Enter
                    </kbd>{" "}
                    publishes text-only.{" "}
                    <span className="opacity-70">
                      Video gen uses Veo 3 via PPQ — ~1–3 min, ~$0.50–$2 per
                      clip.
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
