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

type StateChanged = Extract<SseEvent, { type: 'agent.state_changed' }>;
const isStateChanged = (e: SseEvent): e is StateChanged => e.type === 'agent.state_changed';

describe('RunFailureService.birthQueued (CREW-307)', () => {
  it('creates the agent row and a queued transition', async () => {
    const { service, db, events } = await setup();
    await service.birthQueued({
      key: 'HA-9',
      projectName: 'home-assistant',
      worktreePath: '/w/home-assistant-HA-9',
      branch: 'HA-9',
    });

    const agent = await db
      .selectFrom('agents')
      .selectAll()
      .where('key', '=', 'HA-9')
      .executeTakeFirstOrThrow();
    expect(agent.project_name).toBe('home-assistant');
    expect(agent.worktree_path).toBe('/w/home-assistant-HA-9');

    const transition = await db
      .selectFrom('state_transitions')
      .selectAll()
      .where('agent_key', '=', 'HA-9')
      .orderBy('ts', 'desc')
      .executeTakeFirstOrThrow();
    expect(transition.to_state).toBe('queued');

    const changed = events.filter(isStateChanged);
    expect(changed).toHaveLength(1);
    expect(changed[0].data).toMatchObject({ key: 'HA-9', to: 'queued' });
  });

  it('is a no-op for an agent already in-flight (does not clobber running → queued)', async () => {
    const { service, db, events } = await setup();
    // Simulate a live run: an agents row + a running transition.
    await db
      .insertInto('agents')
      .values({
        key: 'HA-9',
        project_name: 'home-assistant',
        worktree_path: '/w/home-assistant-HA-9',
        branch: 'HA-9',
        pr_url: null,
        app_url: null,
        created_at: new Date().toISOString(),
      })
      .execute();
    await db
      .insertInto('state_transitions')
      .values({
        agent_key: 'HA-9',
        from_state: 'init',
        to_state: 'running',
        ts: 1,
        source: 'cli-run',
      })
      .execute();

    await service.birthQueued({
      key: 'HA-9',
      projectName: 'home-assistant',
      worktreePath: '/w/home-assistant-HA-9',
      branch: 'HA-9',
    });

    // Still running — no queued transition written, no SSE published.
    expect(await latestTo(db, 'HA-9')).toBe('running');
    expect(events.filter(isStateChanged)).toHaveLength(0);
  });

  it('births queued over a terminal agent (re-run), recording the prior state as `from`', async () => {
    const { service, db } = await setup();
    await db
      .insertInto('agents')
      .values({
        key: 'HA-9',
        project_name: 'home-assistant',
        worktree_path: '/w/home-assistant-HA-9',
        branch: 'HA-9',
        pr_url: null,
        app_url: null,
        created_at: new Date().toISOString(),
      })
      .execute();
    await db
      .insertInto('state_transitions')
      .values({
        agent_key: 'HA-9',
        from_state: null,
        to_state: 'finished',
        ts: 1,
        source: 'cli-finish',
      })
      .execute();

    await service.birthQueued({
      key: 'HA-9',
      projectName: 'home-assistant',
      worktreePath: '/w/home-assistant-HA-9',
      branch: 'HA-9',
    });

    const latest = await db
      .selectFrom('state_transitions')
      .selectAll()
      .where('agent_key', '=', 'HA-9')
      .orderBy('ts', 'desc')
      .orderBy('id', 'desc')
      .executeTakeFirstOrThrow();
    expect(latest.to_state).toBe('queued');
    expect(latest.from_state).toBe('finished');
  });
});

async function latestTo(db: Kysely<DaemonDatabase>, key: string): Promise<string | null> {
  const row = await db
    .selectFrom('state_transitions')
    .select('to_state')
    .where('agent_key', '=', key)
    .orderBy('ts', 'desc')
    .orderBy('id', 'desc')
    .executeTakeFirst();
  return row?.to_state ?? null;
}

