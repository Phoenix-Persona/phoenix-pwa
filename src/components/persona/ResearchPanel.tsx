/**
 * Research sheet — opens from the right side of the composer and
 * surfaces recent coverage from trusted human-rights / press-freedom
 * sources via PPQ's web-search plugin (data enrichment).
 *
 * Why a Sheet (not a Dialog): the operator should be able to research
 * AND keep an eye on the idea textarea behind the panel. The Sheet
 * overlay grays-out the page but the side layout keeps the composer
 * within reach when the user closes it.
 *
 * Two injection actions per result:
 *   - "Add as source"  → appends URL to `sourcesInput` (becomes an `r`
 *     tag on the published kind 1)
 *   - "Quote in idea" → appends a citation block to the idea textarea
 *     so the persona's voice can build on the headline directly
 *
 * Curated topic chips at the top fire the same search instantly so a
 * fresh-onboarding user has zero-typing entry points.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Globe, Loader2, Quote, Search, Tag } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { XLogo } from "@/components/icons/XLogo";
import {
  useResearchSearch,
  type ResearchSearchInput,
} from "@/hooks/useResearchSearch";
import type { PpqAccountOptions } from "@/hooks/usePpqAccount";
import { useToast } from "@/hooks/useToast";
import type { SearchResult } from "@/lib/ppq/search";
import { cn } from "@/lib/utils";

/**
 * Curated topic seeds. One-tap entry points.
 *
 * `web` chips → Claude + the `web` plugin (Exa.AI) — best for
 * institutional sources that publish HTML articles.
 *
 * `x-user` chips → PPQ's `/v1/data/x/tweets/user` data-enrichment
 * endpoint — real recent tweets from the named handle, with article
 * URLs surfaced from each tweet's expanded entities.
 */
type CuratedTopic =
  | { source: "web"; label: string; query: string }
  | { source: "x-user"; label: string; handle: string };

const CURATED_TOPICS: CuratedTopic[] = [
  { source: "web", label: "Rwanda human rights", query: "Rwanda human rights" },
  {
    source: "web",
    label: "Human Rights Watch",
    query: "Human Rights Watch latest reports",
  },
  {
    source: "web",
    label: "Human Rights Foundation",
    query: "Human Rights Foundation campaigns",
  },
  {
    source: "web",
    label: "Press freedom Africa",
    query: "press freedom Africa 2025 2026",
  },
  {
    source: "web",
    label: "Political prisoners",
    query: "political prisoners advocacy releases",
  },
  {
    source: "web",
    label: "Reporters Without Borders",
    query: "Reporters Without Borders press index",
  },
  {
    source: "web",
    label: "Censorship",
    query: "internet censorship recent reports",
  },
  {
    source: "web",
    label: "Amnesty International",
    query: "Amnesty International recent statements",
  },
  // Verified Rwandan independent reporting handles — pulled live via
  // PPQ's X data-enrichment endpoint, not just web search around the
  // handle.
  { source: "x-user", label: "@ChroniclesRW", handle: "ChroniclesRW" },
  { source: "x-user", label: "@therwandaeditor", handle: "therwandaeditor" },
  { source: "x-user", label: "@Jambonewsnet", handle: "Jambonewsnet" },
];

/** Match explicit `@handle` searches. Bare single-word topics stay web searches. */
const HANDLE_RE = /^@([A-Za-z0-9_]{1,32})$/;

export interface ResearchPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Append a URL to the composer's Sources textarea. */
  onAddSource: (url: string) => void;
  /** Append a quoted block to the composer's Idea textarea. */
  onQuoteIntoIdea: (text: string) => void;
  ppqAccountOptions?: PpqAccountOptions;
}

