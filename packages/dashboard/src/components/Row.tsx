import type { KeyboardEvent, ReactNode } from 'react';

import type { AgentState } from '@/data/types';
import { STATE_CLASSES, STATE_META } from '@/data/state-meta';
import { cn } from '@/lib/utils';

export interface RowProps {
  /** Status pill / state badge — held in a fixed 96px (w-24) column so identity columns align across every row type. */
  statusSlot: ReactNode;
  /** Primary line. */
  title: ReactNode;
  /** Secondary line (meta / subheader). */
  subheader?: ReactNode;
  /** Right-aligned action cluster. */
  actions?: ReactNode;
  /**
   * Tints the row with the shared state accent. When the accent state is
   * attention-worthy (`STATE_META[accent].attention`) the row gets the
   * `STATE_CLASSES[accent]` bg + border, the pulsing left bar, and a
   * `data-attention` attribute. A non-attention accent (or none) keeps the
   * neutral `border-white/10`. Kept explicit (rather than derived from the
   * status-pill color) so a `cancelling` process — whose pill is amber but
   * whose row is plain — doesn't get wrongly tinted.
   */
  accent?: AgentState;
  /** Makes the row a clickable button (pointer + Enter/Space). */
  onActivate?: () => void;
  /** Accessible label for the interactive row. */
  ariaLabel?: string;
  className?: string;
}

const BASE =
  'group relative flex items-center h-16 gap-3 rounded border bg-card px-4 py-3 transition-colors';

export function Row({
  statusSlot,
  title,
  subheader,
  actions,
  accent,
  onActivate,
  ariaLabel,
  className,
}: RowProps) {
  const attention = accent ? STATE_META[accent].attention : false;
  const accentClasses =
    accent && attention
      ? `${STATE_CLASSES[accent].border} ${STATE_CLASSES[accent].bg}`
      : 'border-white/10';
  const interactive = onActivate !== undefined;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Only the row itself activates — a keydown bubbling up from an inner
    // control (a button in the actions slot) must not select the row.
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate?.();
    }
  };

  return (
    <div
      {...(interactive
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-label': ariaLabel,
            onClick: onActivate,
            onKeyDown,
          }
        : {})}
      data-attention={accent && attention ? accent : undefined}
      className={cn(BASE, accentClasses, interactive && 'cursor-pointer hover:bg-popover', className)}
    >
      {accent && attention && (
        <span
          aria-hidden
          className={`absolute inset-y-1.5 left-0 w-1 rounded-full ${STATE_CLASSES[accent].solidBg} animate-att-pulse`}
        />
      )}
      <div className="w-24">{statusSlot}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title}
        {subheader}
      </div>
      {actions}
    </div>
  );
}
