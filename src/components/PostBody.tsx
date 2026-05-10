/**
 * Render a kind-1 post body with auto-linked URLs and hashtags.
 *
 * Security: never use innerHTML / dangerouslySetInnerHTML. We tokenize
 * the string and render React nodes. URLs are passed through a strict
 * https-only allowlist before becoming hrefs.
 */

import { Fragment, useMemo } from "react";
import { cn } from "@/lib/utils";
import { sanitizeHttpUrl } from "@/lib/url";

interface PostBodyProps {
  content: string;
  className?: string;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;
const HASHTAG_RE = /(?:^|\s)(#[\p{L}\p{N}_-]+)/gu;

type Token =
  | { kind: "text"; value: string }
  | { kind: "link"; value: string; href: string }
  | { kind: "hashtag"; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  // First pass: extract URLs to keep them whole.
  // We do this by walking the string and matching URLs greedily.
  const urlMatches: Array<{ start: number; end: number; href: string }> = [];
  for (const m of input.matchAll(URL_RE)) {
    if (m.index === undefined) continue;
    const sanitized = sanitizeHttpUrl(m[0]);
    if (!sanitized) continue;
    urlMatches.push({ start: m.index, end: m.index + m[0].length, href: sanitized });
  }

  function pushText(slice: string) {
    if (!slice) return;
    // Within the text slice, also tokenize hashtags.
    let last = 0;
    for (const m of slice.matchAll(HASHTAG_RE)) {
      if (m.index === undefined) continue;
      const tagStart = m.index + (m[0].length - m[1].length);
      if (tagStart > last) {
        tokens.push({ kind: "text", value: slice.slice(last, tagStart) });
      }
      tokens.push({ kind: "hashtag", value: m[1] });
      last = tagStart + m[1].length;
    }
    if (last < slice.length) {
      tokens.push({ kind: "text", value: slice.slice(last) });
    }
  }

  for (const u of urlMatches) {
    if (u.start > i) pushText(input.slice(i, u.start));
    tokens.push({ kind: "link", value: input.slice(u.start, u.end), href: u.href });
    i = u.end;
  }
  if (i < input.length) pushText(input.slice(i));

  return tokens;
}

export function PostBody({ content, className }: PostBodyProps) {
  const tokens = useMemo(() => tokenize(content), [content]);

  return (
    <p
      className={cn(
        "whitespace-pre-wrap leading-relaxed break-words",
        className
      )}
    >
      {tokens.map((t, idx) => {
        if (t.kind === "link") {
          return (
            <a
              key={idx}
              href={t.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary transition-colors"
            >
              {t.value}
            </a>
          );
        }
        if (t.kind === "hashtag") {
          return (
            <span
              key={idx}
              className="text-imigongo-clay font-medium"
            >
              {t.value}
            </span>
          );
        }
        return <Fragment key={idx}>{t.value}</Fragment>;
      })}
    </p>
  );
}
