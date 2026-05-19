import { cva } from 'class-variance-authority';

export type ColumnHeaderPlacement = 'per-section' | 'global' | 'floating' | 'tab';

const headerRow = cva(
  'grid items-center gap-3 grid-cols-[100px_90px_90px_70px_1fr_168px] font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground',
  {
    variants: {
      placement: {
        'per-section': 'border-b border-dashed border-white/10 px-4 pt-1.5 pb-2 mb-0.5',
        global: 'border-b border-white/10 bg-card px-4 py-2',
        floating: 'px-4 py-1 opacity-60',
        tab: 'border-b border-white/10 bg-popover px-4 py-2.5',
      },
    },
    defaultVariants: { placement: 'per-section' },
  },
);

interface ColumnHeaderRowProps {
  placement?: ColumnHeaderPlacement;
}

export function ColumnHeaderRow({ placement = 'per-section' }: ColumnHeaderRowProps) {
  return (
    <div role="row" aria-label="Column headers" className={headerRow({ placement })}>
      <span>State</span>
      <span>ID</span>
      <span className="text-right">Runtime</span>
      <span className="text-right">Tokens</span>
      <span>Title</span>
      <span className="sr-only">Actions</span>
    </div>
  );
}
