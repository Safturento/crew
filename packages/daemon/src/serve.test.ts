import { describe, it, expect } from 'vitest';
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