export function ResearchPanel(props: ResearchPanelProps) {
  const { open, onOpenChange, onAddSource, onQuoteIntoIdea, ppqAccountOptions } = props;
  const { toast } = useToast();
  const research = useResearchSearch(ppqAccountOptions);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  /**
   * The discriminated input that's currently being shown / loading.
   * `null` means we haven't searched yet (fresh-open empty state).
   */
  const [activeInput, setActiveInput] = useState<ResearchSearchInput | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * What the free-text input would search if Enter were pressed
   * right now. `@handle` (single token) → x-user; otherwise → web.
   * Memoized so the Search button can show the correct icon and the
   * active-pill highlighting can find the match.
   */
  const detectedInput = useMemo<ResearchSearchInput | null>(() => {
    const trimmed = query.trim();
    if (!trimmed) return null;
    const m = trimmed.match(HANDLE_RE);
    if (m) return { source: "x-user", handle: m[1] };
    return { source: "web", query: trimmed };
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  async function runSearch(input: ResearchSearchInput) {
    setActiveInput(input);
    setResults([]);
    try {
      const items = await research.mutateAsync(input);
      setResults(items);
      if (items.length === 0) {
        toast({
          title: "No results",
          description:
            "The search came back empty — try a broader topic or a specific source.",
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast({
        title: "Search failed",
        description: message,
        variant: "destructive",
      });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl flex flex-col p-0 gap-0"
      >
        <SheetHeader className="px-6 py-5 border-b border-imigongo-clay/15 bg-gradient-to-r from-rw-sky/5 via-rw-gold/10 to-rw-green/5">
          <SheetTitle className="font-display text-xl font-medium tracking-tight inline-flex items-center gap-2">
            <Search className="size-4 text-imigongo-clay" aria-hidden="true" />
            Research
          </SheetTitle>
          <SheetDescription className="text-xs">
            Pull recent coverage from trusted human-rights and
            press-freedom sources to ground your post.
          </SheetDescription>
        </SheetHeader>

        {/* Input + topic chips */}
        <div className="px-6 py-4 space-y-3 border-b border-imigongo-clay/10">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (detectedInput) void runSearch(detectedInput);
            }}
            className="flex gap-2"
          >
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="@handle (live X search) or topic (web search)…"
              disabled={research.isPending}
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={!detectedInput || research.isPending}
              className="shadow-md shadow-primary/20"
              title={
                detectedInput?.source === "x-user"
                  ? `Live X search for @${detectedInput.handle}`
                  : "Web search"
              }
            >
              {research.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : detectedInput?.source === "x-user" ? (
                <XLogo className="size-3.5" aria-hidden="true" />
              ) : (
                <Globe className="size-4 text-rw-sky" aria-hidden="true" />
              )}
              <span className="ml-2">Search</span>
            </Button>
          </form>
          <div className="flex flex-wrap gap-1.5">
            {CURATED_TOPICS.map((t) => {
              const active = topicMatchesActive(t, activeInput);
              const onClick = () => {
                setQuery(t.label);
                void runSearch(
                  t.source === "x-user"
                    ? { source: "x-user", handle: t.handle }
                    : { source: "web", query: t.query },
                );
              };
              return (
                <button
                  key={`${t.source}-${t.label}`}
                  type="button"
                  disabled={research.isPending}
                  onClick={onClick}
                  title={
                    t.source === "x-user"
                      ? `Live X search · @${t.handle}`
                      : "Web search"
                  }
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                    "border-imigongo-clay/20 bg-card hover:border-imigongo-clay/40",
                    "disabled:opacity-50",
                    active
                      ? "border-rw-gold bg-rw-gold/15 text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {t.source === "x-user" ? (
                    <XLogo className="size-2.5" aria-hidden="true" />
                  ) : (
                    <Globe className="size-3 text-rw-sky" aria-hidden="true" />
                  )}
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Results scrollable area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {research.isPending ? (
            <ResearchSkeleton />
          ) : results.length === 0 ? (
            <ResearchEmpty hasSearched={activeInput !== null} />
          ) : (
            <ul className="space-y-3">
              {results.map((r, idx) => (
                <ResultCard
                  key={`${r.url}-${idx}`}
                  result={r}
                  onAddSource={() => {
                    onAddSource(r.url);
                    toast({
                      title: "Added source",
                      description: r.title.slice(0, 80),
                    });
                  }}
                  onQuoteIntoIdea={() => {
                    onQuoteIntoIdea(formatQuote(r));
                    toast({
                      title: "Quoted in your idea",
                      description: "Edit the idea textarea to refine.",
                    });
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ---------- subcomponents ---------- */

function ResultCard(props: {
  result: SearchResult;
  onAddSource: () => void;
  onQuoteIntoIdea: () => void;
}) {
  const { result, onAddSource, onQuoteIntoIdea } = props;
  const domain = safeDomain(result.url);

  return (
    <li className="rounded-xl border border-border bg-card p-4 space-y-2.5 hover:border-imigongo-clay/40 transition-colors">
      <div className="space-y-1.5">
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="block group"
        >
          <h3 className="text-sm font-semibold leading-snug group-hover:text-imigongo-clay transition-colors">
            {result.title}
          </h3>
        </a>
        <p className="text-xs text-muted-foreground line-clamp-3">
          {result.excerpt}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
        <Badge
          variant="secondary"
          className="text-[10px] font-normal tracking-wide"
        >
          {result.source}
        </Badge>
        {domain && (
          <Badge
            variant="outline"
            className="text-[10px] font-normal tracking-wide"
          >
            {domain}
          </Badge>
        )}
        {result.publishedAt && (
          <span className="font-mono">{formatPublished(result.publishedAt)}</span>
        )}
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="ml-auto inline-flex items-center gap-1 hover:text-foreground transition-colors"
          aria-label="Open source in a new tab"
        >
          Open
          <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      </div>
      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/60">
        <Button
          variant="outline"
          size="sm"
          onClick={onAddSource}
          className="h-7 text-xs"
        >
          <Tag className="mr-1.5 size-3" aria-hidden="true" />
          Add as source
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onQuoteIntoIdea}
          className="h-7 text-xs"
        >
          <Quote className="mr-1.5 size-3" aria-hidden="true" />
          Quote in idea
        </Button>
      </div>
    </li>
  );
}

function ResearchSkeleton() {
  return (
    <ul className="space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <li
          key={i}
          className="rounded-xl border border-border bg-card p-4 space-y-2"
        >
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <div className="flex gap-1.5 pt-1">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ResearchEmpty(props: { hasSearched: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center text-center text-sm text-muted-foreground py-16 space-y-2">
      <Search
        className="size-8 text-imigongo-clay/30"
        aria-hidden="true"
      />
      <p>
        {props.hasSearched
          ? "No results came back. Try a broader topic."
          : "Pick a topic above or type your own to pull recent coverage."}
      </p>
    </div>
  );
}

/* ---------- helpers ---------- */

/**
 * True iff the curated chip matches the currently-active search.
 * Used to highlight the chip golden when its results are showing.
 */
function topicMatchesActive(
  topic: CuratedTopic,
  active: ResearchSearchInput | null,
): boolean {
  if (!active) return false;
  if (topic.source === "web" && active.source === "web") {
    return topic.query === active.query;
  }
  if (topic.source === "x-user" && active.source === "x-user") {
    return topic.handle.toLowerCase() === active.handle.toLowerCase();
  }
  return false;
}

function safeDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function formatPublished(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format a result as a quotable block that goes straight into the
 * Idea textarea. The persona's downstream styling pass will rewrite
 * it in voice; the link tail keeps the citation traceable.
 */
function formatQuote(r: SearchResult): string {
  const lines = [`"${r.excerpt.trim()}"`, `— ${r.source}`, r.url];
  return lines.join("\n");
}
