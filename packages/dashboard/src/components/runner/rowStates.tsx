import type { ReactNode } from 'react';

/**
 * A muted full-width row for a section's empty state (e.g. "No agents
 * currently running"). Same height/insets as a real Row so the section
 * doesn't jump when it populates.
 */
export function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-16 items-center rounded border border-white/10 bg-card px-4 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/** Placeholder skeleton rows shown while a section's data is loading. */
export function SkeletonRows({ count = 2 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          data-testid="skeleton-row"
          className="h-16 animate-pulse rounded border border-white/10 bg-card"
        />
      ))}
    </>
  );
}
