import { Copy, X } from 'lucide-react';
import { toast } from 'sonner';
import type { RunFailure } from 'crew-shared';

import { Modal } from '../Modal.js';
import { Button } from '../ui/button.js';
import { CommandBadge } from './CommandBadge.js';
import { STATE_CLASSES } from '@/data/state-meta';
import { formatAgo } from '@/format/relativeTime';
import type { RunnerCommandName } from './types.js';

interface ViewOutputModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentKey: string;
  command: RunnerCommandName;
  project: string;
  failedAt: string; // ISO
  failure: RunFailure;
}

/**
 * The failed-start "Startup output" (Inspect) modal — a thin interim for the
 * CREW-249 run drawer. Two panels: a Diagnosis (the failed check name, the
 * headline, the amber remediation) and the captured startup Output with a
 * Copy button. The Diagnosis + Output content carries directly into the
 * future run drawer.
 */
export function ViewOutputModal({
  open,
  onOpenChange,
  agentKey,
  command,
  project,
  failedAt,
  failure,
}: ViewOutputModalProps) {
  const copy = () => {
    void navigator.clipboard?.writeText(failure.output);
    toast.success('Output copied');
  };

  return (
    <Modal title={`Startup output — ${agentKey}`} open={open} onOpenChange={onOpenChange}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CommandBadge command={command} />
          <span className="truncate">{project}</span>
          <span aria-hidden>·</span>
          <span>failed {formatAgo(failedAt)}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold text-muted-foreground">Diagnosis</h3>
          <p className={`flex items-center gap-2 font-mono text-sm ${STATE_CLASSES.error.text}`}>
            <X className="h-4 w-4" aria-hidden />
            {failure.check}
          </p>
          <p className="text-sm text-muted-foreground">{failure.headline}</p>
          {failure.remediation !== '' && (
            <p className={`text-sm ${STATE_CLASSES.waiting.text}`}>→ {failure.remediation}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted-foreground">Output</h3>
            <Button
              color="running"
              intensity="muted"
              size="xs"
              icon={<Copy aria-hidden />}
              onClick={copy}
            >
              Copy
            </Button>
          </div>
          <pre className="max-h-64 overflow-auto rounded-md bg-slate-950 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
            {failure.output}
          </pre>
        </div>
      </div>
    </Modal>
  );
}
