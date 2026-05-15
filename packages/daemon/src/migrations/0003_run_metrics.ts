import { sql, type Kysely } from 'kysely';

/**
 * 0003 adds the Layer-1 metrics columns to `runs` (CREW-164):
 *
 * - `doc_load_coverage_pct`  — % of the worktree's agent-context docs the
 *                              run actually opened (REAL, nullable).
 * - `cleanliness_pass`       — 1 when the run ran a verification command
 *                              (lint/typecheck/test/format), else 0.
 * - `pr_claim_input_tokens`  — context size of the turn that issued
 *                              `gh pr create` (INTEGER, nullable).
 * - `parity_violations`      — count of `.agents/` parity violations
 *                              (INTEGER, nullable — populated once the
 *                              Phase 3 hook exists).
 * - `baseline`               — 1 marks a pre-rollout baseline run so the
 *                              `/metrics` aggregate can split current vs
 *                              baseline. Defaults to 0.
 *
 * `up()` uses `ADD COLUMN` (cheap, non-rewriting). `down()` uses
 * `DROP COLUMN` (SQLite ≥ 3.35) — the columns carry no index or constraint,
 * so the drop is unrestricted and leaves the rest of `runs` intact.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE runs ADD COLUMN doc_load_coverage_pct REAL`.execute(db);
  await sql`ALTER TABLE runs ADD COLUMN cleanliness_pass INTEGER`.execute(db);
  await sql`ALTER TABLE runs ADD COLUMN pr_claim_input_tokens INTEGER`.execute(db);
  await sql`ALTER TABLE runs ADD COLUMN parity_violations INTEGER`.execute(db);
  await sql`ALTER TABLE runs ADD COLUMN baseline INTEGER NOT NULL DEFAULT 0`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE runs DROP COLUMN baseline`.execute(db);
  await sql`ALTER TABLE runs DROP COLUMN parity_violations`.execute(db);
  await sql`ALTER TABLE runs DROP COLUMN pr_claim_input_tokens`.execute(db);
  await sql`ALTER TABLE runs DROP COLUMN cleanliness_pass`.execute(db);
  await sql`ALTER TABLE runs DROP COLUMN doc_load_coverage_pct`.execute(db);
}
