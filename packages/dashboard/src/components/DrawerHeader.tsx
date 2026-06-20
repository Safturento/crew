import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Container,
  FolderGit,
  GitMerge,
  Pause,
  Play,
  RefreshCw,
  SquareArrowOutUpRight,
  X,
} from 'lucide-react';

import { formatDuration } from '../format/duration.js';
import { formatTokens } from '../format/tokens.js';
import type { AgentDetail, AgentState } from '../data/types.js';
import { STATE_META } from '../data/state-meta.js';
import { useRefreshPrStatus } from '../data/queries.js';
import { useCancelRun, useForceKill, usePauseRun, useResumeRun } from '../data/runnerControls.js';
import { useRunnerStatus } from '../data/useRunnerStatus.js';
import { AlertModal } from './AlertModal.js';
import { ResumeModal } from './ResumeModal.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { MetaList } from './ui/meta-list.js';
import { StateIcon } from './ui/state-icon.js';
import { StateOverrideControl } from './StateOverrideControl.js';
import { useCancelEscalation } from './runner/useCancelEscalation.js';

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
  // CREW-202: Refresh PR button shows in the top-right action cluster only
  // when the agent has an open PR. The mutation hook is always called (Rules
  // of Hooks); its result is just gated by the rendering.
  const refreshPr = useRefreshPrStatus(detail.key);
  const showRefreshPr = detail.state === 'pr_open' && Boolean(detail.pr_url);
  const showMergedPrPill = detail.state === 'pr_merged' && Boolean(detail.pr_url);

  // CREW-246: Cancel control with UI ⇄ CLI parity. Shares the soft→hard
  // escalation (`useCancelEscalation`) and the runner-command mutations with
  // the Runner page rows (CREW-245) so both surfaces drive one control path.
  // The hooks are always called (Rules of Hooks); rendering is gated below so
  // only a running agent shows the control.
  const cancelRun = useCancelRun();
  const forceKill = useForceKill();
  const escalation = useCancelEscalation({
    onSoftCancel: () => cancelRun.mutate(detail.key),
    onForceKill: () => forceKill.mutate(detail.key),
  });

  // CREW-274: Pause/Resume parity with the Runner-page row. A pause reduces the
  // persistent run-state to `idle` (CREW-273), so the live-process snapshot is
  // the only place the `paused` label survives — cross-reference it by key to
  // decide whether to offer Resume. A `running` agent offers Pause.
  const runner = useRunnerStatus();
  const isPaused = runner.processes.find((p) => p.agentKey === detail.key)?.state === 'paused';
  const pauseRun = usePauseRun();
  const resumeRun = useResumeRun();
  const [resumeOpen, setResumeOpen] = useState(false);
  const showPause = detail.state === 'running';
  const showResume = isPaused;
  const showCancel = detail.state === 'running' || isPaused;
  const cancelling = escalation.phase === 'cancelling';

  return (
    <>
      <header
        data-testid="drawer-header"
        className="flex flex-col gap-[9px] border-b border-slate-800 bg-card px-6 pb-4 pt-[18px]"
      >
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
          <span>{detail.project}</span>
          <span aria-hidden className="text-muted-foreground/40">
            /
          </span>
          <span>{detail.ticket_key}</span>

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
              <Button color="waiting" intensity="loud" size="sm">
                Provide input
              </Button>
            )}
            {showRefreshPr && (
              <Button
                color="idle"
                intensity="ghost"
                size="sm"
                icon={
                  <RefreshCw
                    aria-hidden
                    className={refreshPr.isPending ? 'animate-spin' : undefined}
                  />
                }
                onClick={() => refreshPr.mutate()}
                disabled={refreshPr.isPending}
                aria-label="Refresh PR status"
              >
                Refresh PR
              </Button>
            )}
            {showPause && (
              <Button
                color="idle"
                intensity="ghost"
                size="sm"
                icon={<Pause aria-hidden />}
                onClick={() => pauseRun.mutate(detail.key)}
              >
                Pause
              </Button>
            )}
            {showResume && (
              <Button
                color="running"
                intensity="mid"
                size="sm"
                icon={<Play aria-hidden />}
                onClick={() => setResumeOpen(true)}
              >
                Resume
              </Button>
            )}
            {showCancel &&
              (cancelling ? (
                escalation.showForceKill && (
                  <Button color="error" intensity="loud" size="sm" onClick={escalation.forceKill}>
                    Force kill
                  </Button>
                )
              ) : (
                <Button
                  color="error"
                  intensity="muted"
                  size="sm"
                  onClick={escalation.requestCancel}
                >
                  Cancel
                </Button>
              ))}
            {showCloseButton && (
              <Button
                color="running"
                intensity="ghost"
                size="sm"
                icon={<X aria-hidden />}
                aria-label="Close drawer"
                onClick={onClose}
              />
            )}
          </div>
        </div>

        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {detail.ticket_title ?? detail.ticket_key}
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            role="status"
            aria-label={meta.label}
            color={detail.state}
            intensity="mid"
            icon={<StateIcon />}
          >
            {meta.label}
          </Badge>
          {/* CREW-260: operator escape hatch — force a corrected state when the
            badge is wrong or stranded. Secondary affordance beside the pill. */}
          <StateOverrideControl agentKey={detail.key} state={detail.state} />
          <MetaList>
            <StatusItem label="runtime" value={runtime ?? '—'} />
            <StatusItem label="tokens" value={formatTokens(detail.tokens.total)} />
          </MetaList>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {detail.app_url && (
            <Button
              color="idle"
              intensity="mid"
              size="md"
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
              size="md"
              icon={<SquareArrowOutUpRight aria-hidden />}
              asChild
            >
              <a href={detail.jira_url} target="_blank" rel="noreferrer">
                {detail.ticket_key}
              </a>
            </Button>
          )}
          {showMergedPrPill && (
            <Button color="idle" intensity="mid" size="md" icon={<GitMerge aria-hidden />} asChild>
              <a href={detail.pr_url ?? '#'} target="_blank" rel="noreferrer">
                View merged PR
              </a>
            </Button>
          )}
          <Button
            color="idle"
            intensity="mid"
            size="md"
            icon={<FolderGit aria-hidden />}
            className="font-mono"
          >
            {detail.worktree_path}
          </Button>
        </div>
      </header>
      <AlertModal
        open={escalation.phase === 'confirming'}
        onOpenChange={(open) => {
          if (!open) escalation.dismiss();
        }}
        title={`Cancel ${detail.ticket_key}?`}
        description="Sends a graceful stop to the agent process. If it hasn't settled in ~10s you can escalate to a force kill."
        cancelLabel="Keep running"
        actionLabel="Cancel run"
        actionColor="error"
        actionIntensity="loud"
        onAction={escalation.confirm}
      />
      <ResumeModal
        agentKey={detail.key}
        open={resumeOpen}
        onOpenChange={setResumeOpen}
        onSubmit={(message) => resumeRun.mutate({ agentKey: detail.key, message })}
      />
    </>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      <span className="tabular-nums text-foreground/80">{value}</span>
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
