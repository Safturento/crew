import { useState } from 'react';
import type { LiveProcess, LiveProcessState } from 'crew-shared';

import type { PillColor } from '@/lib/pill-variants';
import { useLiveDuration } from '@/format/useLiveDuration';
import { AlertModal } from '../AlertModal.js';
import { ResumeModal } from '../ResumeModal.js';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import { Row } from '../Row.js';
import { CommandBadge } from './CommandBadge.js';
import { useCancelEscalation } from './useCancelEscalation.js';

interface ProcessRowProps {
  process: LiveProcess;
  onCancel: (key: string) => void;
  onForceKill: (key: string) => void;
  onPause: (key: string) => void;
  onResume: (key: string, message?: string) => void;
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
 * A `running` process can be `Pause`d; a `paused` one shows `Resume` (opening a
 * modal for an optional steer message) — the CREW-274 controls on top of the
 * CREW-272/273 backend.
 */
export function ProcessRow({ process, onCancel, onForceKill, onPause, onResume }: ProcessRowProps) {
  const escalation = useCancelEscalation({
    onSoftCancel: () => onCancel(process.agentKey),
    onForceKill: () => onForceKill(process.agentKey),
  });
  const [resumeOpen, setResumeOpen] = useState(false);

  const snapshotCancelling = process.state === 'cancelling';
  const cancelling = snapshotCancelling || escalation.phase === 'cancelling';
  const showForceKill = snapshotCancelling || escalation.showForceKill;
  const paused = process.state === 'paused';
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
                    color="idle"
                    intensity="ghost"
                    size="sm"
                    onClick={() => onPause(process.agentKey)}
                  >
                    Pause
                  </Button>
                )}
                {paused && (
                  <Button
                    color="running"
                    intensity="mid"
                    size="sm"
                    onClick={() => setResumeOpen(true)}
                  >
                    Resume
                  </Button>
                )}
                <Button
                  color="error"
                  intensity="muted"
                  size="sm"
                  onClick={escalation.requestCancel}
                >
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
      <ResumeModal
        agentKey={process.agentKey}
        open={resumeOpen}
        onOpenChange={setResumeOpen}
        onSubmit={(message) => onResume(process.agentKey, message)}
      />
    </>
  );
}
