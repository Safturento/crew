import type { AgentState } from '../data/types.js';
import { STATE_CLASSES } from '../data/state-meta.js';

interface CountBadgeProps {
  count: number;
  state?: AgentState;
}

export function CountBadge({ count, state = 'initializing' }: CountBadgeProps) {
  if (count === 0) {
    return (
      <span
        data-state={state}
        className="inline-flex h-5 w-5 items-center justify-center font-mono text-[11px] text-muted-foreground"
      >
        —
      </span>
    );
  }

  const c = STATE_CLASSES[state];
  return (
    <span
      data-state={state}
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-1 font-mono text-[10px] leading-none ${c.text} ${c.border30} ${c.bg10}`}
    >
      {count}
    </span>
  );
}
