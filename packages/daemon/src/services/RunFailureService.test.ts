import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Kysely } from 'kysely';
import type { RunFailure } from 'crew-shared';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { EventBus, type SseEvent } from './EventBus.js';
import { RunFailureService } from './RunFailureService.js';

type FailedStart = Extract<SseEvent, { type: 'run.failed_start' }>;
const isFailedStart = (e: SseEvent): e is FailedStart => e.type === 'run.failed_start';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

interface Harness {
  db: Kysely<DaemonDatabase>;
  service: RunFailureService;
  events: SseEvent[];
}

async function setup(): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), 'crew-run-failure-svc-'));
  tmpdirs.push(dir);
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  const eventBus = new EventBus();
  const events: SseEvent[] = [];
  eventBus.subscribe({ onEvent: (e) => events.push(e) });
  const service = new RunFailureService({ db, eventBus });
  return { db, service, events };
}

const failure: RunFailure = {
  check: 'git-remote',
  headline: 'No git remote configured',
  remediation: 'Add an origin remote and retry.',
  output: '✗ preflight: No git remote configured',
};

describe('RunFailureService.recordLaunching', () => {
  it('upserts the agent and inserts a launching run', async () => {
    const { service, db } = await setup();
    const { runId } = await service.recordLaunching({
      key: 'CREW-1',
      projectName: 'crew',
      command: 'run',
      worktreePath: '/tmp/crew-1',
      branch: 'CREW-1',
      startedAt: '2026-06-17T00:00:00.000Z',
    });
    const run = await db
      .selectFrom('runs')
      .selectAll()
      .where('id', '=', runId)
      .executeTakeFirstOrThrow();
    expect(run.status).toBe('launching');
    expect(run.agent_key).toBe('CREW-1');
    expect(run.completed_at).toBeNull();
    const agent = await db
      .selectFrom('agents')
      .selectAll()
      .where('key', '=', 'CREW-1')
      .executeTakeFirstOrThrow();
    expect(agent.worktree_path).toBe('/tmp/crew-1');
  });
});

describe('RunFailureService.recordFailedStart', () => {
  it('converts an existing launching row in place to failed-start', async () => {
    const { service, db, events } = await setup();
    const { runId } = await service.recordLaunching({
      key: 'CREW-2',
      projectName: 'crew',
      command: 'run',
      worktreePath: '/tmp/crew-2',
      branch: 'CREW-2',
      startedAt: '2026-06-17T00:00:00.000Z',
    });
    const result = await service.recordFailedStart({
      key: 'CREW-2',
      projectName: 'crew',
      command: 'run',
      failure,
    });
    // Same row, converted — not a second run.
    expect(result.runId).toBe(runId);
    const runs = await db
      .selectFrom('runs')
      .selectAll()
      .where('agent_key', '=', 'CREW-2')
      .execute();
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('failed-start');
    expect(runs[0].failure_check).toBe('git-remote');
    expect(runs[0].failure_output).toContain('No git remote');
    expect(runs[0].exit_code).toBe(1);
    expect(runs[0].completed_at).not.toBeNull();
    expect(runs[0].acknowledged).toBe(0);
    expect(events.filter(isFailedStart).map((e) => e.data.key)).toContain('CREW-2');
  });

  it('inserts a fresh failed-start row when no launching row exists', async () => {
    const { service, db } = await setup();
    const { runId } = await service.recordFailedStart({
      key: 'CREW-3',
      projectName: 'crew',
      command: 'run',
      worktreePath: '/tmp/crew-3',
      branch: 'CREW-3',
      failure,
    });
    const run = await db
      .selectFrom('runs')
      .selectAll()
      .where('id', '=', runId)
      .executeTakeFirstOrThrow();
    expect(run.status).toBe('failed-start');
    expect(run.failure_headline).toBe('No git remote configured');
    // The agent row exists so the Runner page can name the project/key.
    const agent = await db
      .selectFrom('agents')
      .selectAll()
      .where('key', '=', 'CREW-3')
      .executeTakeFirst();
    expect(agent?.project_name).toBe('crew');
  });
});

