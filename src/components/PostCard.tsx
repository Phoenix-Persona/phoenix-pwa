import { useMemo } from "react";
import type { NostrEvent } from "@nostrify/nostrify";
import { ExternalLink } from "lucide-react";

import { BrandedVideo } from "./BrandedVideo";
import { PostBody } from "./PostBody";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { XLogo } from "@/components/icons/XLogo";
import { useAppContext } from "@/hooks/useAppContext";
import { useNostrViewer } from "@/hooks/useNostrViewer";
import {
  buildEventUrl,
  encodeEventAsNevent,
  truncateNevent,
} from "@/lib/nostrViewer";
import {
  extractImetaImages,
  extractImetaVideos,
  extractSourceDomains,
} from "@/lib/personaPost";
import { postToTwitterIntent } from "@/lib/twitter/intent";
import { cn } from "@/lib/utils";

const NEVENT_RELAY_HINT_LIMIT = 3;

interface PostCardProps {
  event: NostrEvent;
  className?: string;
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

export function PostCard({ event, className }: PostCardProps) {
  const domains = useMemo(() => extractSourceDomains(event.tags), [event.tags]);
  const images = useMemo(() => extractImetaImages(event.tags), [event.tags]);
  const videos = useMemo(() => extractImetaVideos(event.tags), [event.tags]);
  const absoluteTime = useMemo(
    () => new Date(event.created_at * 1000).toLocaleString(),
    [event.created_at]
  );
  const { viewerUrl } = useNostrViewer();
  const { config } = useAppContext();
  const relayHints = useMemo(
    () =>
      config.relayMetadata.relays
        .filter((r) => r.write)
        .slice(0, NEVENT_RELAY_HINT_LIMIT)
        .map((r) => r.url),
    [config.relayMetadata.relays]
  );
  const nevent = useMemo(
    () =>
      encodeEventAsNevent(
        { id: event.id, pubkey: event.pubkey, kind: event.kind },
        relayHints,
      ),
    [event.id, event.pubkey, event.kind, relayHints]
  );
  const eventUrl = useMemo(
    () => buildEventUrl(viewerUrl, nevent),
    [viewerUrl, nevent]
  );

  // Layout: 1 image fills full width; 2 images split half-half;
  // 3+ images use a 2-column grid with the first one spanning.
  const imageGridClass =
    images.length === 1
      ? "grid grid-cols-1"
      : images.length === 2
      ? "grid grid-cols-2 gap-1.5"
      : "grid grid-cols-2 gap-1.5";

  return (
    <article
      className={cn(
        "group rounded-xl border border-border bg-card p-5 transition-colors hover:border-imigongo-clay/40",
        className
      )}
    >
      <PostBody content={event.content} />

      {videos.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {videos.slice(0, 2).map((v, idx) => (
            <BrandedVideo
              key={`${v.url}-${idx}`}
              src={v.url}
              poster={v.poster}
              alt={v.alt}
            />
          ))}
        </div>
      )}

      {images.length > 0 && (
        <div className={cn("mt-4 overflow-hidden rounded-lg", imageGridClass)}>
          {images.slice(0, 4).map((img, idx) => {
            // First image of a 3+ set spans both columns.
            const span =
              images.length >= 3 && idx === 0 ? "col-span-2" : "";
            return (
              <a
                key={`${img.url}-${idx}`}
                href={img.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className={cn(
                  "block bg-muted overflow-hidden",
                  images.length === 1 ? "rounded-lg" : "rounded-md",
                  span
                )}
                aria-label={img.alt ?? "Post image"}
              >
                <img
                  src={img.url}
                  alt={img.alt ?? ""}
                  loading="lazy"
                  crossOrigin="anonymous"
                  className={cn(
                    "w-full h-full object-cover",
                    images.length === 1
                      ? "max-h-[28rem]"
                      : "aspect-square"
                  )}
                />
              </a>
            );
          })}
        </div>
      )}

      {domains.length > 0 && (
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
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-border/60 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <time
          dateTime={new Date(event.created_at * 1000).toISOString()}
          title={absoluteTime}
        >
          {relativeTime(event.created_at)}
        </time>
        <div className="flex items-center gap-3">
          <a
            href={eventUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={nevent}
            className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {truncateNevent(nevent)}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs hover:bg-black/5"
            onClick={() =>
              postToTwitterIntent({
                text: event.content,
                mediaUrl: videos[0]?.url ?? images[0]?.url,
              })
            }
            title="Open X compose tab with this post pre-filled. If there's a video, it'll start downloading so you can attach it."
          >
            <XLogo className="mr-1 size-3" aria-hidden="true" />
            Post to X
          </Button>
        </div>
      </div>
    </article>
  );
}
