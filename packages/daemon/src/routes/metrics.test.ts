import { describe, it, expect } from 'vitest';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pino, type Logger } from 'pino';
import { buildApp } from '../app.js';
import { parseDaemonConfig } from '../config.js';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { useTmpDir } from '../test/tmpdir.js';
import type { Kysely } from 'kysely';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmp = useTmpDir();
const silentLogger: Logger = pino({ level: 'silent' });

async function setupApp() {
  const dir = tmp();
  const config = parseDaemonConfig({
    CREW_CONFIG_DIR: dir,
    CREW_DB_FILE: join(dir, 'state.db'),
  });
  const db = createDb(config.dbFile);
  await runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp({ config, logger: silentLogger, db });
  return { app, db };
}

async function seedRun(
  db: Kysely<DaemonDatabase>,
  opts: { key: string; baseline: 0 | 1; cleanlinessPass: number; prClaimInputTokens: number },
): Promise<void> {
  await db
    .insertInto('agents')
    .values({
      key: opts.key,
      project_name: 'demo',
      ticket_title: opts.key,
      worktree_path: `/x/${opts.key}`,
      branch: opts.key,
      pr_url: null,
      created_at: '2026-05-13T10:00:00Z',
    })
    .onConflict((oc) => oc.column('key').doNothing())
    .execute();
  await db
    .insertInto('runs')
    .values({
      agent_key: opts.key,
      command: 'run',
      session_id: `s-${opts.key}`,
      started_at: '2026-05-13T10:00:00Z',
      completed_at: '2026-05-13T11:00:00Z',
      exit_code: 0,
      doc_load_coverage_pct: 75,
      cleanliness_pass: opts.cleanlinessPass,
      pr_claim_input_tokens: opts.prClaimInputTokens,
      parity_violations: 0,
      baseline: opts.baseline,
    })
    .execute();
}

describe('GET /api/metrics', () => {
  it('returns the aggregated current cohort for baseline=false', async () => {
    const { app, db } = await setupApp();
    try {
      await seedRun(db, { key: 'A', baseline: 0, cleanlinessPass: 1, prClaimInputTokens: 10000 });
      await seedRun(db, { key: 'B', baseline: 0, cleanlinessPass: 0, prClaimInputTokens: 20000 });
      await seedRun(db, { key: 'C', baseline: 1, cleanlinessPass: 1, prClaimInputTokens: 50000 });

      const res = await app.inject({ method: 'GET', url: '/api/metrics?baseline=false' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        runCount: 2,
        avgDocLoadCoverage: 75,
        cleanlinessPassRate: 0.5,
        avgPrClaimInputTokens: 15000,
        parityViolationRate: 0,
      });
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('returns the baseline cohort for baseline=true', async () => {
    const { app, db } = await setupApp();
    try {
      await seedRun(db, { key: 'A', baseline: 0, cleanlinessPass: 1, prClaimInputTokens: 10000 });
      await seedRun(db, { key: 'C', baseline: 1, cleanlinessPass: 1, prClaimInputTokens: 50000 });

      const res = await app.inject({ method: 'GET', url: '/api/metrics?baseline=true' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.runCount).toBe(1);
      expect(body.avgPrClaimInputTokens).toBe(50000);
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('defaults to the current cohort when baseline is omitted', async () => {
    const { app, db } = await setupApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/metrics' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        runCount: 0,
        avgDocLoadCoverage: null,
        cleanlinessPassRate: 0,
        avgPrClaimInputTokens: 0,
        parityViolationRate: 0,
      });
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('rejects a non-boolean baseline value with 400', async () => {
    const { app, db } = await setupApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/metrics?baseline=banana' });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
      await db.destroy();
    }
  });
});
