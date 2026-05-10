/**
 * Multi-step modal driving the persona's video generation pipeline.
 *
 * Mounts on the Dashboard and consumes `useGenerateVideoPipeline`.
 * Each value of `phase.type` maps to a render block; the user moves
 * forward via dedicated buttons (regenerate preview, confirm + pick
 * duration, post). Cancellation is the dialog's "X" button.
 *
 * Styling follows the Dashboard's hero language: rw-gold accents,
 * imigongo-cream surfaces, charcoal mat for the loading state.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ImageIcon,
  Loader2,
  RefreshCcw,
  Sparkles,
  Wand2,
} from "lucide-react";
import { nip19 } from "nostr-tools";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/useToast";
import {
  useGenerateVideoPipeline,
  type GenerationPhase,
} from "@/hooks/useGenerateVideoPipeline";
import {
  findResumableForPersona,
  type ChainSummary,
} from "@/lib/video/chainStore";
import { postToTwitterIntent } from "@/lib/twitter/intent";
import type { Persona } from "@/lib/persona";
import { BrandedVideo } from "@/components/BrandedVideo";
import { XLogo } from "@/components/icons/XLogo";

const DURATION_MIN_SECS = 10;
const DURATION_MAX_SECS = 120;
const DURATION_STEP_SECS = 10;
const DURATION_DEFAULT_SECS = 20;
/** localStorage key for persisting the user's last picked duration. */
const DURATION_STORAGE_KEY = "phoenix:video:lastDurationSecs";
const COST_PER_CLIP_USD = 1; // seedance-2-fast 10s clip
const SEGMENT_SECS = 10;

export interface VideoComposerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  persona: Persona;
  /** The Dashboard "Idea" textarea content. */
  idea: string;
  /** Comma-separated source URLs from the Dashboard. */
  sourcesInput: string;
  /** The Dashboard "Style hints" textarea content. */
  hintsInput: string;
  /** Persona's avatar — feeds the grok-imagine-edit preview as `image_url`. */
  personaAvatarUrl?: string;
  /** Called once a kind 1 has been published; Dashboard refetches posts. */
  onPublished?: () => void;
}

