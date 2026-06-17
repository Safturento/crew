import { sql, type Kysely } from 'kysely';

/**
 * 0010 makes init/preflight failures visible on `runs` (CREW-244 / Epic
 * CREW-235).
 *
 * A `crew run` that dies in preflight used to leave zero trace — registration
 * only happened after Claude spawned. This migration adds the columns that let
 * the run be pre-registered as `launching` before preflight and converted to a
 * structured `failed-start` on failure:
 *
 * - `status` — the run lifecycle value (`launching` | `running` |
 *   `failed-start`). Nullable + CHECK-guarded: legacy and normal runs leave it
 *   null, so the existing `completed_at`/`exit_code`/transition derivation is
 *   untouched. Only the launching → failed-start path writes it.
 * - `failure_check` / `failure_headline` / `failure_remediation` /
 *   `failure_output` — the `RunFailure` diagnosis (`crew-shared`). `output`
 *   carries the rendered `PreflightError`; the error's `details` map is folded
 *   into it, so no separate column is needed.
 * - `acknowledged` — 0/1 flag. A failed-start is unacknowledged until the
 *   operator dismisses it, or a fresh run for the same key auto-acknowledges
 *   the prior one.
 *
 * The status CHECK mirrors the `RUN_STATUSES` tuple in `crew-shared` — keep
 * them in sync if the contract grows.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE runs ADD COLUMN status TEXT
      CHECK (status IS NULL OR status IN ('launching', 'running', 'failed-start'))
  `.execute(db);
  await sql`ALTER TABLE runs ADD COLUMN failure_check TEXT`.execute(db);
  await sql`ALTER TABLE runs ADD COLUMN failure_headline TEXT`.execute(db);
  await sql`ALTER TABLE runs ADD COLUMN failure_remediation TEXT`.execute(db);
  await sql`ALTER TABLE runs ADD COLUMN failure_output TEXT`.execute(db);
  await sql`ALTER TABLE runs ADD COLUMN acknowledged INTEGER NOT NULL DEFAULT 0`.execute(db);

  // Partial index over the unacknowledged failed-start rows the Runner page's
  // "Failed to start" section reads — keeps that lookup cheap as runs grow.
  await sql`
    CREATE INDEX IF NOT EXISTS runs_failed_start_unacked
      ON runs (agent_key)
      WHERE status = 'failed-start' AND acknowledged = 0
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS runs_failed_start_unacked`.execute(db);
  await sql`ALTER TABLE runs DROP COLUMN acknowledged`.execute(db);
  await sql`ALTER TABLE runs DROP COLUMN failure_output`.execute(db);
  await sql`ALTER TABLE runs DROP COLUMN failure_remediation`.execute(db);
  await sql`ALTER TABLE runs DROP COLUMN failure_headline`.execute(db);
  await sql`ALTER TABLE runs DROP COLUMN failure_check`.execute(db);
  await sql`ALTER TABLE runs DROP COLUMN status`.execute(db);
}
