import { Row } from '../Row.js';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import { formatAgo } from '@/format/relativeTime';
import type { SupervisorView } from './types.js';

interface SupervisorCardProps {
  supervisor: SupervisorView;
  /**
   * Lifecycle controls (CREW-293). `onRestart`/`onStop` enqueue the supervisor
   * reverse-queue commands; `onStart` is the cold-Start CLI hint (the supervisor
   * can't be started from the dashboard — once it's stopped nothing drains the
   * queue). Omitting a handler renders the button disabled with an explanatory
   * title.
   */
  onRestart?: () => void;
  onStop?: () => void;
  onStart?: () => void;
  /**
   * CREW-292: opens the supervisor drawer (the management-log tail). The whole
   * card is the click target; the lifecycle buttons stop propagation so they
   * act without also opening the drawer.
   */
  onOpen?: () => void;
}

const CLI_HINT = 'Manage the supervisor with the `crew runner` CLI';
const OFFLINE_HINT = 'Runner offline';

/**
 * The supervisor health card. Online → a `running` pill + Restart/Stop; offline
 * → a `down` pill + Start, with every control disabled and annotated "Runner
 * offline" (the daemon can't reach the runner to act). The meta line shows the
 * heartbeat cadence + last-seen; workers/uptime/pid aren't on the wire yet.
 */
export function SupervisorCard({
  supervisor,
  onRestart,
  onStop,
  onStart,
  onOpen,
}: SupervisorCardProps) {
  const { online, lastSeen } = supervisor;
  const disabledCls = 'disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <Row
      onActivate={onOpen}
      ariaLabel={onOpen ? 'Open supervisor detail' : undefined}
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
        // Stop the action clicks from bubbling to the row's activate handler —
        // Restart/Stop/Start must act without also opening the drawer.
        <div
          className="flex shrink-0 items-center justify-end gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {online ? (
            <>
              <Button
                color="idle"
                intensity="muted"
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
                intensity="muted"
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
