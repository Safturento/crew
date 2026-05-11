import { STATE_CLASSES, STATE_META, transitionToAgentState } from '../data/state-meta.js';
import type { StateTransition } from '../data/types.js';

interface StateHistoryBarProps {
  transitions: StateTransition[];
  onScrollTo: (ts: number) => void;
}

export function StateHistoryBar({ transitions, onScrollTo }: StateHistoryBarProps) {
  return (
    <div
      role="group"
      aria-label="State history"
      className="flex flex-wrap items-center gap-1.5 py-1"
    >
      {transitions.map((t, idx) => {
        const agentState = transitionToAgentState(t.to);
        const meta = STATE_META[agentState];
        const classes = STATE_CLASSES[agentState];
        return (
          <span key={`${t.ts}-${idx}`} className="flex items-center gap-1.5">
            {idx > 0 && (
              <span
                data-testid="state-history-arrow"
                aria-hidden
                className="font-mono text-xs text-muted-foreground"
              >
                →
              </span>
            )}
            <button
              type="button"
              onClick={() => onScrollTo(t.ts)}
              data-state={agentState}
              className={`inline-flex h-6 items-center rounded-full border ${classes.border30} ${classes.bg10} ${classes.text} px-2 font-mono text-xs leading-none whitespace-nowrap transition-opacity hover:opacity-80`}
            >
              {meta.label}
            </button>
          </span>
        );
      })}
    </div>
  );
}
