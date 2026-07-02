import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useTmpDir } from '../test/tmpdir.js';
import { TimelineService } from './TimelineService.js';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import type { Kysely } from 'kysely';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmp = useTmpDir('crew-timeline-');

async function freshDb(): Promise<Kysely<DaemonDatabase>> {
  const dir = tmp();
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

describe('TimelineService', () => {
  it('returns parsed events for an existing transcript', async () => {
    const dir = tmp();
    const path = join(dir, 't.jsonl');
    writeFileSync(
      path,
      [
        JSON.stringify({ type: 'system', subtype: 'turn_duration', durationMs: 10 }),
        JSON.stringify({ type: 'pr-link', prNumber: 1, prUrl: 'https://github.com/x/y/pull/1' }),
      ].join('\n'),
    );
    const svc = new TimelineService({ resolveJsonlPath: async () => path });
    const out = await svc.getTimeline('KAN-1');
    expect(out.events).toHaveLength(2);
    expect(out.events[0].type).toBe('system');
    expect(out.events[1].type).toBe('pr-link');
    expect(out.warnings).toEqual([]);
  });

  it('returns empty + warning when resolver returns null', async () => {
    const svc = new TimelineService({ resolveJsonlPath: async () => null });
    const out = await svc.getTimeline('KAN-1');
    expect(out.events).toEqual([]);
    expect(out.warnings).toEqual(['transcript-missing']);
  });

  it('returns empty + warning when the resolved path does not exist (ENOENT)', async () => {
    const svc = new TimelineService({ resolveJsonlPath: async () => '/no/such/path.jsonl' });
    const out = await svc.getTimeline('KAN-1');
    expect(out.events).toEqual([]);
    expect(out.warnings).toEqual(['transcript-missing']);
  });

  it('skips malformed JSON lines silently', async () => {
    const dir = tmp();
    const path = join(dir, 't.jsonl');
    writeFileSync(
      path,
      [
        JSON.stringify({ type: 'system', subtype: 'turn_duration', durationMs: 10 }),
        'not-json',
        JSON.stringify({ type: 'pr-link', prNumber: 1, prUrl: 'https://github.com/x/y/pull/1' }),
        '',
      ].join('\n'),
    );
    const svc = new TimelineService({ resolveJsonlPath: async () => path });
    const out = await svc.getTimeline('KAN-1');
    expect(out.events).toHaveLength(2);
    expect(out.warnings).toEqual([]);
  });
});

describe('TimelineService — CREW-201 startup phase rows', () => {
  it('returns startup phase rows ahead of transcript events when both exist', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('startup_events')
        .values([
          {
            agent_key: 'KAN-1',
            subtype: 'crew_startup_npm_install',
            status: 'started',
            ts: 1000,
            summary: 'npm ci begun',
            duration_ms: null,
            log_path: null,
          },
          {
            agent_key: 'KAN-1',
            subtype: 'crew_startup_npm_install',
            status: 'completed',
            ts: 2000,
            summary: 'installed 152 packages',
            duration_ms: 1000,
            log_path: null,
          },
        ])
        .execute();

      const dir = tmp();
      const path = join(dir, 't.jsonl');
      writeFileSync(
        path,
        JSON.stringify({ type: 'system', subtype: 'turn_duration', durationMs: 10 }) + '\n',
      );

      const svc = new TimelineService({ resolveJsonlPath: async () => path, db });
      const out = await svc.getTimeline('KAN-1');
      expect(out.events).toHaveLength(2);
      expect(out.events[0]).toMatchObject({
        type: 'system',
        subtype: 'crew_startup_npm_install',
        status: 'completed',
        summary: 'installed 152 packages',
      });
      expect(out.events[1]).toMatchObject({ type: 'system', subtype: 'turn_duration' });
    } finally {
      await db.destroy();
    }
  });

  it('reports in_flight when only a started event has arrived', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('startup_events')
        .values({
          agent_key: 'KAN-1',
          subtype: 'crew_startup_docker',
          status: 'started',
          ts: 1000,
          summary: 'docker compose up begun',
          duration_ms: null,
          log_path: null,
        })
        .execute();

      const svc = new TimelineService({ resolveJsonlPath: async () => null, db });
      const out = await svc.getTimeline('KAN-1');
      expect(out.events).toHaveLength(1);
      expect(out.events[0]).toMatchObject({
        type: 'system',
        subtype: 'crew_startup_docker',
        status: 'in_flight',
        summary: 'docker compose up begun',
      });
      // Even though transcript is missing, startup rows suppress the warning.
      expect(out.warnings).toEqual([]);
    } finally {
      await db.destroy();
    }
  });

  it('returns transcript-missing warning when no startup events AND no transcript', async () => {
    const db = await freshDb();
    try {
      const svc = new TimelineService({ resolveJsonlPath: async () => null, db });
      const out = await svc.getTimeline('NOPE-99');
      expect(out.events).toEqual([]);
      expect(out.warnings).toEqual(['transcript-missing']);
    } finally {
      await db.destroy();
    }
  });

  it('returns transcript-only when no db is wired (old call sites stay working)', async () => {
    const dir = tmp();
    const path = join(dir, 't.jsonl');
    writeFileSync(
      path,
      JSON.stringify({ type: 'system', subtype: 'turn_duration', durationMs: 10 }) + '\n',
    );
    const svc = new TimelineService({ resolveJsonlPath: async () => path });
    const out = await svc.getTimeline('KAN-1');
    expect(out.events).toHaveLength(1);
    expect(out.events[0]).toMatchObject({ type: 'system', subtype: 'turn_duration' });
  });
});

