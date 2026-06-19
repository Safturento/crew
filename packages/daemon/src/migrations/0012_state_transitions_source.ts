import type { Kysely } from 'kysely';

/**
 * 0012 — provenance on every state transition (CREW-259). `source` records what
 * drove the hop: a StateEvent source (`cli-run`, `cli-fixpr`, `cli-finish`,
 * `runner-exit`, `hook-pr-create`), `poller` (PrPoller's pr_merged flip),
 * `startup-failure` (a failed startup phase), or `override` (the operator escape
 * hatch — POST /api/agents/:key/state). Nullable: legacy/backfilled rows carry
 * null. Free-form TEXT so a new producer doesn't need a migration.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('state_transitions').addColumn('source', 'text').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('state_transitions').dropColumn('source').execute();
}
