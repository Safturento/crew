import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { cva } from 'class-variance-authority';

import type { Agent, AgentState } from '../data/types.js';
import { STATE_CLASSES, STATE_META } from '../data/state-meta.js';
import { StateBadge } from './StateBadge.js';
import { formatDuration } from '../format/duration.js';
import { formatTokens } from '../format/tokens.js';

interface AgentRowProps {
  agent: Agent;
  onSelect: (key: string) => void;
}

const ACTIVE_STATES = new Set<AgentState>(['running', 'initializing']);

const agentRow = cva(
  'group relative grid cursor-pointer items-center gap-4 rounded-[10px] border bg-surface px-4 py-3 transition-colors hover:bg-surface-2 grid-cols-[100px_90px_1fr_90px_70px_auto]',
  {
    variants: {
      state: {
        initializing: 'border-white/10',
        running: 'border-white/10',
        idle: 'border-white/10',
        finished: 'border-white/10',
        waiting: `${STATE_CLASSES.waiting.border30} ${STATE_CLASSES.waiting.bg10}`,
        pr_open: `${STATE_CLASSES.pr_open.border30} ${STATE_CLASSES.pr_open.bg10}`,
        error: `${STATE_CLASSES.error.border30} ${STATE_CLASSES.error.bg10}`,
      },
    },
  },
);

const quickActionButton = cva('rounded-md border px-3 py-1.5 text-xs font-medium', {
  variants: {
    variant: {
      primary: 'border-white/10 bg-state-waiting text-slate-950 hover:opacity-90',
      secondary: 'border-white/10 text-text hover:bg-surface-2',
    },
  },
  defaultVariants: { variant: 'secondary' },
});

type QuickActionDescriptor =
  | { kind: 'button'; label: string; variant: 'primary' | 'secondary' }
  | { kind: 'link'; label: string; variant: 'primary' | 'secondary'; href: string }
  | null;

function describeQuickAction(agent: Agent): QuickActionDescriptor {
  switch (agent.state) {
    case 'waiting':
      return { kind: 'button', label: 'Answer', variant: 'primary' };
    case 'pr_open':
      return { kind: 'link', label: 'View PR ↗', variant: 'secondary', href: agent.prUrl ?? '#' };
    case 'error':
      return { kind: 'button', label: 'Retry', variant: 'secondary' };
    case 'finished':
      return { kind: 'button', label: 'Archive', variant: 'secondary' };
    default:
      return null;
  }
}

export function AgentRow({ agent, onSelect }: AgentRowProps) {
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
          className={`absolute inset-y-1.5 left-0 w-[3px] rounded-full ${stateClasses.bg} animate-att-pulse`}
        />
      )}
      <StateBadge state={agent.state} />
      <span className="font-mono text-xs text-text-2">{agent.key}</span>
      <span className="truncate text-[13.5px] text-text">{agent.ticketTitle}</span>
      <span className="text-right font-mono text-xs tabular-nums text-text-2">{runtime}</span>
      <span className="text-right font-mono text-xs tabular-nums text-text-2">
        {formatTokens(agent.tokens)}
      </span>
      <QuickAction agent={agent} />
    </div>
  );
}

function QuickAction({ agent }: { agent: Agent }) {
  const action = describeQuickAction(agent);
  if (action === null) return <span aria-hidden />;
  const stop = (e: MouseEvent) => e.stopPropagation();
  if (action.kind === 'link') {
    return (
      <a
        href={action.href}
        target="_blank"
        rel="noreferrer"
        onClick={stop}
        className={quickActionButton({ variant: action.variant })}
      >
        {action.label}
      </a>
    );
  }
  return (
    <button type="button" onClick={stop} className={quickActionButton({ variant: action.variant })}>
      {action.label}
    </button>
  );
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
