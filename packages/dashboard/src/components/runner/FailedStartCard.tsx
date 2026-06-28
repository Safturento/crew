import { useState } from 'react';

import { Row } from '../Row.js';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import { STATE_CLASSES } from '@/data/state-meta';
import { formatAgo } from '@/format/relativeTime';
import { CommandBadge } from './CommandBadge.js';
import { RunDrawer } from './RunDrawer.js';
import type { FailedStartView } from './types.js';

interface FailedStartCardProps {
  failure: FailedStartView;
  onArchive: (key: string) => void;
}

/**
 * One Failed-to-start card. The shared `error` accent tints the row red; the
 * meta line carries the agent key + command + "failed to start · Nm ago", the
 * headline and the amber → remediation sit on the second line (remediation
 * omitted for generic non-health-check failures). Clicking the row opens the
 * run drawer (diagnosis + startup console log — CREW-291, absorbing the old
 * ViewOutputModal); `Archive` acknowledges the failure (moving it to Recently
 * ended).
 */
export function FailedStartCard({ failure, onArchive }: FailedStartCardProps) {
  const [open, setOpen] = useState(false);
  const f = failure;

  return (
    <>
      <Row
        accent="error"
        onActivate={() => setOpen(true)}
        ariaLabel={`Open run drawer for ${f.key}`}
        statusSlot={
          <Badge role="status" aria-label="failed" color="error" intensity="mid">
            failed
          </Badge>
        }
        title={
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="font-semibold text-foreground">{f.key}</span>
            <CommandBadge command={f.command} />
            <span className="truncate text-xs text-muted-foreground">
              failed to start · {formatAgo(f.failedAt)}
            </span>
          </div>
        }
        subheader={
          <div className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className="truncate text-foreground">{f.failure.headline}</span>
            {f.failure.remediation !== '' && (
              <span className={`truncate ${STATE_CLASSES.waiting.text}`}>
                → {f.failure.remediation}
              </span>
            )}
          </div>
        }
        actions={
          <div
            className="flex shrink-0 items-center justify-end gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <Button color="idle" intensity="ghost" size="sm" onClick={() => onArchive(f.key)}>
              Archive
            </Button>
            <Button color="error" intensity="mid" size="sm" onClick={() => setOpen(true)}>
              Inspect
            </Button>
          </div>
        }
      />
      <RunDrawer source={{ kind: 'failed-start', view: f }} open={open} onOpenChange={setOpen} />
    </>
  );
}
