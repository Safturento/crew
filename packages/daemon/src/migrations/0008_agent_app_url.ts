import type { Kysely } from 'kysely';

/**
 * 0008 adds the nullable `app_url` column to `agents` (CREW-233).
 *
 * `deriveAppUrl(cfg)` only ever yields the *static* config port, but each
 * worktree agent runs its app on a deterministic per-worktree port that
 * `env.toml` materializes as `APP_URL = http://localhost:${CREW_VITE_PORT}`.
 * The CLI now passes that materialized value at `registerRun`; storing it
 * here lets the drawer's app pill link to the agent's actual running app.
 * Null preserves the existing behaviour — `getByKey` falls back to
 * `deriveAppUrl(cfg)` when the column is unset (canonical main stack, or
 * agents registered before this column existed).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('agents').addColumn('app_url', 'text').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('agents').dropColumn('app_url').execute();
}
