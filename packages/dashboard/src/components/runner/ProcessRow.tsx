import type { LiveProcess, LiveProcessState } from 'crew-shared';

import type { PillColor } from '@/lib/pill-variants';
import { useLiveDuration } from '@/format/useLiveDuration';
import { AlertModal } from '../AlertModal.js';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import { Row } from '../Row.js';
import { CommandBadge } from './CommandBadge.js';
import { useCancelEscalation } from './useCancelEscalation.js';

interface ProcessRowProps {
  process: LiveProcess;
  onCancel: (key: string) => void;
  onForceKill: (key: string) => void;
}

const PILL: Record<LiveProcessState, { label: string; color: PillColor }> = {
  launching: { label: 'launching', color: 'initializing' },
  running: { label: 'running', color: 'running' },
  cancelling: { label: 'cancelling', color: 'waiting' },
  paused: { label: 'paused', color: 'idle' },
};

/**
 * One supervisor-held live process. The status pill maps the live state to its
 * color; the row itself stays plain (only Failed-to-start / Unmanaged carry an
 * accent). `Cancel` opens a confirm then runs the soft→hard escalation: the row
 * shows `cancelling` and a single `Force kill` surfaces after ~10s (or
 * immediately when the snapshot already reports the process `cancelling`).
 * `Pause` is the CREW-248 fast-follow — rendered disabled in v1.
 */
export function ProcessRow({ process, onCancel, onForceKill }: ProcessRowProps) {
  const escalation = useCancelEscalation({
    onSoftCancel: () => onCancel(process.agentKey),
    onForceKill: () => onForceKill(process.agentKey),
  });

  const snapshotCancelling = process.state === 'cancelling';
  const cancelling = snapshotCancelling || escalation.phase === 'cancelling';
  const showForceKill = snapshotCancelling || escalation.showForceKill;
  const pill = cancelling ? PILL.cancelling : PILL[process.state];
  const duration = useLiveDuration(process.spawnedAt, process.state !== 'paused');

  return (
    <>
      <Row
        statusSlot={
          <Badge role="status" aria-label={pill.label} color={pill.color} intensity="mid">
            {pill.label}
          </Badge>
        }
        title={
          <span className="truncate text-sm font-semibold text-foreground">{process.agentKey}</span>
        }
        subheader={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CommandBadge command={process.command} />
            <span className="truncate">{process.project}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">
              {cancelling ? `cancelling · ${duration}` : duration}
            </span>
          </div>
        }
        actions={
          <div className="flex shrink-0 items-center justify-end gap-1.5">
            {cancelling ? (
              showForceKill && (
                <Button color="error" intensity="loud" size="sm" onClick={escalation.forceKill}>
                  Force kill
                </Button>
              )
            ) : (
              <>
                {process.state === 'running' && (
                  <Button
                    color="running"
                    intensity="ghost"
                    size="sm"
                    disabled
                    title="Pause is coming in a fast-follow (CREW-248)"
                    className="disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Pause
                  </Button>
                )}
                <Button color="error" intensity="mid" size="sm" onClick={escalation.requestCancel}>
                  Cancel
                </Button>
              </>
            )}
          </div>
        }
      />
      <AlertModal
        open={escalation.phase === 'confirming'}
        onOpenChange={(open) => {
          if (!open) escalation.dismiss();
        }}
        title={`Cancel ${process.agentKey}?`}
        description="Sends a graceful stop to the agent process. If it hasn't settled in ~10s you can escalate to a force kill."
        cancelLabel="Keep running"
        actionLabel="Cancel run"
        actionColor="error"
        actionIntensity="loud"
        onAction={escalation.confirm}
      />
    </>
  );
}
