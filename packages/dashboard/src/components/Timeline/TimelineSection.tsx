import { ChevronDown, ChevronRight, Circle } from 'lucide-react';
import type { ReactNode } from 'react';

import { STATE_CLASSES, STATE_META } from '../../data/state-meta.js';
import type { AgentState } from '../../data/types.js';
import { formatDuration } from '../../format/duration.js';
import { formatTokens } from '../../format/tokens.js';
import { Badge } from '../ui/badge.js';

interface TimelineSectionProps {
  state: AgentState;
  startedAt: number;
  elapsedMs: number;
  eventCount: number;
  tokenSum: number;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function TimelineSection({
  state,
  startedAt,
  elapsedMs,
  eventCount,
  tokenSum,
  isOpen,
  onToggle,
  children,
}: TimelineSectionProps) {
  const meta = STATE_META[state];
  const timestamp = new Date(startedAt).toISOString().slice(11, 19);

  return (
    <section
      data-testid="timeline-section"
      data-state={state}
      className={`overflow-hidden rounded-[5px] border ${STATE_CLASSES[state].solidBorder}`}
    >
      <button
        type="button"
        aria-label={`Toggle ${meta.label} section`}
        aria-expanded={isOpen}
        onClick={onToggle}
        className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left"
      >
        {isOpen ? (
          <ChevronDown aria-hidden className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
        )}
        <Badge color={state} intensity="mid" icon={<Circle aria-hidden />}>
          {meta.label}
        </Badge>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{timestamp}</span>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {formatDuration(elapsedMs)}
        </span>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          · {eventCount} event{eventCount === 1 ? '' : 's'}
        </span>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          · {formatTokens(tokenSum)} tokens
        </span>
      </button>
      {isOpen && <div className="pl-9 pr-3 pb-2">{children}</div>}
    </section>
  );
}
