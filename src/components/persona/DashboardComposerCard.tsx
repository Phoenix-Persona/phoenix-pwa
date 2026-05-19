import { useState } from "react";
import { Film, Loader2, PencilLine, Search, Sparkles, Wand2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AiAssistButton } from "@/components/AiAssistField";
import { ResearchPanel } from "@/components/persona/ResearchPanel";
import type { PpqAccountOptions } from "@/hooks/usePpqAccount";
import type { Persona } from "@/lib/persona";

interface DashboardComposerCardProps {
  personaName: string;
  personaBio?: string;
  raw: string;
  sourcesInput: string;
  hintsInput: string;
  crossPostEnabled: boolean;
  crossPost: Persona["cross_post"];
  walletSeed: string | undefined;
  ppqAccountOptions?: PpqAccountOptions;
  isPublishing: boolean;
  isStyling: boolean;
  onRawChange: (value: string) => void;
  onSourcesInputChange: (value: string) => void;
  onHintsInputChange: (value: string) => void;
  onDiscard: () => void;
  onStyle: () => void;
  onOpenPostWizard: () => void;
  onPost: () => void;
  onOpenVideo: () => void;
  /**
   * Called when the operator clicks "Add as source" on a research
   * result. Implementation should append the URL to the comma-separated
   * sources field (the kind 1 emits each as an `r` tag).
   */
  onAppendSource: (url: string) => void;
  /**
   * Called when the operator clicks "Quote in idea" on a research
   * result. Implementation should append the formatted block (quote
   * + attribution + URL) to the idea textarea so the persona styling
   * pass can build on it.
   */
  onAppendIdea: (text: string) => void;
}

type ComposerTab = "post" | "video";

