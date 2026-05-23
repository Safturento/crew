import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { STATE_CLASSES, STATE_META } from '../../data/state-meta.js';
import type { AgentState } from '../../data/types.js';
import { formatDuration } from '../../format/duration.js';
import { formatTokens } from '../../format/tokens.js';
import { Badge } from '../ui/badge.js';
import { StateIcon } from '../ui/state-icon.js';

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
      className={`overflow-hidden border-l-2 ${STATE_CLASSES[state].solidBorder}`}
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
        <Badge color={state} intensity="mid" icon={<StateIcon />}>
          {meta.label}
        </Badge>
        <div className="ml-auto flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground tabular-nums">
          <span>{timestamp}</span>
          <span>{formatDuration(elapsedMs)}</span>
          <span>
            · {eventCount} event{eventCount === 1 ? '' : 's'}
          </span>
          <span>· {formatTokens(tokenSum)} tokens</span>
        </div>
      </button>
      {isOpen && <div className="pl-9 pr-3 pb-2">{children}</div>}
    </section>
  );
}
