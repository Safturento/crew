import { useEffect, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { Clock, Currency, GitMerge, GitPullRequest, Hash } from 'lucide-react';

import type { Agent, AgentState } from '@/data/types';
import { STATE_CLASSES, STATE_META } from '@/data/state-meta';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { MetaList } from './ui/meta-list.js';
import { StateIcon } from './ui/state-icon.js';
import { formatDuration } from '@/format/duration';
import { formatTokens } from '@/format/tokens';

export type QuickActionKind =
  | 'resume'
  | 'finish'
  | 'fix-pr'
  | 'view-pr'
  | 'provide-input'
  | 'inspect';

interface AgentRowProps {
  agent: Agent;
  onSelect: (key: string) => void;
  onAction?: (kind: QuickActionKind, agent: Agent) => void;
  /**
   * CREW-217: when false, the enqueue-able QuickActions (Resume, Finish)
   * are disabled + annotated "Waiting for runner" — no host runner is
   * connected to drain the action queue. Defaults to enabled so callers
   * that don't track runner health (tests, fixtures) keep working.
   */
  runnerOnline?: boolean;
}

const ACTIVE_STATES = new Set<AgentState>(['running', 'initializing']);

const agentRow = cva(
  'group relative flex cursor-pointer items-center h-16 gap-3 rounded border bg-card px-4 py-3 transition-colors hover:bg-popover',
  {
    variants: {
      state: {
        initializing: 'border-white/10',
        running: 'border-white/10',
        idle: 'border-white/10',
        finished: 'border-white/10',
        waiting: `${STATE_CLASSES.waiting.border} ${STATE_CLASSES.waiting.bg}`,
        pr_open: `${STATE_CLASSES.pr_open.border} ${STATE_CLASSES.pr_open.bg}`,
        // CREW-202: pr_merged borrows the emerald success family — the row
        // tinted green so the "ready to Finish" cohort is immediately visible
        // in the list view alongside the other attention states.
        pr_merged: `${STATE_CLASSES.pr_merged.border} ${STATE_CLASSES.pr_merged.bg}`,
        error: `${STATE_CLASSES.error.border} ${STATE_CLASSES.error.bg}`,
      },
    },
  },
);

export function AgentRow({ agent, onSelect, onAction, runnerOnline = true }: AgentRowProps) {
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
      <div className={'w-24'}>
        <Badge
          role="status"
          aria-label={meta.label}
          color={agent.state}
          intensity="mid"
          icon={<StateIcon />}
          className="shrink-0"
        >
          {meta.label}
        </Badge>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm text-foreground">{agent.ticketTitle}</span>
        <MetaList>
          <MetaItem icon={<Hash className="h-3 w-3" aria-hidden />} value={agent.key} />
          <MetaItem icon={<Clock className="h-3 w-3" aria-hidden />} value={runtime} />
          <MetaItem
            icon={<Currency className="h-3 w-3" aria-hidden />}
            value={formatTokens(agent.tokens)}
          />
        </MetaList>
      </div>
      <QuickActions agent={agent} onAction={onAction} runnerOnline={runnerOnline} />
    </div>
  );
}

function MetaItem({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      {icon}
      <span>{value}</span>
    </span>
  );
}

function QuickActions({
  agent,
  onAction,
  runnerOnline = true,
}: {
  agent: Agent;
  onAction?: (kind: QuickActionKind, agent: Agent) => void;
  runnerOnline?: boolean;
}) {
  const stop = (e: MouseEvent) => e.stopPropagation();
  const fire = (kind: QuickActionKind) => (e: MouseEvent) => {
    stop(e);
    onAction?.(kind, agent);
  };

  // CREW-217: Resume + Finish enqueue actions a host runner drains. With no
  // runner connected they degrade to disabled + "Waiting for runner" rather
  // than enqueueing work nothing can pick up. The View-PR link and the
  // waiting/error actions don't touch the queue, so they stay enabled.
  const gate = runnerOnline ? {} : { disabled: true, title: 'Waiting for runner' };
  const gateClass = 'disabled:cursor-not-allowed disabled:opacity-40';

  // CREW-220: Finish does post-merge cleanup, so it is only actionable once
  // the PR is merged. Before that it renders disabled + annotated; on
  // pr_merged it falls back to the shared runner gate.
  const finishGate =
    agent.state === 'pr_merged'
      ? gate
      : { disabled: true, title: 'Available after the PR is merged' };

  switch (agent.state) {
    case 'idle':
      return (
        <QaGroup>
          <Button
            color="running"
            intensity="mid"
            size="sm"
            className={gateClass}
            onClick={fire('resume')}
            {...gate}
          >
            Resume
          </Button>
          <Button
            color="running"
            intensity="ghost"
            size="sm"
            className={gateClass}
            onClick={fire('finish')}
            {...finishGate}
          >
            Finish
          </Button>
        </QaGroup>
      );
    case 'waiting':
      return (
        <SingleAction>
          <Button color="waiting" intensity="loud" size="sm" onClick={fire('provide-input')}>
            Provide input
          </Button>
        </SingleAction>
      );
    case 'pr_open':
      return (
        <QaGroup>
          <Button
            color="running"
            intensity="mid"
            size="sm"
            icon={<GitPullRequest aria-hidden />}
            asChild
          >
            <a href={agent.prUrl ?? '#'} target="_blank" rel="noreferrer" onClick={stop}>
              View PR
            </a>
          </Button>
          {/* CREW-219: Fix PR opens the comment modal that enqueues a fix_pr
              action. Like Finish it drains through the host runner, so it's
              gated on runner connectivity. */}
          <Button
            color="running"
            intensity="ghost"
            size="sm"
            className={gateClass}
            onClick={fire('fix-pr')}
            {...gate}
          >
            Fix PR
          </Button>
          <Button
            color="running"
            intensity="ghost"
            size="sm"
            className={gateClass}
            onClick={fire('finish')}
            {...finishGate}
          >
            Finish
          </Button>
        </QaGroup>
      );
    case 'pr_merged':
      // CREW-202: same shape as pr_open, reworded label + git-merge icon to
      // signal "PR done." Finish is the meaningful next action.
      return (
        <QaGroup>
          <Button color="running" intensity="mid" size="sm" icon={<GitMerge aria-hidden />} asChild>
            <a href={agent.prUrl ?? '#'} target="_blank" rel="noreferrer" onClick={stop}>
              View merged PR
            </a>
          </Button>
          <Button
            color="running"
            intensity="ghost"
            size="sm"
            className={gateClass}
            onClick={fire('finish')}
            {...finishGate}
          >
            Finish
          </Button>
        </QaGroup>
      );
    case 'error':
      return (
        <SingleAction>
          <Button color="error" intensity="mid" size="sm" onClick={fire('inspect')}>
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
      className="flex shrink-0 items-center justify-end gap-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

function SingleAction({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 items-center justify-end">{children}</div>;
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
