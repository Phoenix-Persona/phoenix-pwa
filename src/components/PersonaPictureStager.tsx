/**
 * PersonaPictureStager - choose or generate an onboarding portrait without
 * uploading it. The selected/generated file stays local until persona Create.
 */

import { useRef, useState } from "react";
import { Loader2, Sparkles, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { usePpqImage } from "@/hooks/usePpqImage";
import { useToast } from "@/hooks/useToast";
import { generatePollinationsImage } from "@/lib/pollinations/client";
import { PpqError } from "@/lib/ppq/types";
import { withNoTextOverlay } from "@/lib/visualPromptGuards";
import { cn } from "@/lib/utils";

export interface StagedPersonaPicture {
  file: File;
  previewUrl: string;
  source: "upload" | "ppq" | "pollinations";
}

interface PersonaPictureStagerProps {
  value: StagedPersonaPicture | null;
  onChange: (picture: StagedPersonaPicture | null) => void;
  promptHint?: string;
  allowFreeFallback?: boolean;
  className?: string;
}

const DEFAULT_IMAGE_MODEL = "gpt-image-1";

function guessImageMime(url: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "image/png";
}

function fileFromBlob(blob: Blob, sourceUrl?: string): File {
  const mime = blob.type || (sourceUrl ? guessImageMime(sourceUrl) : "image/png");
  const ext = mime.split("/")[1] ?? "png";
  return new File([blob], `persona-portrait.${ext}`, { type: mime });
}

export function PersonaPictureStager({
  value,
  onChange,
  promptHint,
  allowFreeFallback = false,
  className,
}: PersonaPictureStagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generate = usePpqImage();
  const { toast } = useToast();

  const [prompt, setPrompt] = useState(promptHint ?? "");
  const [genError, setGenError] = useState<string | null>(null);
  type GenStage = "idle" | "drafting" | "fetching";
  const [genStage, setGenStage] = useState<GenStage>("idle");
  const generating = genStage !== "idle";

  function replaceValue(next: StagedPersonaPicture | null) {
    if (value?.previewUrl && value.previewUrl !== next?.previewUrl) {
      URL.revokeObjectURL(value.previewUrl);
    }
    onChange(next);
  }

  function handleFileSelected(file: File) {
    setGenError(null);
    replaceValue({
      file,
      previewUrl: URL.createObjectURL(file),
      source: "upload",
    });
  }

  async function stagePollinationsImage(prompt: string): Promise<StagedPersonaPicture> {
    const blob = await generatePollinationsImage({
      prompt: withNoTextOverlay(prompt),
      width: 1024,
      height: 1024,
      model: "flux",
      nologo: true,
    });
    const file = fileFromBlob(blob);
    return {
      file,
      previewUrl: URL.createObjectURL(file),
      source: "pollinations",
    };
  }

  async function stagePpqImage(prompt: string): Promise<StagedPersonaPicture> {
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
    const file = fileFromBlob(blob, ppqUrl);
    return {
      file,
      previewUrl: URL.createObjectURL(file),
      source: "ppq",
    };
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
      let staged: StagedPersonaPicture;
      let usedFreeTier = false;
      try {
        staged = await stagePpqImage(trimmed);
      } catch (e) {
        if (allowFreeFallback) {
          console.warn(
            "[PersonaPictureStager] PPQ failed; falling back to Pollinations:",
            e,
          );
          setGenStage("drafting");
          staged = await stagePollinationsImage(trimmed);
          usedFreeTier = true;
        } else {
          throw e;
        }
      }
      replaceValue(staged);
      toast({
        title: "Picture generated",
        description: usedFreeTier
          ? "Made with the free generator. It will be saved when you create the persona."
          : "Preview ready. It will be saved when you create the persona.",
      });
    } catch (e) {
      if (e instanceof PpqError && e.status === 402) {
        setGenError(
          "Out of credits. Top up the persona's wallet to generate images.",
        );
      } else {
        setGenError(e instanceof Error ? e.message : "Image generation failed.");
      }
    } finally {
      setGenStage("idle");
    }
  }

  const stageLabel: { button: string; detail: string } = (() => {
    switch (genStage) {
      case "drafting":
        return {
          button: "Drafting image...",
          detail: "PPQ is rendering the image. This usually takes 10-30 seconds.",
        };
      case "fetching":
        return {
          button: "Preparing preview...",
          detail: "Downloading the generated image so it can be saved on Create.",
        };
      case "idle":
      default:
        return { button: "Generate", detail: "" };
    }
  })();

  return (
    <div className={cn("space-y-4", className)}>
      {value ? (
        <div className="flex items-center gap-4">
          <div className="relative size-24 rounded-2xl overflow-hidden ring-1 ring-imigongo-clay/20 bg-muted flex-shrink-0">
            <img
              src={value.previewUrl}
              alt=""
              className="w-full h-full object-cover"
              loading="eager"
            />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <p className="text-xs text-muted-foreground break-all line-clamp-2">
              {value.file.name}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={generating}
              >
                <Upload className="mr-2 size-3.5" />
                Replace
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => replaceValue(null)}
                disabled={generating}
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

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelected(file);
          e.target.value = "";
        }}
      />

      {!value && (
        <div className="grid sm:grid-cols-2 gap-3">
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
              disabled={generating}
              className="w-full"
            >
              <Upload className="mr-2 size-4" />
              Choose file
            </Button>
          </div>

          <div className="rounded-xl border border-imigongo-clay/15 bg-card p-4 space-y-3">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.14em] text-rw-sky font-semibold">
                Generate
              </p>
              <p className="text-xs text-muted-foreground">
                Describe the look. Zuka will draft a local preview first.
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
                disabled={generating}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !generating) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                onClick={handleGenerate}
                disabled={generating || !prompt.trim()}
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

      {genError && (
        <Alert variant="destructive">
          <AlertDescription>{genError}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
