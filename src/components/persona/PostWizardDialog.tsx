import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { usePpqInference, getInferenceText } from "@/hooks/usePpqInference";
import { useResearchSearch } from "@/hooks/useResearchSearch";
import { useToast } from "@/hooks/useToast";
import type { SearchResult } from "@/lib/ppq/search";
import type { Persona } from "@/lib/persona";
import { cn } from "@/lib/utils";

type WizardStep = "topic" | "angle" | "format" | "detail";

interface WizardTopic {
  id: string;
  label: string;
  description: string;
  source?: string;
  sourceUrls: string[];
}

interface WizardOption {
  id: string;
  label: string;
  description: string;
}

export interface PostWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  persona: Persona;
  model: string;
  walletSeed: string | undefined;
  onUseDraft: (text: string, sourceUrls: string[]) => void;
}

const STEPS: { id: WizardStep; label: string }[] = [
  { id: "topic", label: "Pick a topic" },
  { id: "angle", label: "Choose angle" },
  { id: "format", label: "Pick format" },
  { id: "detail", label: "Add detail" },
];

const ANGLES: WizardOption[] = [
  {
    id: "inform",
    label: "Inform",
    description: "Explain what happened clearly and calmly.",
  },
  {
    id: "challenge",
    label: "Challenge",
    description: "Name the contradiction and make the reader sit with it.",
  },
  {
    id: "human-cost",
    label: "Human cost",
    description: "Center the everyday consequence for ordinary people.",
  },
  {
    id: "rally",
    label: "Rally",
    description: "Give supporters a concise reason to pay attention now.",
  },
  {
    id: "reflect",
    label: "Reflect",
    description: "Make a measured observation without over-explaining it.",
  },
];

const FORMATS: WizardOption[] = [
  {
    id: "short-statement",
    label: "Short statement",
    description: "One tight post, direct and ready for the feed.",
  },
  {
    id: "personal-observation",
    label: "Personal observation",
    description: "First person, grounded in one lived detail.",
  },
  {
    id: "before-after",
    label: "Before / after",
    description: "Contrast what was promised with what people experience.",
  },
  {
    id: "practical-advice",
    label: "Practical advice",
    description: "A useful-sounding note that reveals the deeper reality.",
  },
  {
    id: "mini-thread",
    label: "Mini-thread draft",
    description: "A compact post with enough structure to expand later.",
  },
];

const DETAIL_HINTS = [
  "A specific place, date, or local reference.",
  "A short personal story or secondhand observation.",
  "A fact from one of the selected sources.",
];

