import { useMemo } from "react";
import type { NostrEvent } from "@nostrify/nostrify";

import { PostBody } from "./PostBody";
import { Badge } from "@/components/ui/badge";
import { extractSourceDomains } from "@/lib/personaPost";
import { cn } from "@/lib/utils";

interface PostCardProps {
  event: NostrEvent;
  className?: string;
  /** Show a subtle "Phoenix-styled" badge in the operator's own dashboard. Off by default. */
  showOperatorBadge?: boolean;
}

function relativeTime(unixSec: number): string {
  const ms = unixSec * 1000;
  const diff = Date.now() - ms;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PostCard({ event, className, showOperatorBadge }: PostCardProps) {
  const domains = useMemo(() => extractSourceDomains(event.tags), [event.tags]);
  const absoluteTime = useMemo(
    () => new Date(event.created_at * 1000).toLocaleString(),
    [event.created_at]
  );

  return (
    <article
      className={cn(
        "group rounded-xl border border-border bg-card p-5 transition-colors hover:border-imigongo-clay/40",
        className
      )}
    >
      <PostBody content={event.content} />

      {(domains.length > 0 || showOperatorBadge) && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {domains.map((d) => (
            <Badge
              key={d}
              variant="outline"
              className="text-[10px] font-normal tracking-wide"
            >
              {d}
            </Badge>
          ))}
          {showOperatorBadge && (
            <Badge
              variant="secondary"
              className="text-[10px] font-medium bg-rw-gold/15 text-imigongo-charcoal border-rw-gold/30"
            >
              Phoenix-styled
            </Badge>
          )}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground">
        <time dateTime={new Date(event.created_at * 1000).toISOString()} title={absoluteTime}>
          {relativeTime(event.created_at)}
        </time>
      </div>
    </article>
  );
}
