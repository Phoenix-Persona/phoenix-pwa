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
import { useToast } from "@/hooks/useToast";
import {
  useGenerateVideoPipeline,
  type GenerationPhase,
} from "@/hooks/useGenerateVideoPipeline";
import type { Persona } from "@/lib/persona";

const DURATION_OPTIONS = [15, 30, 45, 60, 75, 90] as const;
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
  /** Persona's avatar — feeds the gpt-image-1 preview as `image_url`. */
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

  // Auto-fire the preview generation as soon as the dialog opens with
  // a non-empty idea. The user can regenerate from the preview-ready
  // step if they want a different look.
  useEffect(() => {
    if (!open) return;
    if (phase.type !== "idle") return;
    if (!idea.trim()) return;
    void pipeline.generatePreview();
    // We deliberately depend only on `open`; pipeline + idea are
    // captured by closure and we don't want to re-fire on every
    // render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
          <PhaseView
            phase={phase}
            personaAvatarUrl={personaAvatarUrl}
            onRegeneratePreview={() => void pipeline.generatePreview()}
            onConfirmDuration={(dur) =>
              void pipeline.confirmAndGenerate(dur)
            }
            onPublish={(caption) => void pipeline.publish(caption)}
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
  onCopyEventId: (eventId: string) => void;
  onClose: () => void;
}) {
  const {
    phase,
    personaAvatarUrl,
    onRegeneratePreview,
    onConfirmDuration,
    onPublish,
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
          subtitle="gpt-image-1 with the persona's avatar as input. ~10s."
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
          onCopyEventId={onCopyEventId}
          onClose={onClose}
        />
      );

    case "error":
      return (
        <ErrorBlock message={phase.message} onRetry={onRegeneratePreview} />
      );
  }
}

/* ---------- step components ---------- */

function PreviewStep(props: {
  previewUrl: string;
  avatarUrl?: string;
  onRegenerate: () => void;
  onConfirm: (durationSecs: number) => void;
}) {
  const { previewUrl, avatarUrl, onRegenerate, onConfirm } = props;
  const [duration, setDuration] = useState<number>(30);

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
        <h3 className="text-sm font-semibold mb-2">
          Step 2 · Pick the length
        </h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {DURATION_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDuration(d)}
              className={
                "rounded-md border px-3 py-2 text-sm transition-colors " +
                (d === duration
                  ? "border-rw-gold bg-rw-gold/15 text-foreground font-medium"
                  : "border-imigongo-clay/20 hover:border-imigongo-clay/40")
              }
            >
              {d}s
            </button>
          ))}
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
      <video
        src={stitchedUrl}
        controls
        playsInline
        className="w-full max-h-[55vh] rounded-lg bg-black"
      />
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
      <div className="flex justify-end gap-2 pt-1">
        <Button
          onClick={() => onPublish(caption)}
          disabled={!caption.trim()}
          className="shadow-md shadow-primary/20"
        >
          Post to Nostr
        </Button>
      </div>
    </div>
  );
}

function DoneStep(props: {
  stitchedUrl: string;
  eventId: string;
  onCopyEventId: (eventId: string) => void;
  onClose: () => void;
}) {
  const { stitchedUrl, eventId, onCopyEventId, onClose } = props;
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
      <video
        src={stitchedUrl}
        controls
        playsInline
        className="w-full max-h-[40vh] rounded-lg bg-black"
      />
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
      <div className="flex justify-end pt-2">
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

function ErrorBlock(props: { message: string; onRetry: () => void }) {
  const { message, onRetry } = props;
  return (
    <div className="space-y-3">
      <h3 className="font-display text-xl font-medium tracking-tight text-destructive">
        Something broke
      </h3>
      <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
        {message}
      </p>
      <div className="flex justify-end pt-1">
        <Button variant="outline" onClick={onRetry}>
          <RefreshCcw className="size-4 mr-2" aria-hidden="true" />
          Try again
        </Button>
      </div>
    </div>
  );
}

function Centered(props: { children: React.ReactNode }) {
  return (
    <div className="min-h-[16rem] flex items-center justify-center">
      {props.children}
    </div>
  );
}
