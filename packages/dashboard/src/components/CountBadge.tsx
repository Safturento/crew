import type { AgentState } from '../data/types.js';
import { STATE_CLASSES } from '../data/state-meta.js';

interface CountBadgeProps {
  count: number;
  state?: AgentState;
}

export function CountBadge({ count, state = 'initializing' }: CountBadgeProps) {
  if (count === 0) {
    return (
      <span data-state={state} className="font-mono text-[10px] text-muted-foreground">
        0
      </span>
    );
  }

  const c = STATE_CLASSES[state];
  return (
    <span
      data-state={state}
      className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full border px-1 font-mono text-[9px] leading-none ${c.text} ${c.border30} ${c.bg10}`}
    >
      {count}
    </span>
  );
}
