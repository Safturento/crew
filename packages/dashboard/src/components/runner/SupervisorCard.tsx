import { Row } from '../Row.js';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import { formatAgo } from '@/format/relativeTime';
import type { SupervisorView } from './types.js';

interface SupervisorCardProps {
  supervisor: SupervisorView;
  /**
   * Lifecycle controls. Unwired in v1 (supervisor start/stop/restart are
   * `crew runner` CLI ops with no daemon control route yet) — omitting a
   * handler renders the button disabled with an explanatory title.
   */
  onRestart?: () => void;
  onStop?: () => void;
  onStart?: () => void;
}

const CLI_HINT = 'Manage the supervisor with the `crew runner` CLI';
const OFFLINE_HINT = 'Runner offline';

/**
 * The supervisor health card. Online → a `running` pill + Restart/Stop; offline
 * → a `down` pill + Start, with every control disabled and annotated "Runner
 * offline" (the daemon can't reach the runner to act). The meta line shows the
 * heartbeat cadence + last-seen; workers/uptime/pid aren't on the wire yet.
 */
export function SupervisorCard({ supervisor, onRestart, onStop, onStart }: SupervisorCardProps) {
  const { online, lastSeen } = supervisor;
  const disabledCls = 'disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <Row
      statusSlot={
        <Badge
          role="status"
          aria-label={online ? 'running' : 'down'}
          color={online ? 'running' : 'error'}
          intensity="mid"
        >
          {online ? 'running' : 'down'}
        </Badge>
      }
      title={<span className="text-sm font-semibold text-foreground">Supervisor</span>}
      subheader={
        <span className="text-xs text-muted-foreground">
          5s heartbeat
          {lastSeen !== null
            ? ` · last seen ${formatAgo(new Date(lastSeen).toISOString())}`
            : ' · no heartbeat yet'}
        </span>
      }
      actions={
        <div className="flex shrink-0 items-center justify-end gap-1.5">
          {online ? (
            <>
              <Button
                color="running"
                intensity="mid"
                size="sm"
                onClick={onRestart}
                disabled={!onRestart}
                title={onRestart ? undefined : CLI_HINT}
                className={disabledCls}
              >
                Restart
              </Button>
              <Button
                color="error"
                intensity="mid"
                size="sm"
                onClick={onStop}
                disabled={!onStop}
                title={onStop ? undefined : CLI_HINT}
                className={disabledCls}
              >
                Stop
              </Button>
            </>
          ) : (
            <Button
              color="running"
              intensity="mid"
              size="sm"
              onClick={onStart}
              disabled={!onStart}
              title={onStart ? undefined : OFFLINE_HINT}
              className={disabledCls}
            >
              Start
            </Button>
          )}
        </div>
      }
    />
  );
}
