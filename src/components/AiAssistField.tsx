import { useState } from "react";
import { AlertCircle, Loader2, RefreshCw, Sparkles } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getInferenceText, usePpqInference } from "@/hooks/usePpqInference";
import { cn } from "@/lib/utils";

export interface AiAssistFieldContext {
  fieldLabel: string;
  fieldPurpose: string;
  currentValue: string;
  surroundingContext: string[];
  defaultInstruction?: string;
  onReplace: (nextValue: string) => void;
}

type AiAssistButtonProps = AiAssistFieldContext & {
  className?: string;
  disabled?: boolean;
  title?: string;
};

const SYSTEM_PROMPT =
  "You help draft concise app form fields. Return only the replacement field text.";

export function AiAssistButton({
  fieldLabel,
  fieldPurpose,
  currentValue,
  surroundingContext,
  defaultInstruction,
  onReplace,
  className,
  disabled,
  title,
}: AiAssistButtonProps) {
  const inference = usePpqInference();
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState(defaultInstruction ?? "");
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const instructionId = `ai-assist-instructions-${fieldLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}`;

  function closeDialog(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setInstruction(defaultInstruction ?? "");
      setPreview("");
      setError("");
    }
  }

  async function runAssist() {
    const trimmedInstruction = instruction.trim();
    if (!trimmedInstruction) {
      setError("Describe what you want AI Assist to do.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await inference.mutateAsync({
        temperature: 0.5,
        max_tokens: 700,
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: buildUserPrompt({
              fieldLabel,
              fieldPurpose,
              currentValue,
              surroundingContext,
              instruction: trimmedInstruction,
            }),
          },
        ],
      });
      const nextPreview = getInferenceText(response).trim();
      if (!nextPreview) {
        setPreview("");
        setError(
          "The model response was empty. Try a more specific instruction.",
        );
        return;
      }
      setPreview(nextPreview);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "AI Assist could not generate a replacement.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function replaceField() {
    if (!preview.trim()) return;
    onReplace(preview);
    closeDialog(false);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("h-8 gap-1.5 rounded-full px-3", className)}
        disabled={disabled}
        onClick={() => setOpen(true)}
        title={title}
      >
        <Sparkles className="size-3.5" aria-hidden="true" />
        AI Assist
      </Button>

      <Dialog open={open} onOpenChange={closeDialog}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>AI Assist: {fieldLabel}</DialogTitle>
            <DialogDescription>
              Describe how to rewrite this field. You can preview the result
              before replacing the current text.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={instructionId}>Instructions</Label>
              <Textarea
                id={instructionId}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={4}
                className="bg-background"
                placeholder="Tell AI Assist what to write or change..."
              />
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" aria-hidden="true" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {preview ? (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="min-h-28 whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm leading-relaxed">
                  {preview}
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => closeDialog(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={runAssist}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2
                  className="mr-2 size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : preview ? (
                <RefreshCw className="mr-2 size-4" aria-hidden="true" />
              ) : (
                <Sparkles className="mr-2 size-4" aria-hidden="true" />
              )}
              {preview ? "Try again" : "Generate"}
            </Button>
            <Button
              type="button"
              onClick={replaceField}
              disabled={submitting || !preview.trim()}
            >
              Replace field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function buildUserPrompt({
  fieldLabel,
  fieldPurpose,
  currentValue,
  surroundingContext,
  instruction,
}: Omit<AiAssistFieldContext, "defaultInstruction" | "onReplace"> & {
  instruction: string;
}) {
  const contextLines =
    surroundingContext.length > 0
      ? surroundingContext.map((line) => `- ${line}`).join("\n")
      : "- none";

  return [
    `Field: ${fieldLabel}`,
    `Purpose: ${fieldPurpose}`,
    "Current value:",
    currentValue.trim() || "(empty)",
    "Surrounding context:",
    contextLines,
    "User instructions:",
    instruction,
    "Return only the replacement text for this field. Do not include markdown fences, explanations, or alternate options unless the user explicitly asks for them.",
  ].join("\n");
}
