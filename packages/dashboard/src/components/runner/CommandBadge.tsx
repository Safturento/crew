import type { RunnerCommandName } from './types.js';

/**
 * The small monospace command tag ("run" / "fix-pr" / "finish") shown in a
 * Runner row's meta line. A squared muted chip, distinct from the rounded
 * state Pill in the status slot.
 */
export function CommandBadge({ command }: { command: RunnerCommandName }) {
  // Matches Figma's `command` tag (type=tag, color=idle, intensity=muted):
  // slate-1100 surface + slate-500 (state/idle) text, mono.
  return (
    <span className="rounded bg-slate-1100 px-1.5 py-0.5 font-mono text-xs text-slate-500">
      {command}
    </span>
  );
}
