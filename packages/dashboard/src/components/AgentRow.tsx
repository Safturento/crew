import { useEffect, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { cva } from 'class-variance-authority';

import type { Agent, AgentState } from '../data/types.js';
import { STATE_CLASSES, STATE_META } from '../data/state-meta.js';
import { StateBadge } from './StateBadge.js';
import { Button } from './ui/button.js';
import { formatDuration } from '../format/duration.js';
import { formatTokens } from '../format/tokens.js';

export type QuickActionKind = 'resume' | 'finish' | 'view-pr' | 'provide-input' | 'inspect';

interface AgentRowProps {
  agent: Agent;
  onSelect: (key: string) => void;
  onAction?: (kind: QuickActionKind, agent: Agent) => void;
}

const ACTIVE_STATES = new Set<AgentState>(['running', 'initializing']);

const agentRow = cva(
  'group relative grid cursor-pointer items-center gap-4 rounded border bg-card px-4 py-3 transition-colors hover:bg-popover grid-cols-[100px_90px_90px_70px_1fr_168px]',
  {
    variants: {
      state: {
        initializing: 'border-white/10',
        running: 'border-white/10',
        idle: 'border-white/10',
        finished: 'border-white/10',
        waiting: `${STATE_CLASSES.waiting.border} ${STATE_CLASSES.waiting.bg}`,
        pr_open: `${STATE_CLASSES.pr_open.border} ${STATE_CLASSES.pr_open.bg}`,
        error: `${STATE_CLASSES.error.border} ${STATE_CLASSES.error.bg}`,
      },
    },
  },
);

export function AgentRow({ agent, onSelect, onAction }: AgentRowProps) {
  const runtime = useLiveRuntime(agent.startedAt, ACTIVE_STATES.has(agent.state));
  const meta = STATE_META[agent.state];
  const stateClasses = STATE_CLASSES[agent.state];
  const attentionAttr = meta.attention ? agent.state : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${agent.key} — ${agent.ticketTitle}`}
      data-attention={attentionAttr}
      onClick={() => onSelect(agent.key)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(agent.key);
        }
      }}
      className={agentRow({ state: agent.state })}
    >
      {meta.attention && (
        <span
          aria-hidden
          className={`absolute inset-y-1.5 left-0 w-1 rounded-full ${stateClasses.solidBg} animate-att-pulse`}
        />
      )}
      <StateBadge state={agent.state} />
      <span className="font-mono text-xs text-muted-foreground">{agent.key}</span>
      <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">
        {runtime}
      </span>
      <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">
        {formatTokens(agent.tokens)}
      </span>
      <span className="truncate text-sm text-foreground">{agent.ticketTitle}</span>
      <QuickActions agent={agent} onAction={onAction} />
    </div>
  );
}

function QuickActions({
  agent,
  onAction,
}: {
  agent: Agent;
  onAction?: (kind: QuickActionKind, agent: Agent) => void;
}) {
  const stop = (e: MouseEvent) => e.stopPropagation();
  const fire = (kind: QuickActionKind) => (e: MouseEvent) => {
    stop(e);
    onAction?.(kind, agent);
  };

  switch (agent.state) {
    case 'idle':
      return (
        <QaGroup>
          <Button color="running" intensity="mid" size="xs" onClick={fire('resume')}>
            Resume
          </Button>
          <Button color="running" intensity="ghost" size="xs" onClick={fire('finish')}>
            Finish
          </Button>
        </QaGroup>
      );
    case 'waiting':
      return (
        <SingleAction>
          <Button color="waiting" intensity="loud" size="xs" onClick={fire('provide-input')}>
            Provide input
          </Button>
        </SingleAction>
      );
    case 'pr_open':
      return (
        <QaGroup>
          <Button color="running" intensity="mid" size="xs" asChild>
            <a href={agent.prUrl ?? '#'} target="_blank" rel="noreferrer" onClick={stop}>
              View PR ↗
            </a>
          </Button>
          <Button color="running" intensity="ghost" size="xs" onClick={fire('finish')}>
            Finish
          </Button>
        </QaGroup>
      );
    case 'error':
      return (
        <SingleAction>
          <Button color="error" intensity="loud" size="xs" onClick={fire('inspect')}>
            Inspect
          </Button>
        </SingleAction>
      );
    default:
      return <span aria-hidden />;
  }
}

function QaGroup({ children }: { children: ReactNode }) {
  return (
    <div
      data-qa-group="true"
      className="flex items-center justify-end gap-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

function SingleAction({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-end">{children}</div>;
}

function useLiveRuntime(startedAt: string, live: boolean): string {
  const start = new Date(startedAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [live]);
  return formatDuration(now - start);
}
