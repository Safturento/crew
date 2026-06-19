import type { RunnerCommandName } from './types.js';

/**
 * The small monospace command tag ("run" / "fix-pr" / "finish") shown in a
 * Runner row's meta line. A squared muted chip, distinct from the rounded
 * state Pill in the status slot.
 */
export function CommandBadge({ command }: { command: RunnerCommandName }) {
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
      {command}
    </span>
  );
}
