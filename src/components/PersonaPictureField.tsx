/**
 * PersonaPictureField — set a persona's profile picture by uploading
 * a file or generating one from a prompt via PPQ.
 *
 * Either path produces a Blossom URL the caller can stash on the
 * persona's kind 0 `picture` field (and the encrypted backup's
 * `persona.reference_image_url`). Generated images are fetched from
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

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useUploadFile } from "@/hooks/useUploadFile";
import { usePpqImage } from "@/hooks/usePpqImage";
import { useToast } from "@/hooks/useToast";
import { PpqError } from "@/lib/ppq/types";
import { cn } from "@/lib/utils";

interface PersonaPictureFieldProps {
  /** Current Blossom URL, or empty string if no picture set. */
  value: string;
  /** Called with the new Blossom URL or "" when removed. */
  onChange: (url: string) => void;
  /** Suggested generation prompt (typically derived from persona name + bio). */
  promptHint?: string;
  className?: string;
}

/** Default model — PPQ exposes many; a simple default keeps the UI tight. */
const DEFAULT_IMAGE_MODEL = "gpt-image-1";

/**
 * Pull the canonical URL out of a Blossom upload result. Nostrify's
 * BlossomUploader returns NIP-94 imeta tags; the first `url` tag is
 * the upload's canonical address.
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
  className,
}: PersonaPictureFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadFile();
  const generate = usePpqImage();
  const { toast } = useToast();

  const [prompt, setPrompt] = useState(promptHint ?? "");
  const [genError, setGenError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // We track this separately from the mutation states because the
  // generate path runs upload AFTER the PPQ call resolves.
  const [generating, setGenerating] = useState(false);

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

  async function handleGenerate() {
    if (!prompt.trim()) {
      setGenError("Describe the picture you want.");
      return;
    }
    setGenError(null);
    setGenerating(true);
    try {
      // 1. Generate via PPQ.
      const result = await generate.mutateAsync({
        model: DEFAULT_IMAGE_MODEL,
        prompt: prompt.trim(),
        size: "1:1",
        n: 1,
      });
      const ppqUrl = result.data[0]?.url;
      if (!ppqUrl) {
        throw new Error("PPQ returned no image. Try a different prompt.");
      }

      // 2. Fetch and re-upload to Blossom so the persona's picture
      //    isn't tied to PPQ's hosting.
      const res = await fetch(ppqUrl);
      if (!res.ok) {
        throw new Error(`Could not fetch generated image (HTTP ${res.status}).`);
      }
      const blob = await res.blob();
      const ext = guessImageMime(ppqUrl).split("/")[1] ?? "png";
      const file = new File([blob], `persona-portrait.${ext}`, {
        type: blob.type || guessImageMime(ppqUrl),
      });

      const tags = await upload.mutateAsync(file);
      const blossomUrl = urlFromUploadTags(tags);
      if (!blossomUrl) {
        throw new Error("Upload succeeded but no URL was returned.");
      }
      onChange(blossomUrl);
      toast({
        title: "Picture generated",
        description: "Saved to your media server.",
      });
    } catch (e) {
      // PPQ returns 402 when the persona's credit account has no
      // funds. Surface that as a clear, actionable message instead of
      // the raw status text.
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
      setGenerating(false);
    }
  }

  const busy = upload.isPending || generating;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Preview */}
      {value ? (
        <div className="flex items-center gap-4">
          <div className="relative size-24 rounded-2xl overflow-hidden ring-1 ring-imigongo-clay/20 bg-muted flex-shrink-0">
            <img
              src={value}
              alt=""
              className="w-full h-full object-cover"
              loading="eager"
              crossOrigin="anonymous"
            />
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
                Describe the look — Feniksi will draft an image via PPQ.
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
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 size-4" />
                    Generate
                  </>
                )}
              </Button>
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
