import { Copy, X } from 'lucide-react';
import { toast } from 'sonner';
import type { RunRef } from 'crew-shared';

import { formatAgo } from '@/format/relativeTime';
import { STATE_CLASSES } from '@/data/state-meta';
import {
  useDequeue,
  useReap,
  useRestartSupervisor,
  useStopSupervisor,
} from '../../data/runnerControls.js';
import { useReconcile } from '../../data/useReconcile.js';
import { useSupervisorLog } from '../../data/useSupervisorLog.js';
import { Drawer } from '../Drawer.js';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import type { SupervisorView } from './types.js';

interface SupervisorDrawerProps {
  supervisor: SupervisorView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Cold Start can't be enqueued — once the supervisor is fully stopped nothing
 * drains the queue, and the containerized daemon can't spawn a host process.
 * Point the operator at the CLI instead (mirrors the retired SupervisorCard). */
const START_HINT = 'Run `crew runner start` on the host to start the supervisor';

/** The one-line reason shown under each reconcile ref, by housekeeping state. */
const RECONCILE_REASON: Record<RunRef['state'], string> = {
  queued: 'queued · not yet claimed',
  orphaned: 'orphaned · no live PID',
};

/**
 * CREW-292 / CREW-312: the supervisor drawer, opened from the runner chip
 * (the sole home now that the standalone Runner page is retired). Mirrors the
 * agent drawer shell (right-anchored `Drawer` + a `crew / runner` breadcrumb
 * header) and holds the runner's housekeeping surface:
 *
 * - **Controls** — Start / Stop / Restart the host runner (CREW-293).
 * - **Reconcile** — the queued + orphaned roll-up across all projects
 *   (CREW-310), with Dequeue / Reap; duplicates the inline Agents-grid row
 *   actions by design (act inline, or sweep here).
 * - **Management log** — the spawn/respawn/heartbeat/reap slice of `runner.log`
 *   served by `GET /api/runner/supervisor-log` (CREW-290), live-tailed while
 *   the drawer is open (`useSupervisorLog`).
 *
 * The meta line shows only what's on the wire today — the 5s heartbeat cadence
 * and last-seen. The Figma also depicts workers/uptime/pid, but those aren't
 * carried on `SupervisorView` yet; they fill in once the heartbeat payload
 * grows.
 */
export function SupervisorDrawer({ supervisor, open, onOpenChange }: SupervisorDrawerProps) {
  const { online, lastSeen } = supervisor;
  const { data, isLoading, isError } = useSupervisorLog({ enabled: open });
  const lines = data ?? [];

  // The consolidated housekeeping roll-up (CREW-310): every queued + orphaned
  // run across all projects. The same act-on-a-ref verbs the Agents grid rows
  // expose inline (CREW-311), gathered here for a single sweep.
  const reconcile = useReconcile();
  const refs: RunRef[] = [...(reconcile.data?.queued ?? []), ...(reconcile.data?.orphaned ?? [])];
  const dequeue = useDequeue();
  const reap = useReap();
  const restartSupervisor = useRestartSupervisor();
  const stopSupervisor = useStopSupervisor();

  const onReconcile = (ref: RunRef) =>
    ref.state === 'queued' ? dequeue.mutate(ref.key) : reap.mutate(ref.key);

  const copy = () => {
    // Only claim success once the write actually resolves — an insecure context
    // (no `navigator.clipboard`) or a denied permission must not toast success.
    navigator.clipboard
      ?.writeText(lines.join('\n'))
      .then(() => toast.success('Management log copied'))
      .catch(() => toast.error('Could not copy the management log'));
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Supervisor detail" className="max-w-3xl">
      <header className="flex flex-col gap-[9px] border-b border-slate-800 bg-card px-6 pb-4 pt-[18px]">
        <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <span>crew</span>
          <span aria-hidden className="text-muted-foreground/40">
            /
          </span>
          <span>runner</span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              color="running"
              intensity="ghost"
              size="sm"
              icon={<X aria-hidden />}
              aria-label="Close drawer"
              onClick={() => onOpenChange(false)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Supervisor</h1>
          <Badge
            role="status"
            aria-label={online ? 'running' : 'down'}
            color={online ? 'running' : 'error'}
            intensity="mid"
          >
            {online ? 'running' : 'down'}
          </Badge>
        </div>

        <p className="font-mono text-xs text-muted-foreground">
          heartbeat 5s
          {lastSeen !== null
            ? ` · last seen ${formatAgo(new Date(lastSeen).toISOString())}`
            : ' · no heartbeat yet'}
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 px-6 py-4">
        {/* Controls — Start / Stop / Restart the host runner (CREW-293). Online
            offers Restart + Stop; offline offers a cold-Start CLI hint. */}
        <div className="flex items-center gap-1.5">
          {online ? (
            <>
              <Button
                color="idle"
                intensity="muted"
                size="sm"
                onClick={() => restartSupervisor.mutate()}
              >
                Restart supervisor
              </Button>
              <Button
                color="error"
                intensity="muted"
                size="sm"
                onClick={() => stopSupervisor.mutate()}
              >
                Stop supervisor
              </Button>
            </>
          ) : (
            <Button
              color="running"
              intensity="mid"
              size="sm"
              onClick={() => toast.message(START_HINT)}
            >
              Start supervisor
            </Button>
          )}
        </div>

        {/* Reconcile roll-up — every queued + orphaned run across all projects,
            with Dequeue / Reap. Duplicates the inline row actions by design:
            act inline where you spot an item, or sweep them all here. */}
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Reconcile{refs.length > 0 && ` · ${refs.length}`}
          </h2>
          {refs.length > 0 ? (
            <ul className="flex flex-col divide-y divide-slate-800 rounded-md border border-border bg-slate-1100">
              {refs.map((ref) => (
                <li key={ref.key} className="flex items-center gap-3 px-3 py-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-mono text-sm text-foreground">{ref.key}</span>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">
                      {RECONCILE_REASON[ref.state]} · {ref.projectName} ·{' '}
                      {formatAgo(new Date(ref.since).toISOString())}
                    </span>
                  </div>
                  <Button
                    color={ref.state === 'queued' ? 'idle' : 'waiting'}
                    intensity="muted"
                    size="xs"
                    className="ml-auto shrink-0"
                    aria-label={`${ref.state === 'queued' ? 'Dequeue' : 'Reap'} ${ref.key}`}
                    onClick={() => onReconcile(ref)}
                  >
                    {ref.state === 'queued' ? 'Dequeue' : 'Reap'}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-md border border-border bg-slate-1100 px-3 py-4">
              <p className="text-center text-xs text-muted-foreground">
                Nothing to reconcile — no queued or orphaned runs.
              </p>
            </div>
          )}
        </section>

        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Management log</span>
              {online && (
                <span
                  className={`inline-flex items-center gap-1 font-mono text-[11px] normal-case tracking-normal ${STATE_CLASSES.running.text}`}
                >
                  <span
                    aria-hidden
                    className={`size-1.5 rounded-full ${STATE_CLASSES.running.solidBg}`}
                  />
                  live
                </span>
              )}
            </h2>
            <Button
              color="running"
              intensity="muted"
              size="xs"
              icon={<Copy aria-hidden />}
              onClick={copy}
              disabled={lines.length === 0}
            >
              Copy
            </Button>
          </div>

          {lines.length > 0 ? (
            <pre
              data-testid="supervisor-log-output"
              className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-slate-1100 p-3 font-mono text-xs leading-relaxed text-muted-foreground"
            >
              {lines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </pre>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-md border border-border bg-slate-1100 p-3">
              <p className="text-center text-xs text-muted-foreground">
                {isError
                  ? "Couldn't load the management log."
                  : isLoading
                    ? 'Loading management log…'
                    : 'No management log — no runner is running here.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}
