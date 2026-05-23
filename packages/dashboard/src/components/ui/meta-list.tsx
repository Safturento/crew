import { Children, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface MetaListProps {
  children: ReactNode;
  className?: string;
}

/**
 * Inline metadata strip. Each child renders inside its own `<li>`; the
 * dot separator is injected via CSS on adjacent siblings, so call sites
 * never need to interleave `·` manually. Used by AgentRow, DrawerHeader,
 * and TimelineSection — keep new metadata strips going through this
 * component instead of inlining `·` in JSX.
 */
export function MetaList({ children, className }: MetaListProps) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <ul
      className={cn(
        'flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground',
        "[&>li+li]:before:mr-2 [&>li+li]:before:content-['·'] [&>li+li]:before:text-muted-foreground/40",
        className,
      )}
    >
      {items.map((child, i) => (
        <li key={i} className="inline-flex items-center gap-1.5">
          {child}
        </li>
      ))}
    </ul>
  );
}