export function VideoComposerDialog(props: VideoComposerDialogProps) {
  const {
    open,
    onOpenChange,
    persona,
    idea,
    sourcesInput,
    hintsInput,
    personaAvatarUrl,
    onPublished,
  } = props;
  const { toast } = useToast();

  const sources = useMemo(
    () =>
      sourcesInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [sourcesInput],
  );

  const pipeline = useGenerateVideoPipeline({
    persona,
    idea,
    sources,
    hints: hintsInput,
    personaAvatarUrl,
  });
  const { phase } = pipeline;

  // If the user has a checkpointed chain for this persona, ask them
  // whether to resume before kicking off a fresh preview.
  const [resumable, setResumable] = useState<ChainSummary | null>(null);
  const [resumeChecked, setResumeChecked] = useState(false);
  // True iff the user picked Resume (we suppress auto-preview); false
  // for Start-fresh / no-resumable-found (we DO auto-fire preview).
  const [resumeDispatched, setResumeDispatched] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void findResumableForPersona(persona.pubkey).then((r) => {
      if (cancelled) return;
      setResumable(r);
      setResumeChecked(true);
    });
    return () => {
      cancelled = true;
      setResumeChecked(false);
      setResumable(null);
      setResumeDispatched(false);
    };
  }, [open, persona.pubkey]);

  // Auto-fire preview generation only AFTER we've checked for resumes
  // and there isn't a pending one. If the user clicked Resume, suppress
  // — `runFromRecord` is owning the phase transitions.
  useEffect(() => {
    if (!open) return;
    if (!resumeChecked) return;
    if (resumable) return;
    if (resumeDispatched) return;
    if (phase.type !== "idle") return;
    if (!idea.trim()) return;
    void pipeline.generatePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resumeChecked, resumable, resumeDispatched]);

  const handleClose = (next: boolean) => {
    if (!next) {
      pipeline.cancel();
      pipeline.reset();
    }
    onOpenChange(next);
  };

  // Notify Dashboard once we land on `done`.
  useEffect(() => {
    if (phase.type === "done") {
      onPublished?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.type]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90dvh] p-0 gap-0 overflow-hidden rounded-2xl overflow-y-auto">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-imigongo-clay/15 bg-gradient-to-r from-rw-sky/5 via-rw-gold/10 to-rw-green/5">
          <DialogTitle className="font-display text-2xl font-medium tracking-tight">
            <span className="inline-flex items-center gap-2">
              <Sparkles className="size-5 text-imigongo-clay" aria-hidden="true" />
              Compose a video
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {persona.name} · last-frame chain via Seedance · published as
            kind 1 with imeta
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5 min-h-[20rem]">
          {resumable && phase.type === "idle" ? (
            <ResumePrompt
              summary={resumable}
              onResume={() => {
                const id = resumable.chainId;
                setResumeDispatched(true);
                setResumable(null);
                void pipeline.resume(id);
              }}
              onDiscard={() => {
                const id = resumable.chainId;
                setResumable(null);
                void pipeline.discardCheckpoint(id);
              }}
            />
          ) : (
            <PhaseView
              phase={phase}
              personaAvatarUrl={personaAvatarUrl}
              onRegeneratePreview={() => void pipeline.generatePreview()}
              onConfirmDuration={(dur) =>
                void pipeline.confirmAndGenerate(dur)
              }
              onPublish={(caption) => void pipeline.publish(caption)}
              onResume={(id) => void pipeline.resume(id)}
              onDiscardCheckpoint={(id) =>
                void pipeline.discardCheckpoint(id)
              }
              onCopyEventId={(id) => {
                navigator.clipboard
                  .writeText(nip19.noteEncode(id))
                  .then(() =>
                    toast({
                      title: "Copied",
                      description: "Event note id on the clipboard",
                    }),
                  )
                  .catch(() => undefined);
              }}
              onClose={() => handleClose(false)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- per-phase render ---------- */

function PhaseView(props: {
  phase: GenerationPhase;
  personaAvatarUrl?: string;
  onRegeneratePreview: () => void;
  onConfirmDuration: (durationSecs: number) => void;
  onPublish: (caption: string) => void;
  onResume: (chainId: string) => void;
  onDiscardCheckpoint: (chainId: string) => void;
  onCopyEventId: (eventId: string) => void;
  onClose: () => void;
}) {
  const {
    phase,
    personaAvatarUrl,
    onRegeneratePreview,
    onConfirmDuration,
    onPublish,
    onResume,
    onDiscardCheckpoint,
    onCopyEventId,
    onClose,
  } = props;

  switch (phase.type) {
    case "idle":
      return (
        <Centered>
          <p className="text-muted-foreground text-sm">
            Type an idea on the Dashboard, then click Generate video.
          </p>
        </Centered>
      );

    case "preview-generating":
      return (
        <BusyBlock
          title="Drawing a preview frame…"
          subtitle="grok-imagine-edit with the persona's avatar as input. ~10s."
        />
      );

    case "preview-ready":
      return (
        <PreviewStep
          previewUrl={phase.previewUrl}
          avatarUrl={personaAvatarUrl}
          onRegenerate={onRegeneratePreview}
          onConfirm={onConfirmDuration}
        />
      );

    case "uploading-seed":
      return (
        <BusyBlock
          title="Uploading seed frame to Blossom…"
          subtitle="Anchors the chain so every clip starts from the same face."
          previewUrl={phase.previewUrl}
        />
      );

    case "scripting":
      return (
        <BusyBlock
          title="Writing the script…"
          subtitle="Claude Sonnet 4.5 splits your idea into 10s segments."
          previewUrl={phase.previewUrl}
        />
      );

    case "clip-generating":
      return (
        <ClipChainProgress
          segments={phase.segments}
          currentIndex={phase.currentIndex}
          currentStatus={phase.currentStatus}
          completedCount={phase.completedClips.length}
          previewUrl={phase.previewUrl}
        />
      );

    case "stitching":
      return (
        <BusyBlock
          title="Stitching clips into one video…"
          subtitle="ffmpeg.wasm concat. First run downloads ~30 MB; subsequent runs are instant."
          progressRatio={phase.ratio}
        />
      );

    case "uploading-stitched":
      return (
        <BusyBlock
          title="Uploading the stitched video to Blossom…"
          subtitle="One stable URL the kind 1 will reference forever."
        />
      );

    case "captioning":
      return (
        <BusyBlock
          title="Drafting the post caption…"
          subtitle="You'll be able to edit it before publishing."
        />
      );

    case "ready-to-post":
      return (
        <ReadyToPostStep
          stitchedUrl={phase.stitchedUrl}
          captionDraft={phase.captionDraft}
          onPublish={onPublish}
        />
      );

    case "publishing":
      return (
        <BusyBlock
          title="Publishing to Nostr…"
          subtitle="Signing as the persona and dispatching to relays."
        />
      );

    case "done":
      return (
        <DoneStep
          stitchedUrl={phase.stitchedUrl}
          eventId={phase.eventId}
          caption={phase.caption}
          onCopyEventId={onCopyEventId}
          onClose={onClose}
        />
      );

    case "error":
      return (
        <ErrorBlock
          message={phase.message}
          cause={phase.cause}
          resumableChainId={phase.resumableChainId}
          resumableCompletedClips={phase.resumableCompletedClips}
          resumableTotalClips={phase.resumableTotalClips}
          onRetry={onRegeneratePreview}
          onResume={onResume}
          onDiscardCheckpoint={onDiscardCheckpoint}
        />
      );
  }
}

function ResumePrompt(props: {
  summary: ChainSummary;
  onResume: () => void;
  onDiscard: () => void;
}) {
  const { summary, onResume, onDiscard } = props;
  // Lazy initializer runs once on mount — fine for an "X minutes ago" snapshot.
  const [ageMin] = useState(() =>
    Math.max(1, Math.round((Date.now() - summary.updatedAt) / 60000)),
  );
  const phaseLabel = summary.hasCaption
    ? "ready to publish"
    : summary.hasStitchedUrl
      ? "stitched + uploaded; needs caption"
      : summary.hasStitched
        ? "stitched; needs Blossom upload"
        : summary.totalSegments > 0
          ? `clip ${summary.completedClips}/${summary.totalSegments} done`
          : "script not yet ready";

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-rw-gold font-semibold pb-1">
          Resume?
        </p>
        <h3 className="font-display text-xl font-medium tracking-tight">
          You have an unfinished video for {summary.personaName}
        </h3>
        <p className="text-xs text-muted-foreground pt-1">
          Last activity {ageMin}m ago · {phaseLabel}.
        </p>
      </div>
      <div className="rounded-md border border-imigongo-clay/20 bg-imigongo-cream/30 p-3 text-xs space-y-1">
        <div>
          <span className="text-muted-foreground">Idea:</span>{" "}
          <span className="line-clamp-3">{summary.idea}</span>
        </div>
        {summary.totalSegments > 0 && (
          <div>
            <span className="text-muted-foreground">Progress:</span>{" "}
            {summary.completedClips}/{summary.totalSegments} clips already paid
            for
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onDiscard}>
          Start fresh
        </Button>
        <Button onClick={onResume} className="shadow-md shadow-primary/20">
          <RefreshCcw className="size-4 mr-2" aria-hidden="true" />
          Resume
        </Button>
      </div>
    </div>
  );
}

/* ---------- step components ---------- */

function PreviewStep(props: {
  previewUrl: string;
  avatarUrl?: string;
  onRegenerate: () => void;
  onConfirm: (durationSecs: number) => void;
}) {
  const { previewUrl, avatarUrl, onRegenerate, onConfirm } = props;
  // Default to the user's last picked length, snapped to the slider's
  // step grid. First-time users get DURATION_DEFAULT_SECS (20s).
  const [duration, setDuration] = useState<number>(() =>
    loadStoredDuration(),
  );

  const numClips = Math.max(1, Math.ceil(duration / SEGMENT_SECS));
  const estCost = numClips * COST_PER_CLIP_USD;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold mb-2">
          Step 1 · Confirm the look
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          The preview on the right is the seed frame for your video. It
          conditions the persona's appearance through every clip. Compare
          against the persona's avatar (left) — regenerate if the face
          is off.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <FrameTile
            label="Persona avatar"
            url={avatarUrl}
            fallback={
              <span className="text-xs text-muted-foreground">
                No avatar
              </span>
            }
          />
          <FrameTile label="Generated seed frame" url={previewUrl} />
        </div>
        <div className="flex justify-end pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onRegenerate}
            className="text-xs"
          >
            <RefreshCcw className="size-3.5 mr-1" aria-hidden="true" />
            Regenerate
          </Button>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-sm font-semibold">Step 2 · Pick the length</h3>
          <span className="font-display text-2xl font-medium tabular-nums">
            {duration}s
          </span>
        </div>
        <Slider
          value={[duration]}
          min={DURATION_MIN_SECS}
          max={DURATION_MAX_SECS}
          step={DURATION_STEP_SECS}
          onValueChange={(v) => {
            const next = v[0] ?? DURATION_DEFAULT_SECS;
            setDuration(next);
            try {
              localStorage.setItem(DURATION_STORAGE_KEY, String(next));
            } catch {
              /* private mode etc — fine to ignore */
            }
          }}
          className="py-2"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums pt-1">
          <span>{DURATION_MIN_SECS}s</span>
          <span>{DURATION_MAX_SECS}s</span>
        </div>
        <p className="text-xs text-muted-foreground pt-2">
          {numClips} × {SEGMENT_SECS}s clips · estimated cost{" "}
          <span className="tabular-nums">${estCost.toFixed(2)}</span>
        </p>
      </div>

      <div className="flex justify-end pt-2">
        <Button
          onClick={() => onConfirm(duration)}
          className="shadow-md shadow-primary/20"
        >
          <Wand2 className="size-4 mr-2" aria-hidden="true" />
          Generate video
          <ArrowRight className="size-4 ml-2" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function ClipChainProgress(props: {
  segments: { label: string; dialog: string; duration: number }[];
  currentIndex: number;
  currentStatus?: string;
  completedCount: number;
  previewUrl?: string;
}) {
  const { segments, currentIndex, currentStatus, completedCount, previewUrl } =
    props;
  const ratio = segments.length === 0 ? 0 : completedCount / segments.length;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-rw-gold font-semibold pb-1">
          Generating
        </p>
        <h3 className="font-display text-xl font-medium tracking-tight">
          Clip {Math.min(currentIndex + 1, segments.length)} of{" "}
          {segments.length}
        </h3>
        <p className="text-xs text-muted-foreground pt-0.5">
          {currentStatus
            ? currentStatus
            : "Submitting to Seedance and polling every 4s…"}
        </p>
      </div>
      <Progress value={Math.round(ratio * 100)} className="h-2" />
      {previewUrl && (
        <div className="flex items-center gap-3 pt-2">
          <img
            src={previewUrl}
            alt=""
            className="w-14 h-24 object-cover rounded-md ring-1 ring-imigongo-clay/20"
          />
          <p className="text-xs text-muted-foreground">
            Each clip's last frame becomes the next clip's seed image, so
            the persona's face and the room stay consistent across the
            seam.
          </p>
        </div>
      )}
      <ul className="space-y-2 text-xs">
        {segments.map((s, i) => (
          <li key={s.label} className="flex items-start gap-2">
            <span className="pt-0.5">
              {i < completedCount ? (
                <CheckCircle2
                  className="size-4 text-rw-green"
                  aria-hidden="true"
                />
              ) : i === currentIndex ? (
                <Loader2
                  className="size-4 text-imigongo-clay animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <span className="block size-4 rounded-full border border-imigongo-clay/30" />
              )}
            </span>
            <span className="flex-1">
              <span className="font-medium">{s.label}</span>
              <span className="block text-muted-foreground line-clamp-2">
                {s.dialog}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReadyToPostStep(props: {
  stitchedUrl: string;
  captionDraft: string;
  onPublish: (caption: string) => void;
}) {
  const { stitchedUrl, captionDraft, onPublish } = props;
  const [caption, setCaption] = useState(captionDraft);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-2">
          Step 3 · Review the post
        </h3>
        <p className="text-xs text-muted-foreground">
          The video below is hosted on Blossom and won't expire. Edit
          the caption — that's the text people see in their feeds.
        </p>
      </div>
      <BrandedVideo src={stitchedUrl} maxHeightClass="max-h-[55vh]" />
      <div className="space-y-1.5">
        <label
          htmlFor="vc-caption"
          className="text-sm font-medium flex items-center justify-between"
        >
          Caption
          <span className="text-xs text-muted-foreground tabular-nums font-normal">
            {caption.length} chars
          </span>
        </label>
        <Textarea
          id="vc-caption"
          rows={5}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="resize-y"
        />
      </div>
      <div className="flex justify-end gap-2 pt-1 flex-wrap">
        <Button
          variant="outline"
          onClick={() =>
            postToTwitterIntent({
              text: caption,
              mediaUrl: stitchedUrl,
              filename: "phoenix-video.mp4",
            })
          }
          disabled={!caption.trim()}
          title="Open the X compose tab with this caption + start downloading the video so you can attach it"
          className="bg-black text-white hover:bg-black/85 hover:text-white border-black"
        >
          <XLogo className="mr-2 size-3.5" aria-hidden="true" />
          Post to X
        </Button>
        <Button
          onClick={() => onPublish(caption)}
          disabled={!caption.trim()}
          className="shadow-md shadow-primary/20"
        >
          Post to Nostr
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground text-right">
        Posting to X opens a new tab with the caption pre-filled and
        downloads the video — drag it into the X composer to attach.
      </p>
    </div>
  );
}

function DoneStep(props: {
  stitchedUrl: string;
  eventId: string;
  caption: string;
  onCopyEventId: (eventId: string) => void;
  onClose: () => void;
}) {
  const { stitchedUrl, eventId, caption, onCopyEventId, onClose } = props;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="size-6 text-rw-green" aria-hidden="true" />
        <div>
          <h3 className="font-display text-xl font-medium tracking-tight">
            Posted
          </h3>
          <p className="text-xs text-muted-foreground">
            The kind 1 is signed and dispatched to your relays.
          </p>
        </div>
      </div>
      <BrandedVideo src={stitchedUrl} maxHeightClass="max-h-[40vh]" />
      <div className="flex flex-wrap gap-2 items-center">
        <Badge
          variant="secondary"
          className="font-mono text-[10px]"
          title={eventId}
        >
          {eventId.slice(0, 12)}…
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onCopyEventId(eventId)}
        >
          Copy note id
        </Button>
      </div>
      <div className="flex justify-end gap-2 pt-2 flex-wrap">
        <Button
          variant="outline"
          onClick={() =>
            postToTwitterIntent({
              text: caption,
              mediaUrl: stitchedUrl,
              filename: "phoenix-video.mp4",
            })
          }
          title="Open the X compose tab with this caption + start downloading the video"
          className="bg-black text-white hover:bg-black/85 hover:text-white border-black"
        >
          <XLogo className="mr-2 size-3.5" aria-hidden="true" />
          Also post to X
        </Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}

function FrameTile(props: {
  label: string;
  url?: string;
  fallback?: React.ReactNode;
}) {
  const { label, url, fallback } = props;
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-medium">
        {label}
      </p>
      <div className="aspect-[9/16] rounded-md overflow-hidden ring-1 ring-imigongo-clay/20 bg-imigongo-cream/40 flex items-center justify-center">
        {url ? (
          <img src={url} alt="" className="w-full h-full object-cover" />
        ) : (
          fallback ?? (
            <ImageIcon
              className="size-6 text-muted-foreground"
              aria-hidden="true"
            />
          )
        )}
      </div>
    </div>
  );
}

function BusyBlock(props: {
  title: string;
  subtitle?: string;
  previewUrl?: string;
  progressRatio?: number;
}) {
  const { title, subtitle, previewUrl, progressRatio } = props;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Loader2
          className="size-5 text-imigongo-clay animate-spin mt-0.5"
          aria-hidden="true"
        />
        <div>
          <h3 className="font-display text-xl font-medium tracking-tight">
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs text-muted-foreground pt-1">{subtitle}</p>
          )}
        </div>
      </div>
      {progressRatio !== undefined && (
        <Progress value={Math.round(progressRatio * 100)} className="h-2" />
      )}
      {previewUrl && (
        <img
          src={previewUrl}
          alt=""
          className="w-32 aspect-[9/16] object-cover rounded-md ring-1 ring-imigongo-clay/20"
        />
      )}
    </div>
  );
}

function ErrorBlock(props: {
  message: string;
  cause?: unknown;
  resumableChainId?: string;
  resumableCompletedClips?: number;
  resumableTotalClips?: number;
  onRetry: () => void;
  onResume: (chainId: string) => void;
  onDiscardCheckpoint: (chainId: string) => void;
}) {
  const {
    message,
    cause,
    resumableChainId,
    resumableCompletedClips,
    resumableTotalClips,
    onRetry,
    onResume,
    onDiscardCheckpoint,
  } = props;
  // Pull useful diagnostics out of any error-shaped cause: HTTP status,
  // ppq.ai's `body.error.{message,type}` payload, or the raw stack.
  const c = cause as
    | {
        status?: number;
        body?: { error?: { message?: string; type?: string } } | unknown;
        stack?: string;
      }
    | undefined;
  const status = typeof c?.status === "number" ? c.status : undefined;
  const ppqErr =
    c?.body && typeof c.body === "object" && "error" in c.body
      ? (c.body as { error?: { message?: string; type?: string } }).error
      : undefined;

  return (
    <div className="space-y-3">
      <h3 className="font-display text-xl font-medium tracking-tight text-destructive">
        Something broke
      </h3>
      <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
        {message}
      </p>
      {(status || ppqErr) && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs space-y-1 font-mono">
          {status && (
            <div>
              <span className="text-muted-foreground">HTTP:</span> {status}
            </div>
          )}
          {ppqErr?.type && (
            <div>
              <span className="text-muted-foreground">type:</span>{" "}
              {ppqErr.type}
            </div>
          )}
          {ppqErr?.message && (
            <div>
              <span className="text-muted-foreground">api:</span>{" "}
              {ppqErr.message}
            </div>
          )}
        </div>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">
          Full diagnostics (open DevTools console for grep'able [video:*] logs)
        </summary>
        <pre className="mt-2 p-2 bg-muted/30 rounded overflow-auto max-h-48 whitespace-pre-wrap break-all">
          {c?.stack ?? JSON.stringify(c, null, 2) ?? "(no detail)"}
        </pre>
      </details>
      <div className="flex justify-end gap-2 pt-1 flex-wrap">
        {resumableChainId && (
          <>
            <Button
              variant="ghost"
              onClick={() => onDiscardCheckpoint(resumableChainId)}
            >
              Discard progress
            </Button>
            <Button
              onClick={() => onResume(resumableChainId)}
              className="shadow-md shadow-primary/20"
            >
              <RefreshCcw className="size-4 mr-2" aria-hidden="true" />
              Resume from clip {(resumableCompletedClips ?? 0) + 1}
              {resumableTotalClips ? `/${resumableTotalClips}` : ""}
            </Button>
          </>
        )}
        {!resumableChainId && (
          <Button variant="outline" onClick={onRetry}>
            <RefreshCcw className="size-4 mr-2" aria-hidden="true" />
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Read the last picked duration from localStorage, snapping to the
 * slider's [min, max, step] grid. Falls back to the first-time default
 * if storage is empty or unreadable.
 */
function loadStoredDuration(): number {
  try {
    const raw = localStorage.getItem(DURATION_STORAGE_KEY);
    if (!raw) return DURATION_DEFAULT_SECS;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DURATION_DEFAULT_SECS;
    const stepped =
      Math.round(n / DURATION_STEP_SECS) * DURATION_STEP_SECS;
    return Math.min(
      DURATION_MAX_SECS,
      Math.max(DURATION_MIN_SECS, stepped),
    );
  } catch {
    return DURATION_DEFAULT_SECS;
  }
}

function Centered(props: { children: React.ReactNode }) {
  return (
    <div className="min-h-[16rem] flex items-center justify-center">
      {props.children}
    </div>
  );
}
