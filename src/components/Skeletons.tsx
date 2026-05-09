/**
 * Layout-matched skeletons. They mirror the real component dimensions so the
 * loading-to-loaded transition doesn't cause layout shift.
 */

import { Skeleton } from "@/components/ui/skeleton";

export function PersonaHeaderSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-imigongo-clay via-rw-gold to-rw-green opacity-50" />
      <div className="space-y-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <Skeleton className="h-4 w-2/3 max-w-md" />
      </div>
    </div>
  );
}

export function PostCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Skeleton className="h-4 w-16 rounded-full" />
        <Skeleton className="h-4 w-20 rounded-full" />
      </div>
      <div className="pt-3 border-t border-border/60">
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

export function PostListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <ul className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i}>
          <PostCardSkeleton />
        </li>
      ))}
    </ul>
  );
}

export function PersonaCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-3 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-imigongo-clay via-rw-gold to-rw-green opacity-50" />
      <Skeleton className="h-3 w-32 mt-2" />
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <div className="flex gap-1.5 pt-1">
        <Skeleton className="h-4 w-10 rounded-full" />
        <Skeleton className="h-4 w-10 rounded-full" />
      </div>
    </div>
  );
}

export function PersonaGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <PersonaCardSkeleton key={i} />
      ))}
    </div>
  );
}
