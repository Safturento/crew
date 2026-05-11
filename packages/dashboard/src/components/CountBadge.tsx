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
      className={`inline-flex h-4 w-fit items-center justify-center rounded-full border px-2 font-mono text-xs leading-4 ${c.text} ${c.border} ${c.bg}`}
    >
      {count}
    </span>
  );
}
