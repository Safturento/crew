import { Copy, X } from 'lucide-react';
import { toast } from 'sonner';

import { formatAgo } from '@/format/relativeTime';
import { STATE_CLASSES } from '@/data/state-meta';
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

/**
 * CREW-292: the supervisor drawer, opened from the `SupervisorCard`. Mirrors
 * the agent drawer shell (right-anchored `Drawer` + a `crew / runner`
 * breadcrumb header) and tails the supervisor's process-management log — the
 * spawn/respawn/heartbeat/reap slice of `runner.log` served by
 * `GET /api/runner/supervisor-log` (CREW-290). The log live-tails on a short
 * interval while the drawer is open (`useSupervisorLog`).
 *
 * The meta line shows only what's on the wire today — the 5s heartbeat cadence
 * and last-seen. The Figma also depicts workers/uptime/pid, but those aren't
 * carried on `SupervisorView` yet (same limitation the `SupervisorCard`
 * documents); they fill in once the heartbeat payload grows.
 */
export function SupervisorDrawer({ supervisor, open, onOpenChange }: SupervisorDrawerProps) {
  const { online, lastSeen } = supervisor;
  const { data, isLoading, isError } = useSupervisorLog({ enabled: open });
  const lines = data ?? [];

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

      <div className="flex min-h-0 flex-1 flex-col gap-2 px-6 py-4">
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
    </Drawer>
  );
}
