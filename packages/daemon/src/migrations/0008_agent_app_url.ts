import type { Kysely } from 'kysely';

/**
 * 0008 adds the nullable `app_url` column to `agents` (CREW-233).
 *
 * `crew run` / `crew fix-pr` materialize a deterministic per-worktree
 * `APP_URL` (env.toml → .env) and now pass it at run registration. The
 * daemon stores it here so the drawer's app pill links to the agent's
 * actual running port instead of the static `playwright.app_url` config.
 * Nullable: pre-CREW-233 agents (and any registration that omits the
 * field) fall back to `deriveAppUrl(cfg)` in AgentsService.getByKey.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('agents').addColumn('app_url', 'text').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('agents').dropColumn('app_url').execute();
}
