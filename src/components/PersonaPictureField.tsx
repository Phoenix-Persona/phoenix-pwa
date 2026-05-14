/**
 * PersonaPictureField — set a persona's profile picture by uploading
 * a file or generating one from a prompt via PPQ.
 *
 * Either path produces a Blossom URL the caller can stash on the
 * persona's public profile and encrypted backup. Generated images are fetched from
 * PPQ and re-uploaded to Blossom so the persona's picture isn't tied
 * to PPQ's asset hosting.
 *
 * Caller pattern:
 *   const [picture, setPicture] = useState("");
 *   <PersonaPictureField
 *     value={picture}
 *     onChange={setPicture}
 *     promptHint={`portrait of ${name}`}
 *   />
 */

import { useRef, useState } from "react";
import { Loader2, Sparkles, Trash2, Upload } from "lucide-react";

import type { NostrSigner } from "@nostrify/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useUploadFile } from "@/hooks/useUploadFile";
import { usePpqImage } from "@/hooks/usePpqImage";
import { useToast } from "@/hooks/useToast";
import { generatePollinationsImage } from "@/lib/pollinations/client";
import { PpqError } from "@/lib/ppq/types";
import { withNoTextOverlay } from "@/lib/visualPromptGuards";
import { sanitizeHttpsUrl } from "@/lib/url";
import { cn } from "@/lib/utils";

interface PersonaPictureFieldProps {
  /** Current Blossom URL, or empty string if no picture set. */
  value: string;
  /** Called with the new Blossom URL or "" when removed. */
  onChange: (url: string) => void;
  /** Suggested generation prompt (typically derived from persona name + bio). */
  promptHint?: string;
  /**
   * When true, fall back to the free Pollinations endpoint if PPQ
   * returns 402 (out of credits). Used during onboarding so brand-new
   * users — who by definition haven't funded a wallet yet — can still
   * generate a portrait. PPQ stays the preferred path; Pollinations
   * only fires when PPQ is unavailable.
   */
  allowFreeFallback?: boolean;
  /**
   * Persona signer that authorizes the BUD-01 Blossom upload event.
   *
   * **Privacy-critical.** Without this, the operator's pubkey appears on
   * every kind 24242 auth event, correlating operator ↔ persona for any
   * party with access to those events. Every consumer of this component
   * MUST pass a persona-keypair signer when uploading a persona's picture.
   */
  signer: NostrSigner;
  /**
   * Optional Blossom server override for persona uploads. Used verbatim;
   * the operator's NIP-65-aware list is bypassed. When unset and `signer`
   * is provided, the underlying `useUploadFile` falls back to
   * `APP_BLOSSOM_SERVERS` so the persona never inherits the operator's
   * server preferences.
   */
  blossomServers?: string[];
  className?: string;
}

/** Default model — PPQ exposes many; a simple default keeps the UI tight. */
const DEFAULT_IMAGE_MODEL = "gpt-image-1";

/**
 * Pull the canonical URL out of Blossom NIP-94-style upload tags. The
 * first `url` tag is the upload's canonical address.
 */
function urlFromUploadTags(tags: string[][]): string | null {
  for (const tag of tags) {
    if (tag[0] === "url" && tag[1]) return tag[1];
  }
  return null;
}

/** Best-guess content type from a URL extension; falls back to PNG. */
function guessImageMime(url: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "image/png";
}