describe('TimelineService — CREW-313 failed-start merge', () => {
  async function ensureAgent(db: Kysely<DaemonDatabase>): Promise<void> {
    await db
      .insertInto('agents')
      .values({
        key: 'KAN-1',
        project_name: 'crew',
        ticket_title: null,
        worktree_path: '/wt',
        branch: 'KAN-1',
        pr_url: null,
        app_url: null,
        created_at: '2026-07-02T17:43:00.000Z',
      })
      .onConflict((oc) => oc.column('key').doNothing())
      .execute();
  }

  async function insertFailedStart(
    db: Kysely<DaemonDatabase>,
    overrides: Partial<{
      check: string;
      headline: string;
      remediation: string;
      output: string;
      startedAt: string;
      completedAt: string;
    }> = {},
  ): Promise<void> {
    await ensureAgent(db);
    await db
      .insertInto('runs')
      .values({
        agent_key: 'KAN-1',
        command: 'run',
        session_id: `failed-start:${Math.random()}`,
        started_at: overrides.startedAt ?? '2026-07-02T17:44:00.000Z',
        completed_at: overrides.completedAt ?? '2026-07-02T17:44:01.000Z',
        exit_code: 1,
        status: 'failed-start',
        failure_check: overrides.check ?? 'excluded-commands',
        failure_headline: overrides.headline ?? 'Missing excludedCommands entries',
        failure_remediation: overrides.remediation ?? 'Run `crew doctor --fix`',
        failure_output: overrides.output ?? 'excluded-commands FAIL\n  missing: npm run bruno:smoke*',
      })
      .execute();
  }

  it('appends a synthetic crew_failed_start event when a failed-start row exists (no transcript)', async () => {
    const db = await freshDb();
    try {
      await insertFailedStart(db);
      const svc = new TimelineService({ resolveJsonlPath: async () => null, db });
      const out = await svc.getTimeline('KAN-1');
      expect(out.events).toHaveLength(1);
      expect(out.events[0]).toMatchObject({
        type: 'system',
        subtype: 'crew_failed_start',
        check: 'excluded-commands',
        headline: 'Missing excludedCommands entries',
        remediation: 'Run `crew doctor --fix`',
      });
      expect((out.events[0] as { output: string }).output).toContain('npm run bruno:smoke*');
      // The failure row is itself the timeline signal — no missing warning.
      expect(out.warnings).toEqual([]);
    } finally {
      await db.destroy();
    }
  });

  it('appends the synthetic event AFTER transcript + startup rows', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('startup_events')
        .values({
          agent_key: 'KAN-1',
          subtype: 'crew_startup_worktree',
          status: 'completed',
          ts: 1000,
          summary: 'worktree ready',
          duration_ms: 10,
          log_path: null,
        })
        .execute();
      await insertFailedStart(db);
      const dir = tmp();
      const path = join(dir, 't.jsonl');
      writeFileSync(
        path,
        JSON.stringify({ type: 'system', subtype: 'turn_duration', durationMs: 10 }) + '\n',
      );

      const svc = new TimelineService({ resolveJsonlPath: async () => path, db });
      const out = await svc.getTimeline('KAN-1');
      expect(out.events).toHaveLength(3);
      expect(out.events[0]).toMatchObject({ subtype: 'crew_startup_worktree' });
      expect(out.events[1]).toMatchObject({ subtype: 'turn_duration' });
      expect(out.events[2]).toMatchObject({ subtype: 'crew_failed_start' });
    } finally {
      await db.destroy();
    }
  });

  it('uses the latest failed-start row when several exist', async () => {
    const db = await freshDb();
    try {
      await insertFailedStart(db, { check: 'app-url-resolves', headline: 'old failure' });
      await insertFailedStart(db, { check: 'excluded-commands', headline: 'newest failure' });
      const svc = new TimelineService({ resolveJsonlPath: async () => null, db });
      const out = await svc.getTimeline('KAN-1');
      const failedStart = out.events.filter(
        (e) => (e as { subtype?: string }).subtype === 'crew_failed_start',
      );
      expect(failedStart).toHaveLength(1);
      expect(failedStart[0]).toMatchObject({ check: 'excluded-commands', headline: 'newest failure' });
    } finally {
      await db.destroy();
    }
  });

  it('does not synthesize an event for a bare launching row (no failure fields)', async () => {
    const db = await freshDb();
    try {
      await ensureAgent(db);
      await db
        .insertInto('runs')
        .values({
          agent_key: 'KAN-1',
          command: 'run',
          session_id: 'launching:KAN-1',
          started_at: '2026-07-02T17:44:00.000Z',
          completed_at: null,
          exit_code: null,
          status: 'launching',
        })
        .execute();
      const svc = new TimelineService({ resolveJsonlPath: async () => null, db });
      const out = await svc.getTimeline('KAN-1');
      expect(out.events).toEqual([]);
      expect(out.warnings).toEqual(['transcript-missing']);
    } finally {
      await db.destroy();
    }
  });
});
