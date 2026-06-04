import * as React from 'react';

import { cn } from '@/lib/utils';

type ModalSelectionRowProps = {
  primary: string;
  secondary?: string;
  meta?: string;
  badge?: React.ReactNode;
  onClick?: () => void;
  className?: string;
};

function ModalSelectionRow({
  primary,
  secondary,
  meta,
  badge,
  onClick,
  className,
}: ModalSelectionRowProps) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-left',
        onClick && 'cursor-pointer transition-colors hover:border-ring',
        className,
      )}
    >
      <div className="flex items-baseline gap-2 truncate">
        <span className="text-sm font-medium text-foreground">{primary}</span>
        {secondary && (
          <span className="truncate font-mono text-xs text-muted-foreground">{secondary}</span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {meta && <span className="font-mono text-xs text-muted-foreground">{meta}</span>}
        {badge}
      </div>
    </Comp>
  );
}

export { ModalSelectionRow };
