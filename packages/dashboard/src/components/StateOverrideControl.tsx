import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';

import { STATE_META, STATE_CLASSES } from '../data/state-meta.js';
import type { AgentState } from '../data/types.js';
import { useOverrideState } from '../data/queries.js';
import { cn } from '@/lib/utils';
import { AlertModal } from './AlertModal.js';
import { Button } from './ui/button.js';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.js';

// All eight agent states, attention-first (matches the list ordering used
// across the dashboard). The current state is rendered disabled — overriding
// to the state you're already in is a no-op the daemon would reject anyway.
const ALL_STATES = (Object.keys(STATE_META) as AgentState[]).sort(
  (a, b) => STATE_META[a].sortRank - STATE_META[b].sortRank,
);

interface StateOverrideControlProps {
  agentKey: string;
  state: AgentState;
}

/**
 * CREW-260: the drawer's operator escape hatch. A secondary icon button opens a
 * popover of all eight states; picking one (other than the current) raises an
 * AlertModal confirm, and confirming forces the daemon to that state via
 * `POST /api/agents/:key/state`. The badge updates over the existing
 * `agent.state_changed` SSE — this control never reads state back itself.
 */
export function StateOverrideControl({ agentKey, state }: StateOverrideControlProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<AgentState | null>(null);
  const mutation = useOverrideState(agentKey);

  return (
    <>
      {/* `modal` mirrors Timeline/Filters: inside the drawer Dialog it gates the
          Dialog layer's outside-pointer handler so a dismissing click pops only
          the popover, not the drawer. */}
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <Button
            color="idle"
            intensity="ghost"
            size="sm"
            icon={<SlidersHorizontal aria-hidden />}
            aria-label="Override state"
          />
        </PopoverTrigger>
        {/* A plain Radix Popover, not a Menu primitive — so no `role="menu"`
            (it would promise arrow-key roving focus + typeahead this doesn't
            provide). Items are ordinary buttons in a group labelled by the
            heading, matching the Timeline/Filters popover convention. */}
        <PopoverContent
          className="w-52 p-1"
          align="start"
          role="group"
          aria-labelledby="override-state-heading"
        >
          <p
            id="override-state-heading"
            className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground"
          >
            Override state
          </p>
          {ALL_STATES.map((s) => {
            const isCurrent = s === state;
            return (
              <button
                key={s}
                type="button"
                disabled={isCurrent}
                aria-disabled={isCurrent || undefined}
                onClick={() => {
                  setPending(s);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground',
                  isCurrent ? 'cursor-default opacity-40' : 'cursor-pointer hover:bg-accent',
                )}
              >
                <span
                  aria-hidden
                  className={cn('size-2 shrink-0 rounded-full', STATE_CLASSES[s].solidBg)}
                />
                <span className="flex-1">{STATE_META[s].label}</span>
                {isCurrent && (
                  <span className="font-mono text-[10px] text-muted-foreground">current</span>
                )}
              </button>
            );
          })}
        </PopoverContent>
      </Popover>

      <AlertModal
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next) setPending(null);
        }}
        title="Override agent state"
        description={
          pending
            ? `Force ${agentKey} from "${STATE_META[state].label}" to "${STATE_META[pending].label}"? This manually sets the agent's state, bypassing automatic tracking, and won't be undone on its own.`
            : ''
        }
        actionLabel="Override"
        actionColor="waiting"
        cancelLabel="Cancel"
        onAction={() => {
          if (pending) mutation.mutate(pending);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
