/**
 * PersonaStatsBadge — compact "N posts · last active 3d ago" caption
 * for a single persona card.
 *
 * Reads from the parent's `usePersonaActivityStats` Map (one batched
 * query per directory page) so we don't fire N queries when several
 * cards mount at once. Callers pass the resolved stats directly.
 */

import { Activity } from "lucide-react";

import type { PersonaActivityStats } from "@/hooks/usePersona";
import { cn } from "@/lib/utils";

interface PersonaStatsBadgeProps {
  stats: PersonaActivityStats | undefined;
  loading?: boolean;
  className?: string;
}

/** Compact relative-time formatter — "3d", "5h", "just now". */
function shortRelative(unixSec: number): string {
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000) - unixSec);
  if (diffSec < 60) return "just now";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.floor(day / 365);
  return `${yr}y ago`;
}

function formatPostCount(n: number): string {
  if (n < 1000) return `${n} ${n === 1 ? "post" : "posts"}`;
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k posts`;
  return `${Math.round(n / 1000)}k posts`;
}

export function PersonaStatsBadge({
  stats,
  loading = false,
  className,
}: PersonaStatsBadgeProps) {
  // While the batched query resolves, render a skeleton-ish placeholder
  // that occupies the same space so the card doesn't reflow on load.
  if (loading || !stats) {
    return (
      <div
        className={cn(
          "flex items-center gap-1.5 text-[11px] text-muted-foreground/60",
          className
        )}
        aria-hidden="true"
      >
        <Activity className="size-3" />
        <span className="inline-block h-3 w-24 rounded bg-muted/60 animate-pulse" />
      </div>
    );
  }

  const { postCount, lastActive } = stats;
  const noActivity = postCount === 0;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-[11px] text-muted-foreground",
        className
      )}
    >
      <Activity className="size-3 text-imigongo-clay/70" aria-hidden="true" />
      {noActivity ? (
        <span>No posts yet</span>
      ) : (
        <>
          <span className="font-medium">{formatPostCount(postCount)}</span>
          {lastActive !== null && (
            <>
              <span aria-hidden="true">·</span>
              <span>active {shortRelative(lastActive)}</span>
            </>
          )}
        </>
      )}
    </div>
  );
}
