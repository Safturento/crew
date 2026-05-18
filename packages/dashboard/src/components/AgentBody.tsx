import { useEffect, useState } from 'react';
import { ArrowUpRight, Circle, GitPullRequest } from 'lucide-react';

import { formatDuration } from '../format/duration.js';
import { formatTokens } from '../format/tokens.js';
import { useAgent } from '../data/queries.js';
import type { AgentDetail, AgentState } from '../data/types.js';
import { STATE_META } from '../data/state-meta.js';
import { RunMetrics } from './RunMetrics.js';
import { Badge } from './ui/badge.js';
import { Timeline } from './Timeline/Timeline.js';
import { Button } from './ui/button.js';

const ACTIVE_STATES = new Set<AgentState>(['running', 'initializing']);

export type AgentBodyMode = 'drawer' | 'full';

interface AgentBodyProps {
  agentKey: string;
  mode: AgentBodyMode;
}

export function AgentBody({ agentKey, mode }: AgentBodyProps) {
  const { data, isLoading, error } = useAgent(agentKey);

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
    <div data-testid="agent-body" className="flex h-full min-h-0 flex-col">
      <AgentHeader detail={data} mode={mode} />
      <RunMetrics runs={data.runs} />
      <div className="min-h-0 flex-1">
        <Timeline agentKey={agentKey} agentState={data.state} />
      </div>
    </div>
  );
}

function AgentHeader({ detail, mode }: { detail: AgentDetail; mode: AgentBodyMode }) {
  const startedAt = detail.runs[0]?.started_at;
  const live = ACTIVE_STATES.has(detail.state);
  const runtime = useLiveRuntime(startedAt, live);
  const meta = STATE_META[detail.state];

  return (
    <div
      data-testid="drawer-header"
      className="flex flex-col gap-3 border-b border-white/10 bg-card px-6 py-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
          {detail.project}
        </span>
        <span className="font-mono text-xs text-muted-foreground">{detail.ticket_key}</span>
        <Badge
          role="status"
          aria-label={meta.label}
          color={detail.state}
          intensity="mid"
          icon={<StateIcon />}
        >
          {meta.label}
        </Badge>
        {runtime && (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{runtime}</span>
        )}
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatTokens(detail.tokens.total)}
        </span>
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        {detail.ticket_title ?? detail.ticket_key}
      </h1>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <WorktreePathLink path={detail.worktree_path} />
        {detail.pr_url && (
          <Button
            color="running"
            intensity="mid"
            size="xs"
            icon={<GitPullRequest aria-hidden />}
            asChild
          >
            <a href={detail.pr_url} target="_blank" rel="noreferrer">
              View PR
            </a>
          </Button>
        )}
        {mode === 'drawer' && (
          <Button
            color="running"
            intensity="mid"
            size="xs"
            icon={<ArrowUpRight aria-hidden />}
            asChild
          >
            <a href={`#/agent/${encodeURIComponent(detail.key)}/full`}>Open as page</a>
          </Button>
        )}
      </div>
    </div>
  );
}

// Every state-badge instance in the Figma Pill set uses `lucide/circle` as its
// Icon INSTANCE_SWAP — the badge's color, not its glyph, carries the state.
function StateIcon() {
  return <Circle aria-hidden />;
}

function WorktreePathLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = () => {
    void navigator.clipboard?.writeText(path).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1">
      <span className="font-mono text-xs text-muted-foreground">{path}</span>
      <Button
        color="running"
        intensity="ghost"
        size="xs"
        onClick={onCopy}
        aria-label="Copy worktree path"
        className="h-auto px-1 py-0 text-xs uppercase tracking-wide"
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </span>
  );
}

function useLiveRuntime(startedAt: string | undefined, live: boolean): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [live]);

  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return null;
  return formatDuration(now - start);
}
