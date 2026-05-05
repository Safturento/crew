import { describe, it, expect } from 'vitest';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, runMigrations } from '../src/db.js';
import { useTmpDir } from '../src/test/tmpdir.js';
import { seedFixtures } from './dev.js';

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
