import type { StartupPhaseRow, StartupPhaseSubtype } from 'crew-shared';
import type { StartupEventsTable } from '../db.js';
import type { Selectable } from 'kysely';

export type StartupEventRow = Selectable<StartupEventsTable>;

/**
 * Collapse the CLI's started+terminal event pair for each phase into a
 * single `StartupPhaseRow` (the daemon→frontend wire shape).
 *
 * Pairing rule: rows with the same `subtype` belong to one phase. The
 * first `started` row sets `startedAt`; the latest terminal row
 * (`completed` / `failed`) sets `completedAt`, `status`, `summary`,
 * `durationMs`, `logPath`. A phase with only a `started` row reports
 * `status: 'in_flight'`; with only a terminal row, both `startedAt`
 * and `completedAt` reflect the terminal ts (an unusual but recoverable
 * shape when the started event was lost).
 */
export function mergeStartedAndCompleted(rows: readonly StartupEventRow[]): StartupPhaseRow[] {
  const bySubtype = new Map<string, { started?: StartupEventRow; terminal?: StartupEventRow }>();
  for (const row of rows) {
    const entry = bySubtype.get(row.subtype) ?? {};
    if (row.status === 'started') {
      // The earliest started row wins (rows arrive in `ts ASC` order).
      if (!entry.started) entry.started = row;
    } else {
      // Latest terminal wins.
      entry.terminal = row;
    }
    bySubtype.set(row.subtype, entry);
  }

  return [...bySubtype.entries()].map(([subtype, { started, terminal }]) => {
    const startTs = started?.ts ?? terminal?.ts ?? 0;
    const endTs = terminal?.ts ?? null;
    const status: StartupPhaseRow['status'] = terminal
      ? terminal.status === 'failed'
        ? 'failed'
        : 'completed'
      : 'in_flight';
    return {
      type: 'system' as const,
      subtype: subtype as StartupPhaseSubtype,
      startedAt: new Date(startTs).toISOString(),
      completedAt: endTs !== null ? new Date(endTs).toISOString() : null,
      status,
      summary: terminal?.summary ?? started?.summary ?? '',
      durationMs: terminal?.duration_ms ?? null,
      logPath: terminal?.log_path ?? started?.log_path ?? null,
    };
  });
}