describe('RunFailureService.recordInitializing (CREW-307)', () => {
  const input = {
    key: 'HA-3',
    projectName: 'home-assistant',
    worktreePath: '/w/home-assistant-HA-3',
    branch: 'HA-3',
  };

  it('births a fresh agent as init', async () => {
    const { service, db } = await setup();
    await service.recordInitializing(input);
    const agent = await db
      .selectFrom('agents')
      .selectAll()
      .where('key', '=', 'HA-3')
      .executeTakeFirstOrThrow();
    expect(agent.worktree_path).toBe('/w/home-assistant-HA-3');
    expect(await latestTo(db, 'HA-3')).toBe('init');
  });

  it('advances a queued agent to init (dashboard → direct-CLI takeover)', async () => {
    const { service, db } = await setup();
    await service.birthQueued(input);
    expect(await latestTo(db, 'HA-3')).toBe('queued');
    await service.recordInitializing(input);
    expect(await latestTo(db, 'HA-3')).toBe('init');
  });

  it('is idempotent — a second call writes no duplicate init transition', async () => {
    const { service, db } = await setup();
    await service.recordInitializing(input);
    await service.recordInitializing(input);
    const rows = await db
      .selectFrom('state_transitions')
      .selectAll()
      .where('agent_key', '=', 'HA-3')
      .where('to_state', '=', 'init')
      .execute();
    expect(rows).toHaveLength(1);
  });

  it('never regresses a run already past init', async () => {
    const { service, db } = await setup();
    await service.birthQueued(input);
    // Simulate the run having started (a running transition landed).
    await db
      .insertInto('state_transitions')
      .values({
        agent_key: 'HA-3',
        from_state: 'init',
        to_state: 'running',
        ts: Date.now() + 1,
        source: 'cli-run',
      })
      .execute();
    await service.recordInitializing(input);
    expect(await latestTo(db, 'HA-3')).toBe('running');
  });
});

describe('RunFailureService.recordEarlyFailure (CREW-308)', () => {
  const input = {
    key: 'HA-7',
    projectName: 'home-assistant',
    worktreePath: '/w/home-assistant-HA-7',
    branch: 'HA-7',
    phase: 'crew_startup_preflight' as const,
    summary: 'worktree already exists',
  };

  it('transitions a birthed (init) agent to error', async () => {
    const { service, db, events } = await setup();
    // Task 5 births the row as `init` before the gate; the gate death lands here.
    await service.recordInitializing(input);
    expect(await latestTo(db, 'HA-7')).toBe('init');

    await service.recordEarlyFailure(input);

    const latest = await db
      .selectFrom('state_transitions')
      .selectAll()
      .where('agent_key', '=', 'HA-7')
      .orderBy('ts', 'desc')
      .orderBy('id', 'desc')
      .executeTakeFirstOrThrow();
    expect(latest.to_state).toBe('error');
    expect(latest.from_state).toBe('init');
    expect(latest.source).toBe('startup-failure');

    const changed = events.filter(isStateChanged);
    expect(changed.at(-1)?.data).toMatchObject({ key: 'HA-7', to: 'error' });
  });

  it('births a fresh error agent when the birth call was lost (no prior row)', async () => {
    const { service, db } = await setup();
    await service.recordEarlyFailure(input);

    const agent = await db
      .selectFrom('agents')
      .selectAll()
      .where('key', '=', 'HA-7')
      .executeTakeFirstOrThrow();
    expect(agent.project_name).toBe('home-assistant');
    expect(agent.worktree_path).toBe('/w/home-assistant-HA-7');
    expect(await latestTo(db, 'HA-7')).toBe('error');
  });

  it('is idempotent — a second call writes no duplicate error transition', async () => {
    const { service, db } = await setup();
    await service.recordEarlyFailure(input);
    await service.recordEarlyFailure(input);
    const rows = await db
      .selectFrom('state_transitions')
      .selectAll()
      .where('agent_key', '=', 'HA-7')
      .where('to_state', '=', 'error')
      .execute();
    expect(rows).toHaveLength(1);
  });

  it('never regresses a run that already advanced to running', async () => {
    const { service, db } = await setup();
    await service.recordInitializing(input);
    await db
      .insertInto('state_transitions')
      .values({
        agent_key: 'HA-7',
        from_state: 'init',
        to_state: 'running',
        ts: Date.now() + 1,
        source: 'cli-run',
      })
      .execute();
    await service.recordEarlyFailure(input);
    expect(await latestTo(db, 'HA-7')).toBe('running');
  });
});

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
