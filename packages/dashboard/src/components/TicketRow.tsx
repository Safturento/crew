import { Hash } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { STATE_CLASSES } from '@/data/state-meta';
import { cn } from '@/lib/utils';
import type { PillColor } from '@/lib/pill-variants';
import type { PickerTicket } from 'crew-shared';

/**
 * Jira priority → the state-pill color that reads it at a glance (Figma 362:2212).
 * Keyed on Jira's standard priority-scheme names. A priority outside this set
 * (custom schemes — `P1`, etc.) falls back to a neutral `idle` badge that still
 * shows the raw label.
 */
const PRIORITY_COLOR: Record<string, PillColor> = {
  Highest: 'error',
  High: 'error',
  Medium: 'waiting',
  Low: 'initializing',
  Lowest: 'initializing',
};

/**
 * The tinted status reason shown in the meta line. Precedence is
 * **blocked > interactive > running** (Figma 362:2212): a row can be several at
 * once, but only the most-blocking reason surfaces. Tints reuse the dashboard's
 * state-color text tokens — blocked = amber (waiting), interactive = violet
 * (pr_open), running = slate (running) — so the picker reads consistently with
 * the rest of the UI.
 */
function reasonFor(ticket: PickerTicket): { text: string; className: string } | null {
  if (!ticket.runnable && ticket.blockedBy.length > 0)
    return {
      text: `blocked by ${ticket.blockedBy.map((b) => b.key).join(', ')}`,
      className: STATE_CLASSES.waiting.text,
    };
  if (ticket.interactive) return { text: 'interactive', className: STATE_CLASSES.pr_open.text };
  if (ticket.hasActiveAgent) return { text: 'running', className: STATE_CLASSES.running.text };
  return null;
}

/**
 * A two-row picker row (Figma NewRunStep2Content 362:2212): the title is the
 * bold, wrapping primary; the muted mono meta line carries `# KEY` plus the
 * tinted status reason; the priority badge sits top-right. `disabled` is derived
 * internally — a row that is blocked, in-flight, or `interactive` dims to
 * opacity-50 and stops being selectable (`interactive` work must be driven live,
 * not via `crew run`).
 */
export function TicketRow({
  ticket,
  onSelect,
}: {
  ticket: PickerTicket;
  onSelect: (t: PickerTicket) => void;
}) {
  const disabled = !ticket.runnable || ticket.hasActiveAgent || ticket.interactive;
  const reason = reasonFor(ticket);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : () => onSelect(ticket)}
      className={cn(
        'flex w-full items-start gap-3 rounded-md border border-border bg-card px-3.5 py-2.5 text-left',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'cursor-pointer transition-colors hover:border-ring',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold text-foreground">{ticket.summary}</span>
        <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
          <Hash className="size-3 shrink-0" aria-hidden />
          {ticket.key}
          {reason && (
            <>
              <span aria-hidden>·</span>
              <span className={reason.className}>{reason.text}</span>
            </>
          )}
        </span>
      </div>
      {ticket.priority && (
        <Badge
          className="shrink-0"
          color={PRIORITY_COLOR[ticket.priority] ?? 'idle'}
          intensity="mid"
        >
          {ticket.priority}
        </Badge>
      )}
    </button>
  );
}
