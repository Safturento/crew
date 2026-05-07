import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseProjectConfig } from 'crew-shared';
import { createDb, runMigrations } from '../src/db.js';
import { useTmpDir } from '../src/test/tmpdir.js';
import { seedFixtures, seedProjectFixtures } from './dev.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'src', 'migrations');

const tmp = useTmpDir('crew-seed-test-');

async function migratedDb(): Promise<ReturnType<typeof createDb>> {
  const db = createDb(join(tmp(), 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

describe('seedFixtures', () => {
  it('seeds projects, agents, runs, and tool_calls into an empty migrated DB', async () => {
    const db = await migratedDb();
    try {
      await seedFixtures(db);

      const agents = await db.selectFrom('agents').selectAll().execute();
      const runs = await db.selectFrom('runs').selectAll().execute();
      const toolCalls = await db.selectFrom('tool_calls').selectAll().execute();

      expect(agents.length).toBeGreaterThanOrEqual(4);
      expect(runs.length).toBeGreaterThanOrEqual(4);
      expect(toolCalls.length).toBeGreaterThanOrEqual(4);

      // At least one agent ends up `pr_open` — modeled by setting `pr_url`
      // and including a `gh pr create` Bash tool_call (drives derived state).
      expect(agents.some((a) => a.pr_url !== null)).toBe(true);
      expect(
        toolCalls.some(
          (tc) => tc.tool_name === 'Bash' && tc.input_summary?.startsWith('gh pr create'),
        ),
      ).toBe(true);
    } finally {
      await db.destroy();
    }
  });

  it('seeds project TOMLs whose names match the seeded agents (so dashboard groups land)', () => {
    const dir = join(tmp(), 'projects');
    mkdirSync(dir, { recursive: true });

    seedProjectFixtures(dir);

    expect(existsSync(join(dir, 'crew.toml'))).toBe(true);
    expect(existsSync(join(dir, 'recipes.toml'))).toBe(true);

    // Each TOML must parse cleanly through ProjectsService's loader, otherwise
    // /api/projects silently skips it and the dashboard re-acquires the empty
    // state this seed exists to prevent.
    const crewCfg = parseProjectConfig(readFileSync(join(dir, 'crew.toml'), 'utf8'));
    const recipesCfg = parseProjectConfig(readFileSync(join(dir, 'recipes.toml'), 'utf8'));
    expect(crewCfg.name).toBe('crew');
    expect(recipesCfg.name).toBe('recipes');
  });

  it('seedProjectFixtures is idempotent — re-running does not overwrite existing files', () => {
    const dir = join(tmp(), 'projects');
    mkdirSync(dir, { recursive: true });

    // Pre-existing TOML with a non-default name should be preserved on re-run
    // (idempotency: don't clobber state a previous boot or operator left).
    const stamped = '# user-edited fixture\nname = "crew"\nrepo_path = "/edited"\n';
    writeFileSync(join(dir, 'crew.toml'), stamped, 'utf8');

    seedProjectFixtures(dir);
    seedProjectFixtures(dir);

    expect(readFileSync(join(dir, 'crew.toml'), 'utf8')).toBe(stamped);
    // recipes was missing on first run — gets seeded; second run is a no-op.
    expect(existsSync(join(dir, 'recipes.toml'))).toBe(true);
  });

  it('is idempotent — running twice does not duplicate rows', async () => {
    const db = await migratedDb();
    try {
      await seedFixtures(db);
      const firstAgents = (await db.selectFrom('agents').selectAll().execute()).length;
      const firstRuns = (await db.selectFrom('runs').selectAll().execute()).length;
      const firstToolCalls = (await db.selectFrom('tool_calls').selectAll().execute()).length;

      await seedFixtures(db);
      const secondAgents = (await db.selectFrom('agents').selectAll().execute()).length;
      const secondRuns = (await db.selectFrom('runs').selectAll().execute()).length;
      const secondToolCalls = (await db.selectFrom('tool_calls').selectAll().execute()).length;

      expect(secondAgents).toBe(firstAgents);
      expect(secondRuns).toBe(firstRuns);
      expect(secondToolCalls).toBe(firstToolCalls);
    } finally {
      await db.destroy();
    }
  });
});
