import { useEffect, useRef, useState } from 'react';

import { useAgent } from '../data/queries.js';
import { useFinishSteps } from '../data/useFinishSteps.js';
import { CondensedHeader } from './CondensedHeader.js';
import { DrawerHeader } from './DrawerHeader.js';
import { FinishSteps } from './FinishSteps.js';
import { TokensByTool } from './TokensByTool.js';
import { Timeline } from './Timeline/Timeline.js';

export type AgentBodyMode = 'drawer' | 'full';

interface AgentBodyProps {
  agentKey: string;
  mode: AgentBodyMode;
  onClose?: () => void;
}

export function AgentBody({ agentKey, mode, onClose }: AgentBodyProps) {
  const { data, isLoading, error } = useAgent(agentKey);
  const finishSteps = useFinishSteps(agentKey);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [showCondensed, setShowCondensed] = useState(false);
  const ready = !isLoading && !error && Boolean(data);

  // The condensed header appears once the full DrawerHeader has scrolled out
  // of the drawer viewport. A zero-height sentinel at the header's bottom edge
  // is watched relative to the scroll container — no scroll listeners.
  useEffect(() => {
    if (!ready) return;
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setShowCondensed(!entry.isIntersecting), {
      root,
    });
    io.observe(sentinel);
    return () => io.disconnect();
  }, [ready]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Loading agent…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Failed to load agent.
      </div>
    );
  }

  return (
    <div data-testid="agent-body" className="relative flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        data-testid="agent-scroll-container"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        style={{ scrollbarGutter: 'stable' }}
      >
        <DrawerHeader
          detail={data}
          showCloseButton={mode === 'drawer'}
          showOpenAsPage={mode === 'drawer'}
          onClose={onClose}
        />
        <div
          ref={sentinelRef}
          data-testid="drawer-header-sentinel"
          aria-hidden
          className="h-0 shrink-0"
        />
        <div
          data-testid="agent-body-container"
          className="flex min-h-0 flex-1 flex-col gap-7 px-6 pb-8 pt-5"
        >
          <TokensByTool
            tokensByTool={data.tokens_by_tool}
            total={data.tokens.total}
            model={data.model}
          />
          <FinishSteps steps={finishSteps} />
          <div className="min-h-0 flex-1">
            <Timeline
              agentKey={agentKey}
              agentState={data.state}
              tokensByTool={data.tokens_by_tool}
              scrollContainerRef={scrollRef}
            />
          </div>
        </div>
      </div>
      {showCondensed && (
        <CondensedHeader detail={data} showCloseButton={mode === 'drawer'} onClose={onClose} />
      )}
    </div>
  );
}
