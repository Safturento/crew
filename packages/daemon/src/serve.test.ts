import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createDb } from './db.js';
import { serve } from './serve.js';
import { useTmpDir } from './test/tmpdir.js';

const tmp = useTmpDir('crew-serve-test-');

function envWithDb(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  // Strip our own keys from the inherited process.env so tests don't pick
  // up CREW_SEED_FIXTURES from the surrounding shell.
  const base = { ...process.env };
  delete base.CREW_SEED_FIXTURES;
  delete base.CREW_PORT;
  delete base.CREW_DB_FILE;
  return {
    ...base,
    CREW_PORT: '0',
    CREW_DB_FILE: join(tmp(), 'state.db'),
    ...extra,
  };
}

describe('serve — fixture seeding', () => {
  it('seeds fixtures when CREW_SEED_FIXTURES=1', async () => {
    const env = envWithDb({ CREW_SEED_FIXTURES: '1' });
    const { app, config } = await serve(env);
    try {
      const db = createDb(config.dbFile);
      try {
        const agents = await db.selectFrom('agents').selectAll().execute();
        expect(agents.length).toBeGreaterThanOrEqual(4);
      } finally {
        await db.destroy();
      }
    } finally {
      await app.close();
    }
  });

  it('seeds project TOMLs into a writable configDir when CREW_SEED_FIXTURES=1', async () => {
    // /api/projects reads disk, not the DB, so seedFixtures alone is insufficient —
    // this verifies the project-toml seeder runs and that configDir was redirected
    // to a writable path (the host's mount is RO in container deployments).
    const env = envWithDb({ CREW_SEED_FIXTURES: '1' });
    const { app, config } = await serve(env);
    try {
      expect(existsSync(join(config.configDir, 'crew.toml'))).toBe(true);
      expect(existsSync(join(config.configDir, 'recipes.toml'))).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('does not seed when CREW_SEED_FIXTURES is unset', async () => {
    const env = envWithDb();
    const { app, config } = await serve(env);
    try {
      const db = createDb(config.dbFile);
      try {
        const agents = await db.selectFrom('agents').selectAll().execute();
        expect(agents).toEqual([]);
      } finally {
        await db.destroy();
      }
    } finally {
      await app.close();
    }
  });

  it('does not seed when CREW_SEED_FIXTURES is set to a non-"1" value', async () => {
    const env = envWithDb({ CREW_SEED_FIXTURES: '0' });
    const { app, config } = await serve(env);
    try {
      const db = createDb(config.dbFile);
      try {
        const agents = await db.selectFrom('agents').selectAll().execute();
        expect(agents).toEqual([]);
      } finally {
        await db.destroy();
      }
    } finally {
      await app.close();
    }
  });
});
