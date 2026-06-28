import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Kysely } from 'kysely';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { RunnerPageService } from './RunnerPageService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

interface Harness {
  db: Kysely<DaemonDatabase>;
  service: RunnerPageService;
}

async function setup(): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), 'crew-runner-page-svc-'));
  tmpdirs.push(dir);
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return { db, service: new RunnerPageService({ db }) };
}

async function insertAgent(
  db: Kysely<DaemonDatabase>,
  key: string,
  project: string,
  prUrl: string | null = null,
): Promise<void> {
  await db
    .insertInto('agents')
    .values({
      key,
      project_name: project,
      ticket_title: null,
      worktree_path: `/tmp/${key}`,
      branch: key,
      pr_url: prUrl,
      app_url: null,
      created_at: '2026-06-25T00:00:00.000Z',
    })
    .execute();
}

const failure = {
  check: 'git-remote',
  headline: 'No git remote configured',
  remediation: 'Add an origin remote and retry.',
  output: '✗ preflight: No git remote configured',
};

describe('RunnerPageService.getPage', () => {
  it('returns failed-start, queued, and recently-ended from the db', async () => {
    const { db, service } = await setup();

    // Failed-start (unacknowledged) — surfaces in failedToStart + recentlyEnded.
    await insertAgent(db, 'CREW-A', 'crew');
    await db
      .insertInto('runs')
      .values({
        agent_key: 'CREW-A',
        command: 'run',
        session_id: 'failed-start:CREW-A',
        started_at: '2026-06-25T00:00:00.000Z',
        completed_at: '2026-06-25T00:01:00.000Z',
        exit_code: 1,
        status: 'failed-start',
        acknowledged: 0,
        failure_check: failure.check,
        failure_headline: failure.headline,
        failure_remediation: failure.remediation,
        failure_output: failure.output,
      })
      .execute();

    // Pending action request — surfaces in queued.
    await db
      .insertInto('action_requests')
      .values({
        kind: 'fix_pr',
        ticket_key: 'CREW-B',
        project: 'crew',
        payload: '{"kind":"fix_pr","comment":"x"}',
        status: 'pending',
        error: null,
        created_at: '2026-06-25T00:02:00.000Z',
        updated_at: '2026-06-25T00:02:00.000Z',
      })
      .execute();

    // Cleanly finished run with a PR — surfaces in recentlyEnded.
    await insertAgent(db, 'CREW-C', 'crew', 'https://github.com/Safturento/crew/pull/340');
    await db
      .insertInto('runs')
      .values({
        agent_key: 'CREW-C',
        command: 'finish',
        session_id: 'sess-CREW-C',
        started_at: '2026-06-25T00:00:00.000Z',
        completed_at: '2026-06-25T00:05:00.000Z',
        exit_code: 0,
      })
      .execute();

    const page = await service.getPage();

    expect(page.failedToStart.map((r) => r.key)).toContain('CREW-A');
    const failed = page.failedToStart.find((r) => r.key === 'CREW-A')!;
    expect(failed.project).toBe('crew');
    expect(failed.command).toBe('run');
    expect(failed.failure).toEqual(failure);

    expect(page.queued.map((q) => q.key)).toContain('CREW-B');
    const queued = page.queued.find((q) => q.key === 'CREW-B')!;
    expect(queued.command).toBe('fix-pr'); // ActionKind 'fix_pr' → RunnerCommandName 'fix-pr'

    expect(page.recentlyEnded.map((r) => r.key)).toContain('CREW-C');
    const ended = page.recentlyEnded.find((r) => r.key === 'CREW-C')!;
    expect(ended.kind).toBe('finished');
    expect(ended.prUrl).toBe('https://github.com/Safturento/crew/pull/340');
    expect(ended.prNumber).toBe(340);

    // The failed-start row is also terminal history.
    const endedFailed = page.recentlyEnded.find((r) => r.key === 'CREW-A')!;
    expect(endedFailed.kind).toBe('failed-start');
    expect(endedFailed.failure).toEqual(failure);
  });

  it('excludes acknowledged failed-starts and in-flight runs from failedToStart', async () => {
    const { db, service } = await setup();

    await insertAgent(db, 'CREW-ACK', 'crew');
    await db
      .insertInto('runs')
      .values({
        agent_key: 'CREW-ACK',
        command: 'run',
        session_id: 'fs-ack',
        started_at: '2026-06-25T00:00:00.000Z',
        completed_at: '2026-06-25T00:01:00.000Z',
        exit_code: 1,
        status: 'failed-start',
        acknowledged: 1,
        failure_check: failure.check,
        failure_headline: failure.headline,
        failure_remediation: failure.remediation,
        failure_output: failure.output,
      })
      .execute();

    // A launching row (no completed_at) must not appear anywhere terminal.
    await insertAgent(db, 'CREW-LAUNCH', 'crew');
    await db
      .insertInto('runs')
      .values({
        agent_key: 'CREW-LAUNCH',
        command: 'run',
        session_id: 'launching:CREW-LAUNCH',
        started_at: '2026-06-25T00:00:00.000Z',
        completed_at: null,
        exit_code: null,
        status: 'launching',
      })
      .execute();

    const page = await service.getPage();
    expect(page.failedToStart).toEqual([]);
    expect(page.recentlyEnded.map((r) => r.key)).not.toContain('CREW-LAUNCH');
  });

  it('classifies a non-zero exit as an error and a null exit as cancelled', async () => {
    const { db, service } = await setup();
    await insertAgent(db, 'CREW-ERR', 'crew');
    await insertAgent(db, 'CREW-CAN', 'crew');
    await db
      .insertInto('runs')
      .values([
        {
          agent_key: 'CREW-ERR',
          command: 'run',
          session_id: 'sess-err',
          started_at: '2026-06-25T00:00:00.000Z',
          completed_at: '2026-06-25T00:03:00.000Z',
          exit_code: 2,
        },
        {
          agent_key: 'CREW-CAN',
          command: 'run',
          session_id: 'sess-can',
          started_at: '2026-06-25T00:00:00.000Z',
          completed_at: '2026-06-25T00:04:00.000Z',
          exit_code: null,
        },
      ])
      .execute();

    const page = await service.getPage();
    expect(page.recentlyEnded.find((r) => r.key === 'CREW-ERR')!.kind).toBe('error');
    expect(page.recentlyEnded.find((r) => r.key === 'CREW-CAN')!.kind).toBe('cancelled');
  });
});
