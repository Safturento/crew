import { Copy, GitPullRequest, X } from 'lucide-react';
import { toast } from 'sonner';
import type { LiveProcess, LiveProcessState, RunFailure } from 'crew-shared';

import type { PillColor } from '@/lib/pill-variants';
import { useStartupLog } from '@/data/useStartupLog';
import { STATE_CLASSES } from '@/data/state-meta';
import { formatAgo } from '@/format/relativeTime';
import { useLiveDuration } from '@/format/useLiveDuration';
import { Drawer } from '../Drawer.js';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import { CommandBadge } from './CommandBadge.js';
import type { EndedKind, EndedRunView, FailedStartView } from './types.js';

/**
 * The run a drawer is opened for. One of the three Runner-page row sources:
 * a supervisor-held live process, a failed-to-start row, or a recently-ended
 * row. The drawer derives its header pill, meta, diagnosis, and console from
 * whichever it's given.
 */
export type RunDrawerSource =
  | { kind: 'live'; process: LiveProcess }
  | { kind: 'failed-start'; view: FailedStartView }
  | { kind: 'ended'; view: EndedRunView };

interface RunDrawerProps {
  source: RunDrawerSource;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LIVE_PILL: Record<LiveProcessState, { label: string; color: PillColor }> = {
  launching: { label: 'launching', color: 'initializing' },
  running: { label: 'running', color: 'running' },
  cancelling: { label: 'cancelling', color: 'waiting' },
  paused: { label: 'paused', color: 'idle' },
};

const ENDED_PILL: Record<EndedKind, { label: string; color: PillColor }> = {
  finished: { label: 'finished', color: 'finished' },
  cancelled: { label: 'cancelled', color: 'idle' },
  error: { label: 'error', color: 'error' },
  'failed-start': { label: 'failed', color: 'error' },
};

/**
 * The run drawer — a sibling to the agent drawer, reusing the same `Drawer`
 * shell (CREW-291). Opened by clicking any run row (live / failed-start /
 * recently-ended). Header (key + command + state pill), meta (pid/pgid for live
 * runs · project · relative timestamp), a failed-start Diagnosis (the
 * structured check / headline / amber remediation — absorbing the old
 * `ViewOutputModal`), and the raw startup Console output served by
 * `getStartupLog`, live-tailed while the run is in-flight. Falls back to any
 * in-hand `failure.output` when no startup log was captured (the silent
 * pre-registration death case the Epic targets).
 */
export function RunDrawer({ source, open, onOpenChange }: RunDrawerProps) {
  const model = toModel(source);
  // Hooks run unconditionally; the duration is only surfaced for live runs.
  const duration = useLiveDuration(model.spawnedAt ?? '', model.live && open);
  const log = useStartupLog(model.agentKey, { enabled: open, live: model.live });

  const consoleText = log.data ?? model.failure?.output ?? '';
  const consoleLoading = log.isLoading;

  const copy = () => {
    void navigator.clipboard?.writeText(consoleText);
    toast.success('Output copied');
  };

  const timeLabel = model.live ? `${model.pill.label} · ${duration}` : model.timeLabel;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={`Run detail — ${model.agentKey}`}>
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex flex-col gap-[9px] border-b border-slate-800 bg-card px-6 pb-4 pt-[18px]">
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <span>{model.project}</span>
            <span aria-hidden className="text-muted-foreground/40">
              /
            </span>
            <span>{model.agentKey}</span>
            <Button
              color="running"
              intensity="ghost"
              size="sm"
              icon={<X aria-hidden />}
              aria-label="Close drawer"
              className="ml-auto"
              onClick={() => onOpenChange(false)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {model.agentKey}
            </h1>
            <CommandBadge command={model.command} />
            <Badge role="status" aria-label={model.pill.label} color={model.pill.color} intensity="mid">
              {model.pill.label}
            </Badge>
            {model.prNumber !== undefined && (
              <Badge color="pr_open" intensity="mid" icon={<GitPullRequest aria-hidden />} asChild>
                <a href={model.prUrl ?? '#'} target="_blank" rel="noreferrer">
                  PR #{model.prNumber}
                </a>
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
            {model.pid !== undefined && (
              <>
                <span>
                  pid <span className="text-foreground/80">{model.pid}</span>
                </span>
                <span aria-hidden>·</span>
                <span>
                  pgid <span className="text-foreground/80">{model.pgid}</span>
                </span>
                <span aria-hidden>·</span>
              </>
            )}
            <span>
              project <span className="text-foreground/80">{model.project}</span>
            </span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{timeLabel}</span>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-6 pb-8 pt-5">
          {model.failure && <Diagnosis failure={model.failure} />}
          <ConsoleOutput text={consoleText} loading={consoleLoading} live={model.live} onCopy={copy} />
        </div>
      </div>
    </Drawer>
  );
}

function Diagnosis({ failure }: { failure: RunFailure }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Diagnosis
      </h2>
      <p className={`flex items-center gap-2 font-mono text-sm ${STATE_CLASSES.error.text}`}>
        <X className="h-4 w-4" aria-hidden />
        {failure.check}
      </p>
      <p className="text-sm text-muted-foreground">{failure.headline}</p>
      {failure.remediation !== '' && (
        <p className={`text-sm ${STATE_CLASSES.waiting.text}`}>→ {failure.remediation}</p>
      )}
    </section>
  );
}

function ConsoleOutput({
  text,
  loading,
  live,
  onCopy,
}: {
  text: string;
  loading: boolean;
  live: boolean;
  onCopy: () => void;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Console output
          </h2>
          {live && (
            <span className={`text-xs ${STATE_CLASSES.running.text}`} aria-hidden>
              · live
            </span>
          )}
          {live && <span className="sr-only">live</span>}
        </div>
        <Button
          color="running"
          intensity="muted"
          size="xs"
          icon={<Copy aria-hidden />}
          onClick={onCopy}
        >
          Copy
        </Button>
      </div>
      <pre className="max-h-[28rem] overflow-auto rounded-md bg-slate-950 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
        {loading ? 'Loading…' : text === '' ? 'No output captured.' : text}
      </pre>
    </section>
  );
}

interface RunModel {
  agentKey: string;
  command: FailedStartView['command'];
  project: string;
  pill: { label: string; color: PillColor };
  pid?: number;
  pgid?: number;
  spawnedAt?: string;
  /** Pre-formatted relative timestamp for non-live runs. */
  timeLabel: string;
  live: boolean;
  failure?: RunFailure;
  prUrl?: string;
  prNumber?: number;
}

function toModel(source: RunDrawerSource): RunModel {
  if (source.kind === 'live') {
    const p = source.process;
    return {
      agentKey: p.agentKey,
      command: p.command,
      project: p.project,
      pill: LIVE_PILL[p.state],
      pid: p.pid,
      pgid: p.pgid,
      spawnedAt: p.spawnedAt,
      timeLabel: '',
      live: true,
    };
  }
  if (source.kind === 'failed-start') {
    const v = source.view;
    return {
      agentKey: v.key,
      command: v.command,
      project: v.project,
      pill: { label: 'failed', color: 'error' },
      timeLabel: `failed ${formatAgo(v.failedAt)}`,
      live: false,
      failure: v.failure,
    };
  }
  const v = source.view;
  return {
    agentKey: v.key,
    command: v.command,
    project: v.project,
    pill: ENDED_PILL[v.kind],
    timeLabel: `ended ${formatAgo(v.endedAt)}`,
    live: false,
    failure: v.failure,
    prUrl: v.prUrl,
    prNumber: v.prNumber,
  };
}
