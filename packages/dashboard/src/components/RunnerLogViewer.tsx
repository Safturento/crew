import { useRunnerLogs } from '../data/useRunnerLogs.js';
import { Modal } from './Modal.js';

interface RunnerLogViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * CREW-221: the runner log viewer, opened from the runner health chip. Tails
 * `GET /api/runner/logs` and live-refetches while open (see `useRunnerLogs`).
 * On a worktree stack — which runs no runner — the log is absent and the
 * daemon returns `[]`, so this renders the "no runner logs" empty state
 * rather than an error.
 */
export function RunnerLogViewer({ open, onOpenChange }: RunnerLogViewerProps) {
  const { data, isLoading, isError } = useRunnerLogs({ enabled: open });
  const lines = data ?? [];

  return (
    <Modal title="Runner logs" open={open} onOpenChange={onOpenChange}>
      {lines.length > 0 ? (
        <pre
          className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-slate-1100 p-3 font-mono text-xs leading-relaxed text-muted-foreground"
          data-testid="runner-log-output"
        >
          {lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </pre>
      ) : (
        <p className="py-8 text-center text-xs text-muted-foreground">
          {isError
            ? "Couldn't load runner logs."
            : isLoading
              ? 'Loading runner logs…'
              : 'No runner logs — no runner is running here.'}
        </p>
      )}
    </Modal>
  );
}
