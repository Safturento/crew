import type { AgentState } from '../data/types.js';
import { STATE_CLASSES } from '../data/state-meta.js';

interface CountBadgeProps {
  count: number;
  state?: AgentState;
}

export function CountBadge({ count, state = 'initializing' }: CountBadgeProps) {
  if (count === 0) {
    return (
      <span data-state={state} className="font-mono text-xs text-muted-foreground">
        0
      </span>
    );
  }

  const c = STATE_CLASSES[state];
  return (
    <span
      data-state={state}
      className={`inline-flex aspect-square h-6 items-center justify-center rounded-full px-1 font-mono text-sm leading-none ${c.text} ${c.border30} ${c.bg10}`}
    >
      {count}
    </span>
  );
}
