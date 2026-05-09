/**
 * A horizontal band rendered with the Imigongo geometric pattern.
 * Used as a section divider and a visual signature for the brand.
 */

import { cn } from "@/lib/utils";

interface ImigongoBandProps {
  className?: string;
  height?: number;
}

export function ImigongoBand({ className, height = 24 }: ImigongoBandProps) {
  return (
    <div
      className={cn(
        "imigongo-pattern w-full text-imigongo-clay",
        className
      )}
      style={{ height }}
      aria-hidden="true"
    />
  );
}
