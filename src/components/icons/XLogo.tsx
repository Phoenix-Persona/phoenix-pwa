/**
 * X (formerly Twitter) wordmark glyph as an inline SVG.
 *
 * lucide-react ships a Twitter bird, not the new X mark — keeping
 * branding consistent with X's current identity matters when users
 * are choosing whether to "Post to X."
 *
 * Sized via Tailwind utility classes (size-3, size-4, etc.) like any
 * lucide icon.
 */

import type { SVGProps } from "react";

export function XLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231ZM17.083 19.77h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}