describe('RunFailureService.acknowledge', () => {
  it('marks unacknowledged failed-start rows acknowledged', async () => {
    const { service, db, events } = await setup();
    await service.recordFailedStart({
      key: 'CREW-4',
      projectName: 'crew',
      command: 'run',
      worktreePath: '/tmp/crew-4',
      branch: 'CREW-4',
      failure,
    });
    const count = await service.acknowledge('CREW-4');
    expect(count).toBe(1);
    const run = await db
      .selectFrom('runs')
      .selectAll()
      .where('agent_key', '=', 'CREW-4')
      .executeTakeFirstOrThrow();
    expect(run.acknowledged).toBe(1);
    // Acknowledging again is a no-op.
    expect(await service.acknowledge('CREW-4')).toBe(0);
    expect(events.filter(isFailedStart).map((e) => e.data.key)).toContain('CREW-4');
  });
});

describe('RunFailureService.onNewRunRegistered', () => {
  it('auto-acknowledges a prior failed-start and clears the launching placeholder', async () => {
    const { service, db } = await setup();
    // A prior failed-start that should auto-clear.
    await service.recordFailedStart({
      key: 'CREW-5',
      projectName: 'crew',
      command: 'run',
      worktreePath: '/tmp/crew-5',
      branch: 'CREW-5',
      failure,
    });
    // A stale launching placeholder from a separate pre-register.
    await service.recordLaunching({
      key: 'CREW-5',
      projectName: 'crew',
      command: 'run',
      worktreePath: '/tmp/crew-5',
      branch: 'CREW-5',
      startedAt: '2026-06-17T00:00:00.000Z',
    });

    await service.onNewRunRegistered('CREW-5');

    const failedStart = await db
      .selectFrom('runs')
      .selectAll()
      .where('agent_key', '=', 'CREW-5')
      .where('status', '=', 'failed-start')
      .executeTakeFirstOrThrow();
    expect(failedStart.acknowledged).toBe(1);
    const launching = await db
      .selectFrom('runs')
      .selectAll()
      .where('agent_key', '=', 'CREW-5')
      .where('status', '=', 'launching')
      .execute();
    expect(launching).toHaveLength(0);
  });
});

describe('RunFailureService.reapStuckLaunching', () => {
  it('settles a launching row older than the threshold to failed-start', async () => {
    const { service, db, events } = await setup();
    await service.recordLaunching({
      key: 'CREW-6',
      projectName: 'crew',
      command: 'run',
      worktreePath: '/tmp/crew-6',
      branch: 'CREW-6',
      startedAt: '2026-06-17T00:00:00.000Z',
    });
    // now() is 10 minutes after startedAt; threshold is 5 minutes.
    const reaped = await service.reapStuckLaunching({
      olderThanMs: 5 * 60_000,
      now: () => Date.parse('2026-06-17T00:10:00.000Z'),
    });
    expect(reaped).toBe(1);
    const run = await db
      .selectFrom('runs')
      .selectAll()
      .where('agent_key', '=', 'CREW-6')
      .executeTakeFirstOrThrow();
    expect(run.status).toBe('failed-start');
    expect(run.failure_check).toBe('launching-timeout');
    expect(run.exit_code).toBe(1);
    expect(events.filter(isFailedStart).map((e) => e.data.key)).toContain('CREW-6');
  });

  it('leaves a fresh launching row untouched', async () => {
    const { service, db } = await setup();
    await service.recordLaunching({
      key: 'CREW-7',
      projectName: 'crew',
      command: 'run',
      worktreePath: '/tmp/crew-7',
      branch: 'CREW-7',
      startedAt: '2026-06-17T00:09:00.000Z',
    });
    const reaped = await service.reapStuckLaunching({
      olderThanMs: 5 * 60_000,
      now: () => Date.parse('2026-06-17T00:10:00.000Z'),
    });
    expect(reaped).toBe(0);
    const run = await db
      .selectFrom('runs')
      .selectAll()
      .where('agent_key', '=', 'CREW-7')
      .executeTakeFirstOrThrow();
    expect(run.status).toBe('launching');
  });
});
