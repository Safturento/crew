import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Circle,
  Container,
  FolderGit,
  GitPullRequest,
  SquareArrowOutUpRight,
  X,
} from 'lucide-react';

import { formatDuration } from '../format/duration.js';
import { formatTokens } from '../format/tokens.js';
import type { AgentDetail, AgentState } from '../data/types.js';
import { STATE_META } from '../data/state-meta.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';

const ACTIVE_STATES = new Set<AgentState>(['running', 'initializing']);

interface DrawerHeaderProps {
  detail: AgentDetail;
  showCloseButton: boolean;
  showOpenAsPage: boolean;
  onClose?: () => void;
}

export function DrawerHeader({
  detail,
  showCloseButton,
  showOpenAsPage,
  onClose,
}: DrawerHeaderProps) {
  const startedAt = detail.runs[0]?.started_at;
  const live = ACTIVE_STATES.has(detail.state);
  const runtime = useLiveRuntime(startedAt, live);
  const meta = STATE_META[detail.state];
  const isWaiting = detail.state === 'waiting';

  return (
    <header
      data-testid="drawer-header"
      className="flex flex-col gap-2.5 border-b border-slate-800 bg-card px-6 pb-4 pt-[18px]"
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
          icon={<Circle aria-hidden />}
        >
          {meta.label}
        </Badge>
        {runtime && (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{runtime}</span>
        )}
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatTokens(detail.tokens.total)}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {showOpenAsPage && (
            <Button
              color="running"
              intensity="ghost"
              size="sm"
              icon={<ArrowUpRight aria-hidden />}
              asChild
            >
              <a href={`#/agent/${encodeURIComponent(detail.key)}/full`}>Open as page</a>
            </Button>
          )}
          {isWaiting && (
            <Button
              color="waiting"
              intensity="loud"
              size="sm"
              icon={<GitPullRequest aria-hidden />}
            >
              Provide input
            </Button>
          )}
          {showCloseButton && (
            <Button
              color="running"
              intensity="ghost"
              size="sm"
              icon={<X aria-hidden />}
              aria-label="Close drawer"
              onClick={onClose}
              disabled={!onClose}
            />
          )}
        </div>
      </div>

      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        {detail.ticket_title ?? detail.ticket_key}
      </h1>

      <div className="flex flex-wrap items-center gap-2">
        {detail.app_url && (
          <Button
            color="idle"
            intensity="mid"
            size="sm"
            icon={<Container aria-hidden />}
            asChild
            className="font-mono"
          >
            <a href={detail.app_url} target="_blank" rel="noreferrer">
              {detail.app_url}
            </a>
          </Button>
        )}
        {detail.jira_url && (
          <Button
            color="idle"
            intensity="mid"
            size="sm"
            icon={<SquareArrowOutUpRight aria-hidden />}
            asChild
          >
            <a href={detail.jira_url} target="_blank" rel="noreferrer">
              {detail.ticket_key}
            </a>
          </Button>
        )}
        <Button
          color="idle"
          intensity="mid"
          size="sm"
          icon={<FolderGit aria-hidden />}
          className="font-mono"
        >
          {detail.worktree_path}
        </Button>
      </div>
    </header>
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