export function PersonaPictureField({
  value,
  onChange,
  promptHint,
  allowFreeFallback = false,
  signer,
  blossomServers,
  className,
}: PersonaPictureFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadFile({ signer, blossomServers });
  const generate = usePpqImage();
  const { toast } = useToast();

  const [prompt, setPrompt] = useState(promptHint ?? "");
  const [genError, setGenError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Staged progress for the generate flow:
  //   drafting   → PPQ image gen (slowest, 10–30s typical)
  //   fetching   → downloading the generated image from PPQ
  //   uploading  → re-uploading to Blossom
  // We track this separately from the mutation states because the
  // generate path chains three async steps.
  type GenStage = "idle" | "drafting" | "fetching" | "uploading";
  const [genStage, setGenStage] = useState<GenStage>("idle");
  const generating = genStage !== "idle";

  async function handleFileSelected(file: File) {
    setUploadError(null);
    try {
      const tags = await upload.mutateAsync(file);
      const url = urlFromUploadTags(tags);
      if (!url) throw new Error("Upload succeeded but no URL was returned.");
      onChange(url);
    } catch (e) {
      setUploadError(
        e instanceof Error ? e.message : "Upload failed. Try a smaller file."
      );
    }
  }

  /**
   * Upload an image Blob to Blossom and return the canonical URL.
   * Shared by the PPQ + Pollinations paths so the rest of the app
   * sees a single, stable URL shape regardless of how the picture
   * was produced.
   */
  async function uploadToBlossom(blob: Blob, sourceUrl?: string): Promise<string> {
    setGenStage("uploading");
    const mime = blob.type || (sourceUrl ? guessImageMime(sourceUrl) : "image/png");
    const ext = mime.split("/")[1] ?? "png";
    const file = new File([blob], `persona-portrait.${ext}`, { type: mime });
    const tags = await upload.mutateAsync(file);
    const blossomUrl = urlFromUploadTags(tags);
    if (!blossomUrl) {
      throw new Error("Upload succeeded but no URL was returned.");
    }
    return blossomUrl;
  }

  async function generateViaPollinations(prompt: string): Promise<string> {
    const blob = await generatePollinationsImage({
      // Suppress baked-in subtitles / captions / on-screen text by
      // default. The directive yields if the user's prompt explicitly
      // asks for text overlays (idempotent).
      prompt: withNoTextOverlay(prompt),
      width: 1024,
      height: 1024,
      model: "flux",
      nologo: true,
    });
    return uploadToBlossom(blob);
  }

  async function generateViaPpq(prompt: string): Promise<string> {
    const result = await generate.mutateAsync({
      model: DEFAULT_IMAGE_MODEL,
      prompt: withNoTextOverlay(prompt),
      size: "1:1",
      n: 1,
    });
    const ppqUrl = result.data[0]?.url;
    if (!ppqUrl) {
      throw new Error("PPQ returned no image. Try a different prompt.");
    }
    setGenStage("fetching");
    const res = await fetch(ppqUrl);
    if (!res.ok) {
      throw new Error(`Could not fetch generated image (HTTP ${res.status}).`);
    }
    const blob = await res.blob();
    return uploadToBlossom(blob, ppqUrl);
  }

  async function handleGenerate() {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setGenError("Describe the picture you want.");
      return;
    }
    setGenError(null);
    setGenStage("drafting");
    try {
      let blossomUrl: string;
      let usedFreeTier = false;
      try {
        blossomUrl = await generateViaPpq(trimmed);
      } catch (e) {
        // During onboarding, a brand-new user has no PPQ credit
        // account, no funded wallet, and possibly no envelope yet —
        // any of those can make the PPQ path fail with a status that
        // isn't strictly 402 (e.g. 401 / 403 from account-mint, or a
        // generic network error). When `allowFreeFallback` is set we
        // ALWAYS fall back to the free Pollinations endpoint rather
        // than narrowing on a single status, so the picture step
        // doesn't dead-end the wizard. The original error is logged
        // for diagnosis but not surfaced.
        if (allowFreeFallback) {
          console.warn(
            "[PersonaPictureField] PPQ failed; falling back to Pollinations:",
            e,
          );
          setGenStage("drafting");
          blossomUrl = await generateViaPollinations(trimmed);
          usedFreeTier = true;
        } else {
          throw e;
        }
      }
      onChange(blossomUrl);
      toast({
        title: "Picture generated",
        description: usedFreeTier
          ? "Made with the free generator — top up your wallet later for higher-quality runs."
          : "Saved to your media server.",
      });
    } catch (e) {
      if (e instanceof PpqError && e.status === 402) {
        setGenError(
          "Out of credits — top up the persona's wallet to generate images."
        );
      } else {
        setGenError(
          e instanceof Error ? e.message : "Image generation failed."
        );
      }
    } finally {
      setGenStage("idle");
    }
  }

  const busy = upload.isPending || generating;
  const previewUrl = sanitizeHttpsUrl(value);

  // User-facing label for each stage of the generate pipeline.
  const stageLabel: { button: string; detail: string } = (() => {
    switch (genStage) {
      case "drafting":
        return {
          button: "Drafting image…",
          detail: "PPQ is rendering the image. This usually takes 10–30 seconds.",
        };
      case "fetching":
        return {
          button: "Fetching the image…",
          detail: "Downloading the generated image from PPQ.",
        };
      case "uploading":
        return {
          button: "Saving to your media server…",
          detail: "Mirroring the image to Blossom so the persona owns it.",
        };
      case "idle":
      default:
        return { button: "Generate", detail: "" };
    }
  })();

  return (
    <div className={cn("space-y-4", className)}>
      {/* Preview */}
      {value ? (
        <div className="flex items-center gap-4">
          <div className="relative size-24 rounded-2xl overflow-hidden ring-1 ring-imigongo-clay/20 bg-muted flex-shrink-0">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt=""
                className="w-full h-full object-cover"
                loading="eager"
                crossOrigin="anonymous"
              />
            ) : null}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <p className="text-xs text-muted-foreground break-all line-clamp-2">
              {value}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
              >
                <Upload className="mr-2 size-3.5" />
                Replace
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange("")}
                disabled={busy}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="mr-2 size-3.5" />
                Remove
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center size-24 rounded-2xl border-2 border-dashed border-imigongo-clay/30 bg-muted/30 text-muted-foreground/60 text-[11px] uppercase tracking-[0.14em] font-semibold">
          No picture
        </div>
      )}

      {/* Hidden file input — driven by Upload + Replace buttons */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelected(file);
          // Allow re-selecting the same file
          e.target.value = "";
        }}
      />

      {/* Action panels — only when no picture is set, to keep the UI calm
          once we have one. (Replace + Remove live next to the preview.) */}
      {!value && (
        <div className="grid sm:grid-cols-2 gap-3">
          {/* Upload */}
          <div className="rounded-xl border border-imigongo-clay/15 bg-card p-4 space-y-3">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.14em] text-imigongo-clay font-semibold">
                Upload
              </p>
              <p className="text-xs text-muted-foreground">
                A photo or illustration the persona will use as its face.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="w-full"
            >
              {upload.isPending && !generating ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <Upload className="mr-2 size-4" />
                  Choose file
                </>
              )}
            </Button>
          </div>

          {/* Generate */}
          <div className="rounded-xl border border-imigongo-clay/15 bg-card p-4 space-y-3">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.14em] text-rw-sky font-semibold">
                Generate
              </p>
              <p className="text-xs text-muted-foreground">
                Describe the look — Zuka will draft an image via PPQ.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="picture-prompt" className="sr-only">
                Image prompt
              </Label>
              <Input
                id="picture-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={promptHint ?? "Describe the persona's portrait"}
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !busy) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                onClick={handleGenerate}
                disabled={busy || !prompt.trim()}
                className="w-full"
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    {stageLabel.button}
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 size-4" />
                    Generate
                  </>
                )}
              </Button>
              {generating && stageLabel.detail ? (
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {stageLabel.detail}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {(uploadError || genError) && (
        <Alert variant="destructive">
          <AlertDescription>
            {uploadError ?? genError}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
