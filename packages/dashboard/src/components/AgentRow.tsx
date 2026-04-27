import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';

import type { Agent, AgentState } from '../data/types.js';
import { STATE_META } from '../data/state-meta.js';
import { StateBadge } from './StateBadge.js';
import { formatDuration } from '../format/duration.js';
import { formatTokens } from '../format/tokens.js';

interface AgentRowProps {
  agent: Agent;
  onSelect: (key: string) => void;
}

const ACTIVE_STATES = new Set<AgentState>(['running', 'initializing']);

export function AgentRow({ agent, onSelect }: AgentRowProps) {
  const runtime = useLiveRuntime(agent.startedAt, ACTIVE_STATES.has(agent.state));
  const meta = STATE_META[agent.state];
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
      className={[
        'group relative grid cursor-pointer items-center gap-4 rounded-[10px] border bg-surface px-4 py-3 transition-colors hover:bg-surface-2',
        'grid-cols-[100px_90px_1fr_90px_70px_auto]',
        meta.attention ? `border-${meta.colorVar}/30 bg-${meta.colorVar}/10` : 'border-white/10',
      ].join(' ')}
    >
      {meta.attention && (
        <span
          aria-hidden
          className={`absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-${meta.colorVar} animate-att-pulse`}
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
  const stop = (e: MouseEvent) => e.stopPropagation();

  switch (agent.state) {
    case 'waiting':
      return (
        <button
          type="button"
          onClick={stop}
          className="rounded-md border border-white/10 bg-state-waiting px-3 py-1.5 text-xs font-medium text-slate-950 hover:opacity-90"
        >
          Answer
        </button>
      );
    case 'pr_open':
      return (
        <a
          href={agent.prUrl ?? '#'}
          target="_blank"
          rel="noreferrer"
          onClick={stop}
          className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-2"
        >
          View PR ↗
        </a>
      );
    case 'error':
      return (
        <button
          type="button"
          onClick={stop}
          className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-2"
        >
          Retry
        </button>
      );
    case 'finished':
      return (
        <button
          type="button"
          onClick={stop}
          className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-2"
        >
          Archive
        </button>
      );
    default:
      return <span aria-hidden />;
  }
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
