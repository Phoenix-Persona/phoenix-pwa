import { Heart, MessageCircle, Zap } from "lucide-react";
import type { NostrEvent } from "@nostrify/nostrify";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuthor } from "@/hooks/useAuthor";
import { usePostInteractions } from "@/hooks/usePostInteractions";
import { genUserName } from "@/lib/genUserName";
import {
  extractZapAmountSats,
  extractZapComment,
  extractZapperPubkey,
  formatSatsCompact,
} from "@/lib/postInteractions";
import { sanitizeHttpUrl } from "@/lib/url";
import { cn } from "@/lib/utils";

const LIST_LIMIT = 20;

interface PostInteractionBadgesProps {
  eventId: string;
}

function relativeTime(unixSec: number): string {
  const diffSec = Math.round((Date.now() - unixSec * 1000) / 1000);
  if (diffSec < 60) return "just now";
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(unixSec * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function PostInteractionBadges({ eventId }: PostInteractionBadgesProps) {
  const { data, isLoading } = usePostInteractions(eventId);
  const replies = data?.replies ?? [];
  const reactions = data?.reactions ?? [];
  const zaps = data?.zaps ?? [];

  const totalZapSats = zaps.reduce(
    (sum, z) => sum + (extractZapAmountSats(z) ?? 0),
    0,
  );

  return (
    <>
      <BadgeButton
        icon={<MessageCircle className="size-3.5" aria-hidden="true" />}
        count={replies.length.toString()}
        label="comments"
        loading={isLoading}
        empty={replies.length === 0}
        ariaLabel={`${replies.length} comments`}
      >
        <BadgeListShell title="Comments" empty={replies.length === 0}>
          {replies.slice(0, LIST_LIMIT).map((event) => (
            <CommentRow key={event.id} event={event} />
          ))}
        </BadgeListShell>
      </BadgeButton>

      <BadgeButton
        icon={<Heart className="size-3.5" aria-hidden="true" />}
        count={reactions.length.toString()}
        label="likes"
        loading={isLoading}
        empty={reactions.length === 0}
        ariaLabel={`${reactions.length} likes`}
      >
        <BadgeListShell title="Likes" empty={reactions.length === 0}>
          {reactions.slice(0, LIST_LIMIT).map((event) => (
            <ReactionRow key={event.id} event={event} />
          ))}
        </BadgeListShell>
      </BadgeButton>

      <BadgeButton
        icon={<Zap className="size-3.5" aria-hidden="true" />}
        count={
          zaps.length === 0
            ? "0"
            : totalZapSats > 0
            ? `${formatSatsCompact(totalZapSats)} · ${zaps.length}`
            : zaps.length.toString()
        }
        label="zaps"
        loading={isLoading}
        empty={zaps.length === 0}
        ariaLabel={`${zaps.length} zaps totalling ${totalZapSats} sats`}
      >
        <BadgeListShell title="Zaps" empty={zaps.length === 0}>
          {zaps.slice(0, LIST_LIMIT).map((event) => (
            <ZapRow key={event.id} event={event} />
          ))}
        </BadgeListShell>
      </BadgeButton>
    </>
  );
}

interface BadgeButtonProps {
  icon: React.ReactNode;
  count: string;
  label: string;
  loading?: boolean;
  empty?: boolean;
  ariaLabel: string;
  children: React.ReactNode;
}

function BadgeButton({
  icon,
  count,
  loading,
  empty,
  ariaLabel,
  children,
}: BadgeButtonProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={loading || empty}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/40 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors",
            empty
              ? "opacity-60"
              : "hover:bg-muted hover:text-foreground hover:border-border",
            "disabled:cursor-default",
          )}
        >
          {icon}
          <span className="tabular-nums">{count}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        {children}
      </PopoverContent>
    </Popover>
  );
}

function BadgeListShell({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col max-h-80">
      <div className="px-3 py-2 border-b border-border/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {empty ? (
        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
          No {title.toLowerCase()} yet.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-border/40">
          {children}
        </div>
      )}
    </div>
  );
}

function AuthorChip({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const meta = author.data?.metadata;
  const displayName = meta?.display_name ?? meta?.name ?? genUserName(pubkey);
  const picture = sanitizeHttpUrl(meta?.picture);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Avatar className="size-6 shrink-0">
        {picture ? (
          <AvatarImage
            src={picture}
            alt=""
            crossOrigin="anonymous"
          />
        ) : null}
        <AvatarFallback className="text-[10px]">
          {displayName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="truncate text-xs font-medium">{displayName}</span>
    </div>
  );
}

function CommentRow({ event }: { event: NostrEvent }) {
  return (
    <div className="px-3 py-2 space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <AuthorChip pubkey={event.pubkey} />
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {relativeTime(event.created_at)}
        </span>
      </div>
      <p className="text-xs text-foreground/90 line-clamp-3 whitespace-pre-wrap break-words">
        {event.content}
      </p>
    </div>
  );
}

function ReactionRow({ event }: { event: NostrEvent }) {
  const symbol =
    event.content && event.content.trim().length > 0 ? event.content : "+";
  return (
    <div className="px-3 py-2 flex items-center justify-between gap-2 min-w-0">
      <AuthorChip pubkey={event.pubkey} />
      <div className="shrink-0 flex items-center gap-2">
        <span className="text-sm">{symbol}</span>
        <span className="text-[10px] text-muted-foreground">
          {relativeTime(event.created_at)}
        </span>
      </div>
    </div>
  );
}

function ZapRow({ event }: { event: NostrEvent }) {
  const sats = extractZapAmountSats(event);
  const comment = extractZapComment(event);
  const zapperPubkey = extractZapperPubkey(event);
  return (
    <div className="px-3 py-2 space-y-1 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <AuthorChip pubkey={zapperPubkey} />
        <div className="shrink-0 flex items-center gap-2">
          {sats !== undefined ? (
            <span className="font-mono text-xs font-semibold text-rw-gold">
              {sats.toLocaleString()} sats
            </span>
          ) : null}
          <span className="text-[10px] text-muted-foreground">
            {relativeTime(event.created_at)}
          </span>
        </div>
      </div>
      {comment ? (
        <p className="text-xs text-foreground/90 line-clamp-2 whitespace-pre-wrap break-words">
          {comment}
        </p>
      ) : null}
    </div>
  );
}