export function DashboardComposerCard({
  personaName,
  personaBio,
  raw,
  sourcesInput,
  hintsInput,
  crossPostEnabled,
  crossPost,
  walletSeed,
  ppqAccountOptions,
  isPublishing,
  isStyling,
  onRawChange,
  onSourcesInputChange,
  onHintsInputChange,
  onDiscard,
  onStyle,
  onOpenPostWizard,
  onPost,
  onOpenVideo,
  onAppendSource,
  onAppendIdea,
}: DashboardComposerCardProps) {
  const [tab, setTab] = useState<ComposerTab>("post");
  const [researchOpen, setResearchOpen] = useState(false);

  const showCrossPost = crossPostEnabled && Boolean(crossPost?.webhook_url);
  const hasDraft = Boolean(
    raw.trim() || sourcesInput.trim() || hintsInput.trim(),
  );
  const styleDisabled = isStyling || isPublishing || !raw.trim() || !walletSeed;
  const styleTitle = !walletSeed
    ? "Create a new persona to enable AI styling"
    : "Rewrite the idea in the persona's voice (PPQ chat)";
  const assistDisabled = isStyling || isPublishing || !walletSeed;
  const assistTitle = !walletSeed
    ? "Create a new persona to enable AI Assist"
    : "Draft or rewrite the idea with AI";
  const wizardDisabled = isStyling || isPublishing || !walletSeed;
  const wizardTitle = !walletSeed
    ? "Create a new persona to enable the post wizard"
    : "Build a post with an AI-guided wizard";
  const baseAssistContext = [
    `Persona: ${fieldContextValue(personaName)}`,
    `Persona bio: ${fieldContextValue(personaBio ?? "")}`,
    `Sources: ${fieldContextValue(sourcesInput)}`,
    `Style hints: ${fieldContextValue(hintsInput)}`,
  ];

  const crossPostBanner = showCrossPost ? (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rw-sky/25 bg-rw-sky/5 px-4 py-2.5 text-xs">
      <span className="font-medium text-foreground">Cross-post:</span>
      <span className="text-muted-foreground">
        Will dispatch to your webhook
      </span>
      {(crossPost?.webhook_platforms ?? []).length > 0 && (
        <>
          <span className="text-muted-foreground">·</span>
          <div className="flex flex-wrap gap-1">
            {(crossPost?.webhook_platforms ?? []).map((platform) => (
              <Badge
                key={platform}
                variant="secondary"
                className="text-[10px] bg-rw-sky/10 text-rw-sky border border-rw-sky/20"
              >
                {platform}
              </Badge>
            ))}
          </div>
        </>
      )}
    </div>
  ) : null;

  return (
    <Card className="border-imigongo-clay/20 bg-gradient-to-br from-card via-card to-rw-gold-soft/10 overflow-hidden">
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as ComposerTab)}
        className="gap-0"
      >
        <div className="bg-gradient-to-r from-rw-sky/10 via-rw-gold/10 to-rw-green/10 px-6 pt-4 pb-0 border-b border-imigongo-clay/15 flex items-center justify-between gap-3">
          <TabsList variant="line" className="h-auto p-0 gap-2">
            <TabsTrigger value="post" className="gap-2 px-3 pb-3 text-sm">
              <PencilLine className="size-4" aria-hidden="true" />
              Write a post
            </TabsTrigger>
            <TabsTrigger value="video" className="gap-2 px-3 pb-3 text-sm">
              <Film className="size-4" aria-hidden="true" />
              Compose a video
            </TabsTrigger>
          </TabsList>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setResearchOpen(true)}
            className="mb-2 h-7 px-2.5 text-xs gap-1.5 hover:bg-imigongo-clay/10"
            title="Pull recent coverage from trusted human-rights and press-freedom sources"
          >
            <Search className="size-3.5" aria-hidden="true" />
            Research
          </Button>
        </div>
        <CardContent className="space-y-5 pt-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="composer-raw" className="text-sm font-medium">
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
              onChange={(e) => onRawChange(e.target.value)}
              placeholder={
                tab === "post"
                  ? "What does the persona want to say? Drop the rawest draft — Zuka can rewrite it in the persona's voice before posting."
                  : "What does the persona need to say? Drop the rawest version of your brief — Zuka turns it into a video script in the persona's voice."
              }
              onKeyDown={(e) => {
                if (
                  (e.metaKey || e.ctrlKey) &&
                  e.key === "Enter" &&
                  raw.trim() &&
                  !isPublishing &&
                  !isStyling
                ) {
                  e.preventDefault();
                  if (tab === "post") onPost();
                  else onOpenVideo();
                }
              }}
              className="resize-y min-h-[8rem] bg-background/60"
            />
          </div>

          <TabsContent value="post" className="mt-0 space-y-5 outline-none">
            {crossPostBanner}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <Button
                variant="ghost"
                onClick={onDiscard}
                disabled={isPublishing || isStyling || !hasDraft}
              >
                Discard
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onOpenPostWizard}
                  disabled={wizardDisabled}
                  title={wizardTitle}
                >
                  <Sparkles className="mr-2 size-4" aria-hidden="true" />
                  Post Wizard
                </Button>
                <AiAssistButton
                  fieldLabel="Post idea"
                  fieldPurpose="The raw idea or draft that will be styled in the persona's voice before publishing as a Nostr post."
                  currentValue={raw}
                  surroundingContext={[
                    "Composer mode: Write a post",
                    ...baseAssistContext,
                  ]}
                  defaultInstruction="Draft or improve this post idea."
                  onReplace={onRawChange}
                  disabled={assistDisabled}
                  title={assistTitle}
                  className="h-9 rounded-md"
                  ppqAccountOptions={ppqAccountOptions}
                />
                <Button
                  onClick={onStyle}
                  variant="outline"
                  disabled={styleDisabled}
                  title={styleTitle}
                >
                  {isStyling ? (
                    <>
                      <Loader2
                        className="mr-2 size-4 animate-spin"
                        aria-hidden="true"
                      />
                      Styling…
                    </>
                  ) : (
                    <>
                      <Wand2 className="mr-2 size-4" aria-hidden="true" />
                      Style in voice
                    </>
                  )}
                </Button>
                <Button
                  onClick={onPost}
                  disabled={isPublishing || isStyling || !raw.trim()}
                  className="shadow-lg shadow-primary/20"
                  title="Publish a text-only kind 1 note"
                >
                  {isPublishing ? (
                    <>
                      <Loader2
                        className="mr-2 size-4 animate-spin"
                        aria-hidden="true"
                      />
                      Publishing…
                    </>
                  ) : (
                    <>
                      <PencilLine className="mr-2 size-4" aria-hidden="true" />
                      Publish
                    </>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="video" className="mt-0 space-y-5 outline-none">
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
                  onChange={(e) => onSourcesInputChange(e.target.value)}
                  placeholder="https://hrw.org/..., https://cpj.org/..."
                  className="text-sm bg-background/60 resize-none"
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Comma-separated URLs. Grounds the video script and rides the
                  published post as <code className="font-mono">r</code> tags
                  for attribution.
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
                  onChange={(e) => onHintsInputChange(e.target.value)}
                  placeholder="measured, first-person, vertical 9:16"
                  className="text-sm bg-background/60 resize-none"
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Tone, framing, length. Steers the AI prompt for both video
                  script and visual direction.
                </p>
              </div>
            </div>

            {crossPostBanner}

            <div className="space-y-3 pt-1">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button
                  variant="ghost"
                  onClick={onDiscard}
                  disabled={isPublishing || isStyling || !hasDraft}
                >
                  Discard
                </Button>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onOpenPostWizard}
                    disabled={wizardDisabled}
                    title={wizardTitle}
                  >
                    <Sparkles className="mr-2 size-4" aria-hidden="true" />
                    Post Wizard
                  </Button>
                  <AiAssistButton
                    fieldLabel="Video idea"
                    fieldPurpose="The raw video brief that will become a script, visual direction, and caption in the persona's voice."
                    currentValue={raw}
                    surroundingContext={[
                      "Composer mode: Compose a video",
                      ...baseAssistContext,
                    ]}
                    defaultInstruction="Draft or improve this video idea."
                    onReplace={onRawChange}
                    disabled={assistDisabled}
                    title={assistTitle}
                    className="h-9 rounded-md"
                    ppqAccountOptions={ppqAccountOptions}
                  />
                  <Button
                    onClick={onStyle}
                    variant="outline"
                    disabled={styleDisabled}
                    title={styleTitle}
                  >
                    {isStyling ? (
                      <>
                        <Loader2
                          className="mr-2 size-4 animate-spin"
                          aria-hidden="true"
                        />
                        Styling…
                      </>
                    ) : (
                      <>
                        <Wand2 className="mr-2 size-4" aria-hidden="true" />
                        Style in voice
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={onOpenVideo}
                    disabled={!raw.trim() || isPublishing || isStyling}
                    className="shadow-lg shadow-primary/20"
                    title="Open the video composer (Seedance i2v chain → stitched MP4 → kind 1)"
                  >
                    <Sparkles className="mr-2 size-4" aria-hidden="true" />
                    Generate video
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground text-right">
                <span className="opacity-80">
                  Video runs four+ Seedance clips back-to-back, stitches them
                  with ffmpeg.wasm, uploads the result to Blossom, and lets you
                  edit the caption before posting.
                </span>
              </p>
            </div>
          </TabsContent>
        </CardContent>
      </Tabs>
      <ResearchPanel
        open={researchOpen}
        onOpenChange={setResearchOpen}
        onAddSource={onAppendSource}
        onQuoteIntoIdea={onAppendIdea}
        ppqAccountOptions={ppqAccountOptions}
      />
    </Card>
  );
}

function fieldContextValue(value: string): string {
  return value.trim() || "(empty)";
}
