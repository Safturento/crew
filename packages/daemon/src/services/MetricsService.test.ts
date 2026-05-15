import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pino, type Logger } from 'pino';
import { claudeProjectDirFor } from 'crew-shared';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { MetricsService } from './MetricsService.js';
import type { Kysely } from 'kysely';

const silentLogger: Logger = pino({ level: 'silent' });

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function freshDb(): Promise<Kysely<DaemonDatabase>> {
  const dir = mkdtempSync(join(tmpdir(), 'crew-metrics-svc-'));
  tmpdirs.push(dir);
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

interface SeedRun {
  agentKey: string;
  baseline: 0 | 1;
  docLoadCoveragePct?: number | null;
  cleanlinessPass?: number | null;
  prClaimInputTokens?: number | null;
  parityViolations?: number | null;
}

async function seedRun(db: Kysely<DaemonDatabase>, run: SeedRun): Promise<number> {
  await db
    .insertInto('agents')
    .values({
      key: run.agentKey,
      project_name: 'demo',
      ticket_title: run.agentKey,
      worktree_path: `/x/${run.agentKey}`,
      branch: run.agentKey,
      pr_url: null,
      created_at: '2026-05-13T10:00:00Z',
    })
    .onConflict((oc) => oc.column('key').doNothing())
    .execute();
  const inserted = await db
    .insertInto('runs')
    .values({
      agent_key: run.agentKey,
      command: 'run',
      session_id: `s-${run.agentKey}-${Math.random()}`,
      started_at: '2026-05-13T10:00:00Z',
      completed_at: '2026-05-13T11:00:00Z',
      exit_code: 0,
      doc_load_coverage_pct: run.docLoadCoveragePct ?? null,
      cleanliness_pass: run.cleanlinessPass ?? null,
      pr_claim_input_tokens: run.prClaimInputTokens ?? null,
      parity_violations: run.parityViolations ?? null,
      baseline: run.baseline,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return inserted.id;
}

describe('MetricsService', () => {
  it('records metrics onto an existing run row', async () => {
    const db = await freshDb();
    try {
      const runId = await seedRun(db, { agentKey: 'KAN-1', baseline: 0 });
      const svc = new MetricsService({ db, logger: silentLogger });

      await svc.recordMetrics(runId, {
        docLoadCoveragePct: 85,
        cleanlinessPass: 1,
        prClaimInputTokens: 12000,
        parityViolations: 0,
      });

      const row = await db
        .selectFrom('runs')
        .selectAll()
        .where('id', '=', runId)
        .executeTakeFirstOrThrow();
      expect(row.doc_load_coverage_pct).toBe(85);
      expect(row.cleanliness_pass).toBe(1);
      expect(row.pr_claim_input_tokens).toBe(12000);
      expect(row.parity_violations).toBe(0);
    } finally {
      await db.destroy();
    }
  });

  it('aggregates non-baseline runs, skipping nulls in the averages', async () => {
    const db = await freshDb();
    try {
      await seedRun(db, {
        agentKey: 'a',
        baseline: 0,
        docLoadCoveragePct: 80,
        cleanlinessPass: 1,
        prClaimInputTokens: 10000,
        parityViolations: 0,
      });
      await seedRun(db, {
        agentKey: 'b',
        baseline: 0,
        docLoadCoveragePct: 90,
        cleanlinessPass: 1,
        prClaimInputTokens: 8000,
        parityViolations: 1,
      });
      // A baseline run that must NOT bleed into the non-baseline aggregate.
      await seedRun(db, {
        agentKey: 'c',
        baseline: 1,
        docLoadCoveragePct: null,
        cleanlinessPass: 0,
        prClaimInputTokens: 20000,
        parityViolations: null,
      });
      const svc = new MetricsService({ db, logger: silentLogger });

      const agg = await svc.aggregate({ baseline: false });
      expect(agg.runCount).toBe(2);
      expect(agg.avgDocLoadCoverage).toBe(85);
      expect(agg.cleanlinessPassRate).toBe(1);
      expect(agg.avgPrClaimInputTokens).toBe(9000);
      expect(agg.parityViolationRate).toBe(0.5);
    } finally {
      await db.destroy();
    }
  });

  it('aggregates baseline runs separately', async () => {
    const db = await freshDb();
    try {
      await seedRun(db, {
        agentKey: 'a',
        baseline: 1,
        cleanlinessPass: 1,
        prClaimInputTokens: 15000,
      });
      await seedRun(db, {
        agentKey: 'b',
        baseline: 1,
        cleanlinessPass: 0,
        prClaimInputTokens: 18000,
      });
      const svc = new MetricsService({ db, logger: silentLogger });

      const agg = await svc.aggregate({ baseline: true });
      expect(agg.runCount).toBe(2);
      expect(agg.cleanlinessPassRate).toBe(0.5);
      expect(agg.avgPrClaimInputTokens).toBe(16500);
      expect(agg.avgDocLoadCoverage).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  it('returns a zeroed aggregate when no runs match', async () => {
    const db = await freshDb();
    try {
      const svc = new MetricsService({ db, logger: silentLogger });
      const agg = await svc.aggregate({ baseline: false });
      expect(agg).toEqual({
        runCount: 0,
        avgDocLoadCoverage: null,
        cleanlinessPassRate: 0,
        avgPrClaimInputTokens: 0,
        parityViolationRate: 0,
      });
    } finally {
      await db.destroy();
    }
  });
});

describe('MetricsService.captureForRun', () => {
  function assistantToolUse(
    id: string,
    name: string,
    input: Record<string, unknown>,
    usage?: Record<string, number>,
  ): string {
    return JSON.stringify({
      type: 'assistant',
      timestamp: '2026-05-13T10:30:00.000Z',
      message: {
        content: [{ type: 'tool_use', id, name, input }],
        usage: usage ?? { output_tokens: 100 },
      },
    });
  }

  it('computes metrics from the run transcript and records them on the row', async () => {
    const db = await freshDb();
    const home = mkdtempSync(join(tmpdir(), 'crew-capture-home-'));
    const worktree = mkdtempSync(join(tmpdir(), 'crew-capture-wt-'));
    tmpdirs.push(home, worktree);
    const prevHome = process.env.HOME;
    process.env.HOME = home;
    try {
      // Worktree agent-doc inventory: 2 docs, the run reads 1 of them.
      writeFileSync(join(worktree, 'AGENTS.md'), '# root');
      mkdirSync(join(worktree, '.agents'));
      writeFileSync(join(worktree, '.agents', 'testing.md'), '# testing');

      await db
        .insertInto('agents')
        .values({
          key: 'KAN-9',
          project_name: 'demo',
          ticket_title: 'Demo',
          worktree_path: worktree,
          branch: 'KAN-9',
          pr_url: null,
          created_at: '2026-05-13T10:00:00Z',
        })
        .execute();
      const run = await db
        .insertInto('runs')
        .values({
          agent_key: 'KAN-9',
          command: 'run',
          session_id: 'sess-capture',
          started_at: '2026-05-13T10:00:00Z',
          completed_at: '2026-05-13T11:00:00Z',
          exit_code: 0,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      const projDir = claudeProjectDirFor(worktree, home);
      mkdirSync(projDir, { recursive: true });
      writeFileSync(
        join(projDir, 'sess-capture.jsonl'),
        [
          assistantToolUse('t1', 'Read', { file_path: join(worktree, 'AGENTS.md') }),
          assistantToolUse('t2', 'Bash', { command: 'npm run lint' }),
          assistantToolUse('t3', 'Bash', { command: 'gh pr create --fill' }, {
            input_tokens: 2000,
            cache_read_input_tokens: 38000,
            cache_creation_input_tokens: 0,
          }),
        ].join('\n'),
      );

      const svc = new MetricsService({ db, logger: silentLogger });
      await svc.captureForRun(run.id);

      const row = await db
        .selectFrom('runs')
        .selectAll()
        .where('id', '=', run.id)
        .executeTakeFirstOrThrow();
      expect(row.cleanliness_pass).toBe(1);
      expect(row.pr_claim_input_tokens).toBe(40000);
      expect(row.doc_load_coverage_pct).toBe(50);
      expect(row.parity_violations).toBeNull();
    } finally {
      process.env.HOME = prevHome;
      await db.destroy();
    }
  });

  it('is a no-op for an unknown run id', async () => {
    const db = await freshDb();
    try {
      const svc = new MetricsService({ db, logger: silentLogger });
      await expect(svc.captureForRun(9999)).resolves.toBeUndefined();
    } finally {
      await db.destroy();
    }
  });

  it('swallows a missing transcript without throwing', async () => {
    const db = await freshDb();
    const worktree = mkdtempSync(join(tmpdir(), 'crew-capture-notranscript-'));
    tmpdirs.push(worktree);
    try {
      await db
        .insertInto('agents')
        .values({
          key: 'KAN-10',
          project_name: 'demo',
          ticket_title: 'Demo',
          worktree_path: worktree,
          branch: 'KAN-10',
          pr_url: null,
          created_at: '2026-05-13T10:00:00Z',
        })
        .execute();
      const run = await db
        .insertInto('runs')
        .values({
          agent_key: 'KAN-10',
          command: 'run',
          session_id: 'sess-missing',
          started_at: '2026-05-13T10:00:00Z',
          completed_at: '2026-05-13T11:00:00Z',
          exit_code: 0,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      const svc = new MetricsService({ db, logger: silentLogger });
      await expect(svc.captureForRun(run.id)).resolves.toBeUndefined();
      const row = await db
        .selectFrom('runs')
        .select('cleanliness_pass')
        .where('id', '=', run.id)
        .executeTakeFirstOrThrow();
      expect(row.cleanliness_pass).toBeNull();
    } finally {
      await db.destroy();
    }
  });
});