export function PostWizardDialog({
  open,
  onOpenChange,
  persona,
  model,
  walletSeed,
  onUseDraft,
}: PostWizardDialogProps) {
  const { toast } = useToast();
  const research = useResearchSearch();
  const inference = usePpqInference();

  const [step, setStep] = useState<WizardStep>("topic");
  const [selectedTopicId, setSelectedTopicId] = useState<string>("cause");
  const [customTopic, setCustomTopic] = useState("");
  const [researchTopics, setResearchTopics] = useState<WizardTopic[]>([]);
  const [selectedAngleId, setSelectedAngleId] = useState<string>("inform");
  const [selectedFormatId, setSelectedFormatId] =
    useState<string>("short-statement");
  const [detail, setDetail] = useState("");

  const baseTopics = useMemo(() => buildBaseTopics(persona), [persona]);
  const topics = useMemo(
    () => [...baseTopics, ...researchTopics],
    [baseTopics, researchTopics],
  );

  const selectedTopic = topics.find((topic) => topic.id === selectedTopicId);
  const selectedAngle = ANGLES.find((angle) => angle.id === selectedAngleId);
  const selectedFormat = FORMATS.find((format) => format.id === selectedFormatId);
  const currentStepIndex = STEPS.findIndex((item) => item.id === step);
  const progressValue = ((currentStepIndex + 1) / STEPS.length) * 100;
  const activeTopicText =
    selectedTopicId === "custom" ? customTopic.trim() : selectedTopic?.label ?? "";
  const canGoNext =
    step === "topic"
      ? Boolean(activeTopicText)
      : step === "angle"
        ? Boolean(selectedAngle)
        : step === "format"
          ? Boolean(selectedFormat)
          : true;
  const canGenerate =
    Boolean(walletSeed) &&
    Boolean(activeTopicText) &&
    Boolean(selectedAngle) &&
    Boolean(selectedFormat) &&
    !inference.isPending;

  async function runResearch() {
    try {
      const results = await research.mutateAsync({
        source: "web",
        query: buildResearchQuery(persona),
        lens: "recent human-rights, press-freedom, and civic-rights reporting",
        maxResults: 6,
      });
      const nextTopics = results.map(resultToTopic);
      setResearchTopics(nextTopics);
      if (nextTopics.length === 0) {
        toast({
          title: "No live suggestions",
          description: "Try a custom topic or use one of the persona topics.",
        });
      } else {
        setSelectedTopicId(nextTopics[0].id);
      }
    } catch (error) {
      toast({
        title: "Research failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  async function generateDraft() {
    if (!canGenerate || !selectedAngle || !selectedFormat) return;

    try {
      const sourceUrls =
        selectedTopicId === "custom" ? [] : selectedTopic?.sourceUrls ?? [];
      const result = await inference.mutateAsync({
        model,
        temperature: 0.45,
        max_tokens: 900,
        messages: [
          { role: "system", content: persona.system_prompt },
          {
            role: "user",
            content: buildDraftPrompt({
              persona,
              topic: activeTopicText,
              topicDescription:
                selectedTopicId === "custom"
                  ? undefined
                  : selectedTopic?.description,
              angle: selectedAngle,
              format: selectedFormat,
              detail: detail.trim(),
              sourceUrls,
            }),
          },
        ],
      });
      const draft = getInferenceText(result).trim();
      if (!draft) {
        toast({
          title: "No draft returned",
          description: "The model response was empty. Try generating again.",
        });
        return;
      }
      onUseDraft(draft, sourceUrls);
      onOpenChange(false);
      toast({
        title: "Draft added",
        description: "Review it in the composer before publishing.",
      });
    } catch (error) {
      toast({
        title: "Post wizard failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  function goBack() {
    const previous = STEPS[currentStepIndex - 1]?.id;
    if (previous) setStep(previous);
  }

  function goNext() {
    const next = STEPS[currentStepIndex + 1]?.id;
    if (next) setStep(next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] max-w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 px-5 sm:px-6 pt-5 pb-4 border-b border-imigongo-clay/15 bg-gradient-to-r from-rw-sky/5 via-rw-gold/10 to-rw-green/5">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-imigongo-clay font-semibold">
            <Sparkles className="size-3.5" aria-hidden="true" />
            AI post wizard
          </div>
          <DialogTitle className="font-display text-2xl font-medium tracking-tight">
            Build a post for {persona.display_name ?? persona.name}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Choose the shape of the idea. Zuka will draft it in this persona's
            voice and place it back in the composer.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
          <WizardStepper step={step} />
          <Progress value={progressValue} className="h-1.5 bg-muted" />

          {!walletSeed ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
              This persona was created before wallets were wired. AI-assisted
              post generation is disabled for it.
            </div>
          ) : null}

          {step === "topic" ? (
            <TopicStep
              topics={topics}
              selectedTopicId={selectedTopicId}
              customTopic={customTopic}
              researchPending={research.isPending}
              onSelectTopic={setSelectedTopicId}
              onCustomTopicChange={(value) => {
                setCustomTopic(value);
                setSelectedTopicId("custom");
              }}
              onRunResearch={runResearch}
            />
          ) : null}

          {step === "angle" ? (
            <OptionStep
              eyebrow="Step 2 of 4"
              title="What should the post do?"
              description="Pick the job this post needs to perform for the reader."
              options={ANGLES}
              selectedId={selectedAngleId}
              onSelect={setSelectedAngleId}
            />
          ) : null}

          {step === "format" ? (
            <OptionStep
              eyebrow="Step 3 of 4"
              title="What shape should it take?"
              description="Choose the rhythm of the post. The final text can still be edited before publishing."
              options={FORMATS}
              selectedId={selectedFormatId}
              onSelect={setSelectedFormatId}
            />
          ) : null}

          {step === "detail" ? (
            <DetailStep detail={detail} onDetailChange={setDetail} />
          ) : null}
        </div>

        <DialogFooter className="shrink-0 border-t border-imigongo-clay/15 px-5 sm:px-6 py-4 bg-background">
          <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              disabled={currentStepIndex === 0 || inference.isPending}
              className="gap-2"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back
            </Button>

            {step === "detail" ? (
              <Button
                type="button"
                onClick={generateDraft}
                disabled={!canGenerate}
                className="gap-2 shadow-lg shadow-primary/20"
              >
                {inference.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="size-4" aria-hidden="true" />
                )}
                Generate draft
              </Button>
            ) : (
              <Button
                type="button"
                onClick={goNext}
                disabled={!canGoNext || inference.isPending}
                className="gap-2 shadow-lg shadow-primary/20"
              >
                Continue
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WizardStepper({ step }: { step: WizardStep }) {
  const activeIndex = STEPS.findIndex((item) => item.id === step);

  return (
    <ol className="grid grid-cols-2 overflow-hidden rounded-lg border border-imigongo-clay/15 bg-card sm:grid-cols-4">
      {STEPS.map((item, index) => {
        const active = item.id === step;
        const complete = index < activeIndex;
        return (
          <li
            key={item.id}
            className={cn(
              "min-w-0 border-imigongo-clay/15 px-3 py-3 text-center sm:border-l first:border-l-0",
              active ? "bg-rw-gold-soft/45" : "bg-card",
            )}
          >
            <div
              className={cn(
                "mx-auto mb-1 flex size-7 items-center justify-center rounded-full text-sm font-semibold",
                complete
                  ? "bg-rw-green text-white"
                  : active
                    ? "bg-imigongo-clay text-white"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {complete ? <Check className="size-4" aria-hidden="true" /> : index + 1}
            </div>
            <div className="truncate text-xs font-medium">{item.label}</div>
          </li>
        );
      })}
    </ol>
  );
}

function TopicStep({
  topics,
  selectedTopicId,
  customTopic,
  researchPending,
  onSelectTopic,
  onCustomTopicChange,
  onRunResearch,
}: {
  topics: WizardTopic[];
  selectedTopicId: string;
  customTopic: string;
  researchPending: boolean;
  onSelectTopic: (id: string) => void;
  onCustomTopicChange: (value: string) => void;
  onRunResearch: () => void;
}) {
  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-[0.16em] text-rw-gold font-semibold">
          Step 1 of 4
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <h3 className="font-display text-3xl font-medium tracking-tight">
              What should this persona talk about?
            </h3>
            <p className="text-sm text-muted-foreground">
              Start from the persona's mission, or pull live research-backed
              angles before drafting.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void onRunResearch()}
            disabled={researchPending}
            className="gap-2 self-start sm:self-auto"
          >
            {researchPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-4" aria-hidden="true" />
            )}
            Refresh suggestions
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {topics.map((topic) => (
          <TopicCard
            key={topic.id}
            topic={topic}
            selected={selectedTopicId === topic.id}
            onSelect={() => onSelectTopic(topic.id)}
          />
        ))}
      </div>

      <div className="space-y-2">
        <label htmlFor="post-wizard-custom-topic" className="text-sm font-medium">
          Or write a custom topic
        </label>
        <Textarea
          id="post-wizard-custom-topic"
          rows={2}
          value={customTopic}
          onChange={(event) => onCustomTopicChange(event.target.value)}
          placeholder="e.g. The internet shutdown made ordinary errands feel suspicious."
          className="resize-none bg-background/60"
        />
      </div>
    </section>
  );
}

function TopicCard({
  topic,
  selected,
  onSelect,
}: {
  topic: WizardTopic;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "min-h-36 rounded-lg border bg-card p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected
          ? "border-imigongo-clay bg-rw-gold-soft/25"
          : "border-imigongo-clay/20 hover:border-imigongo-clay/45",
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h4 className="text-base font-semibold leading-snug">{topic.label}</h4>
        {topic.source ? (
          <Badge variant="secondary" className="shrink-0 bg-rw-green/10 text-rw-green">
            Live
          </Badge>
        ) : null}
      </div>
      <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
        {topic.description}
      </p>
      {topic.source ? (
        <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Search className="size-3" aria-hidden="true" />
          {topic.source}
        </div>
      ) : null}
    </button>
  );
}

function OptionStep({
  eyebrow,
  title,
  description,
  options,
  selectedId,
  onSelect,
}: {
  eyebrow: string;
  title: string;
  description: string;
  options: WizardOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-[0.16em] text-rw-gold font-semibold">
          {eyebrow}
        </div>
        <h3 className="font-display text-3xl font-medium tracking-tight">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(option.id)}
            className={cn(
              "min-h-32 rounded-lg border bg-card p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              selectedId === option.id
                ? "border-imigongo-clay bg-rw-gold-soft/25"
                : "border-imigongo-clay/20 hover:border-imigongo-clay/45",
            )}
          >
            <h4 className="mb-2 text-base font-semibold">{option.label}</h4>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {option.description}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}

function DetailStep({
  detail,
  onDetailChange,
}: {
  detail: string;
  onDetailChange: (value: string) => void;
}) {
  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-[0.16em] text-rw-gold font-semibold">
          Step 4 of 4
        </div>
        <h3 className="font-display text-3xl font-medium tracking-tight">
          Add a detail
        </h3>
        <p className="text-sm text-muted-foreground">
          Optional, but a specific fact or local reference usually makes the
          post feel less generic.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="post-wizard-detail" className="text-sm font-medium">
          Specific detail, fact, or personal twist
        </label>
        <Textarea
          id="post-wizard-detail"
          rows={4}
          value={detail}
          onChange={(event) => onDetailChange(event.target.value)}
          placeholder="e.g. A neighbor waited two hours for the bus after the latest road closure."
          className="resize-y bg-background/60"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {DETAIL_HINTS.map((hint, index) => (
          <button
            key={hint}
            type="button"
            onClick={() => onDetailChange(detail ? `${detail}\n${hint}` : hint)}
            className="rounded-lg border border-imigongo-clay/20 bg-card p-3 text-left text-sm text-muted-foreground transition-colors hover:border-imigongo-clay/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="mb-2 block text-[11px] uppercase tracking-[0.14em] text-rw-gold font-semibold">
              Hint {index + 1}
            </span>
            {hint}
          </button>
        ))}
      </div>
    </section>
  );
}

function buildBaseTopics(persona: Persona): WizardTopic[] {
  const name = persona.display_name ?? persona.name;
  const cause = persona.cause?.trim();
  const region = persona.region?.trim();
  const bio = persona.bio?.trim();

  return [
    {
      id: "cause",
      label: cause ? `${cause}` : `${name}'s core issue`,
      description:
        bio ||
        "Use the persona's public mission and system prompt as the grounding for this post.",
      sourceUrls: [],
    },
    {
      id: "local-consequence",
      label: region && cause ? `${cause} in ${region}` : "Local consequence",
      description:
        "Turn a broad issue into an everyday consequence that a reader can picture.",
      sourceUrls: [],
    },
    {
      id: "accountability",
      label: "Accountability moment",
      description:
        "Name the gap between official language and the reality people are living with.",
      sourceUrls: [],
    },
    {
      id: "hope",
      label: "Reason to keep watching",
      description:
        "A post that gives supporters a clear reason to stay attentive without exaggeration.",
      sourceUrls: [],
    },
  ];
}

function buildResearchQuery(persona: Persona): string {
  const parts = [
    persona.region,
    persona.cause,
    persona.bio,
    persona.tone,
  ].flatMap((value) => (value?.trim() ? [value.trim()] : []));
  const seed = parts.length > 0 ? parts.join(" ") : persona.name;
  return `${seed} recent human rights press freedom civic rights reporting`;
}

function resultToTopic(result: SearchResult, index: number): WizardTopic {
  return {
    id: `research-${index}-${result.url}`,
    label: result.title,
    description: result.excerpt,
    source: result.source,
    sourceUrls: [result.url],
  };
}

function buildDraftPrompt(args: {
  persona: Persona;
  topic: string;
  topicDescription: string | undefined;
  angle: WizardOption;
  format: WizardOption;
  detail: string;
  sourceUrls: string[];
}): string {
  const personaFacts = [
    `Persona name: ${args.persona.display_name ?? args.persona.name}`,
    args.persona.cause ? `Cause: ${args.persona.cause}` : undefined,
    args.persona.region ? `Region: ${args.persona.region}` : undefined,
    args.persona.tone ? `Stored tone notes: ${args.persona.tone}` : undefined,
    args.persona.bio ? `Public bio: ${args.persona.bio}` : undefined,
  ].filter(Boolean);

  return [
    "Draft one finished Nostr text post for the active persona.",
    "Use the persona voice from the system prompt. Do not explain the choices.",
    "Do not include headings, labels, hashtags unless they are genuinely natural, or markdown formatting.",
    "Keep it concise enough for a social feed. Prefer 2 to 5 short paragraphs.",
    "Do not invent facts. If sources are listed, use only what can be reasonably inferred from the topic and source notes.",
    "",
    ...personaFacts,
    "",
    `Topic: ${args.topic}`,
    args.topicDescription ? `Topic note: ${args.topicDescription}` : undefined,
    `Angle: ${args.angle.label} - ${args.angle.description}`,
    `Format: ${args.format.label} - ${args.format.description}`,
    args.detail ? `Required detail to weave in: ${args.detail}` : undefined,
    args.sourceUrls.length > 0
      ? `Source URLs for attribution tags: ${args.sourceUrls.join(", ")}`
      : undefined,
    "",
    "Return only the post text.",
  ]
    .filter(Boolean)
    .join("\n");
}
