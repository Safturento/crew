import type { ReactNode } from 'react';

interface SectionProps {
  title: ReactNode;
  /** Small dimmed count/qualifier after the title (e.g. "2 supervisor-held"). */
  count?: ReactNode;
  /** Optional one-line hint under the header (e.g. the auto-clear note). */
  hint?: ReactNode;
  children: ReactNode;
}

/**
 * A Runner-page section: a header (title + dimmed count + optional hint) over
 * a vertical stack of rows. Used by every section so spacing + the header
 * treatment stay identical across the page.
 */
export function Section({ title, count, hint, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {count !== undefined && <span className="text-xs text-muted-foreground">{count}</span>}
        </div>
        {hint !== undefined && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}
