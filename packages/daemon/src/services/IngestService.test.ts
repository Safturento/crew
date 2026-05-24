import { describe, it, expect, vi } from 'vitest';
import { writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { pino, type Logger } from 'pino';
import type { Kysely } from 'kysely';
import type { TranscriptEvent } from 'crew-shared';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { useTmpDir } from '../test/tmpdir.js';
import { EventBus, type SseEvent } from './EventBus.js';
import { IngestService } from './IngestService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmp = useTmpDir('crew-ingest-');
const silentLogger: Logger = pino({ level: 'silent' });

interface SetupResult {
  db: Kysely<DaemonDatabase>;
  worktree: string;
  agentKey: string;
  runId: number;
  sessionId: string;
}

async function setup(): Promise<SetupResult> {
  const configDir = tmp();
  const homeDir = tmp();

  const db = createDb(join(configDir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);

  const worktree = join(homeDir, 'Repos', 'Demo-KAN-1');
  const agentKey = 'KAN-1';
  const sessionId = 'session-abc';

  await db
    .insertInto('agents')
    .values({
      key: agentKey,
      project_name: 'demo',
      ticket_title: 'Demo ticket',
      worktree_path: worktree,
      branch: 'KAN-1',
      pr_url: null,
      created_at: new Date().toISOString(),
    })
    .execute();
  const insertedRun = await db
    .insertInto('runs')
    .values({
      agent_key: agentKey,
      command: 'run',
      session_id: sessionId,
      started_at: new Date().toISOString(),
      completed_at: null,
      exit_code: null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return { db, worktree, agentKey, runId: insertedRun.id, sessionId };
}

describe('IngestService.ingestEvent', () => {
  it('inserts a tool_calls row for an assistant message with a tool_use block', async () => {
    const { db, runId } = await setup();
    try {
      const svc = new IngestService({ db, logger: silentLogger, eventBus: new EventBus() });
      await svc.ingestEvent(runId, {
        type: 'assistant',
        timestamp: '2026-04-29T12:00:00Z',
        message: {
          id: 'm1',
          model: 'claude-opus-4-7',
          role: 'assistant',
          content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls -la' } }],
          usage: {
            input_tokens: 100,
            cache_creation_input_tokens: 50,
            cache_read_input_tokens: 25,
            output_tokens: 75,
          },
        },
      });
      const rows = await db.selectFrom('tool_calls').selectAll().execute();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        run_id: runId,
        tool_name: 'Bash',
        output_tokens: 75,
        input_tokens: 100,
        cache_read_tokens: 25,
        cache_creation_tokens: 50,
        occurred_at: '2026-04-29T12:00:00Z',
      });
      expect(rows[0]?.input_summary).toContain('ls -la');
    } finally {
      await db.destroy();
    }
  });

  it('skips assistant messages without a tool_use block', async () => {
    const { db, runId } = await setup();
    try {
      const svc = new IngestService({ db, logger: silentLogger, eventBus: new EventBus() });
      await svc.ingestEvent(runId, {
        type: 'assistant',
        timestamp: '2026-04-29T12:00:00Z',
        message: {
          id: 'm2',
          model: 'claude-opus-4-7',
          role: 'assistant',
          content: [{ type: 'text', text: 'hello' }],
          usage: {
            input_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            output_tokens: 0,
          },
        },
      });
      expect(await db.selectFrom('tool_calls').selectAll().execute()).toHaveLength(0);
    } finally {
      await db.destroy();
    }
  });

  it('skips non-assistant event types', async () => {
    const { db, runId } = await setup();
    try {
      const svc = new IngestService({ db, logger: silentLogger, eventBus: new EventBus() });
      await svc.ingestEvent(runId, {
        type: 'user',
        timestamp: '2026-04-29T12:00:00Z',
        message: { role: 'user', content: [] },
      });
      expect(await db.selectFrom('tool_calls').selectAll().execute()).toHaveLength(0);
    } finally {
      await db.destroy();
    }
  });

  it('idempotently swallows duplicate events (same run_id + occurred_at + tool_name)', async () => {
    const { db, runId } = await setup();
    try {
      const svc = new IngestService({ db, logger: silentLogger, eventBus: new EventBus() });
      const event = {
        type: 'assistant' as const,
        timestamp: '2026-04-29T12:00:00Z',
        message: {
          id: 'm1',
          model: 'claude-opus-4-7',
          role: 'assistant' as const,
          content: [
            { type: 'tool_use' as const, id: 't1', name: 'Bash', input: { command: 'ls' } },
          ],
          usage: {
            input_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            output_tokens: 0,
          },
        },
      };
      await svc.ingestEvent(runId, event);
      await svc.ingestEvent(runId, event); // duplicate
      const rows = await db.selectFrom('tool_calls').selectAll().execute();
      expect(rows).toHaveLength(1);
    } finally {
      await db.destroy();
    }
  });
});

describe('IngestService.attach + detach', () => {
  it('tails a JSONL file and ingests events written after attach', async () => {
    const { db, runId, sessionId } = await setup();
    try {
      const svc = new IngestService({ db, logger: silentLogger, eventBus: new EventBus() });
      const customDir = tmp();
      const jsonlPath = join(customDir, `${sessionId}.jsonl`);
      writeFileSync(jsonlPath, ''); // touch the file so the tail sees it

      svc.attach({ runId, jsonlPath });

      const event = (idx: number): string =>
        JSON.stringify({
          type: 'assistant',
          timestamp: `2026-04-29T12:00:0${idx}Z`,
          message: {
            id: `m${idx}`,
            model: 'claude-opus-4-7',
            role: 'assistant',
            content: [
              { type: 'tool_use', id: `t${idx}`, name: 'Read', input: { file_path: `/x/${idx}` } },
            ],
            usage: {
              input_tokens: 0,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
              output_tokens: 1,
            },
          },
        }) + '\n';

      appendFileSync(jsonlPath, event(1));
      appendFileSync(jsonlPath, event(2));
      // Wait long enough for the 200ms tail poll + a margin
      await delay(800);
      const rowsAfterTwo = await db.selectFrom('tool_calls').selectAll().execute();
      expect(rowsAfterTwo).toHaveLength(2);

      svc.detach(runId);
      // Tail's contract guarantees one final drain pass after abort; allow a beat for it.
      await delay(400);
      appendFileSync(jsonlPath, event(3));
      await delay(800);
      const rowsAfterDetach = await db.selectFrom('tool_calls').selectAll().execute();
      expect(rowsAfterDetach).toHaveLength(2); // event(3) NOT ingested
    } finally {
      await db.destroy();
    }
  }, 10_000);
});

describe('IngestService.start (recovery)', () => {
  it('attaches tails to all open runs at start', async () => {
    const { db, runId, sessionId } = await setup();
    try {
      const customDir = tmp();
      const jsonlPath = join(customDir, `${sessionId}.jsonl`);
      writeFileSync(jsonlPath, '');

      const svc = new IngestService({ db, logger: silentLogger, eventBus: new EventBus() });
      // Spy on attach to verify it's called for the open run
      const attachSpy = vi.spyOn(svc, 'attach');
      // start() reads runs WHERE completed_at IS NULL; we override the path
      // resolver so the test does not depend on real ~/.claude/projects layout.
      await svc.start({ resolveJsonlPath: () => jsonlPath });
      expect(attachSpy).toHaveBeenCalledWith(expect.objectContaining({ runId, jsonlPath }));
      await svc.stop();
    } finally {
      await db.destroy();
    }
  });

  it('does not attach for completed runs', async () => {
    const { db, runId } = await setup();
    try {
      await db
        .updateTable('runs')
        .set({ completed_at: new Date().toISOString(), exit_code: 0 })
        .where('id', '=', runId)
        .execute();
      const svc = new IngestService({ db, logger: silentLogger, eventBus: new EventBus() });
      const attachSpy = vi.spyOn(svc, 'attach');
      await svc.start({ resolveJsonlPath: () => '/dev/null' });
      expect(attachSpy).not.toHaveBeenCalled();
      await svc.stop();
    } finally {
      await db.destroy();
    }
  });
});

describe('IngestService.detach', () => {
  it('is a no-op for an unknown runId', async () => {
    const { db } = await setup();
    try {
      const svc = new IngestService({ db, logger: silentLogger, eventBus: new EventBus() });
      expect(() => svc.detach(99999)).not.toThrow();
    } finally {
      await db.destroy();
    }
  });
});

// ─── Slice 1c fixtures + helpers ───
//
// Plan tasks 11/12/13 (CREW-100) introduce three things that hang off an
// `assistant` tool_use / `user` tool_result pair: a derived state flip, a
// tool_calls.changed ping, and PR URL extraction. These helpers build the
// minimal events those paths need without having to spell out the full
// schema each time.

interface BashToolUseInput {
  id: string;
  command: string;
  ts?: string;
}

function makeBashToolUse(input: BashToolUseInput): TranscriptEvent {
  return {
    type: 'assistant',
    timestamp: input.ts ?? '2026-04-29T12:00:00Z',
    message: {
      id: `m-${input.id}`,
      role: 'assistant',
      model: 'claude-opus-4-7',
      content: [
        { type: 'tool_use', id: input.id, name: 'Bash', input: { command: input.command } },
      ],
      usage: {
        input_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 0,
      },
    },
  };
}

interface ToolResultInput {
  tool_use_id: string;
  content: string;
  ts?: string;
}

function makeToolResult(input: ToolResultInput): TranscriptEvent {
  return {
    type: 'user',
    timestamp: input.ts ?? '2026-04-29T12:00:01Z',
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: input.tool_use_id,
          content: input.content,
        },
      ],
    },
  };
}

describe('IngestService.processEventForTest — state_transitions + agent.state_changed', () => {
  it('writes state_transitions row + publishes agent.state_changed on each derived flip', async () => {
    const { db, runId, agentKey } = await setup();
    try {
      const bus = new EventBus({ bufferSize: 10 });
      const seen: SseEvent[] = [];
      bus.subscribe({ onEvent: (e) => seen.push(e) });
      const svc = new IngestService({ db, logger: silentLogger, eventBus: bus });

      await svc.processEventForTest({
        runId,
        agentKey,
        event: makeBashToolUse({
          id: 'tu_read',
          command: 'ls -la',
          ts: '2026-04-29T12:00:00Z',
        }),
      });
      await svc.processEventForTest({
        runId,
        agentKey,
        event: makeBashToolUse({
          id: 'tu_pr',
          command: 'gh pr create --title hi',
          ts: '2026-04-29T12:00:01Z',
        }),
      });

      const rows = await db
        .selectFrom('state_transitions')
        .selectAll()
        .orderBy('id', 'asc')
        .execute();
      expect(rows.map((r) => r.to_state)).toEqual(['running', 'pr_open']);
      expect(rows.map((r) => r.from_state)).toEqual(['init', 'running']);
      expect(seen.filter((e) => e.type === 'agent.state_changed')).toHaveLength(2);
    } finally {
      await db.destroy();
    }
  });

  it('does not publish or insert when derived state is unchanged', async () => {
    const { db, runId, agentKey } = await setup();
    try {
      const bus = new EventBus({ bufferSize: 10 });
      const seen: SseEvent[] = [];
      bus.subscribe({ onEvent: (e) => seen.push(e) });
      const svc = new IngestService({ db, logger: silentLogger, eventBus: bus });

      await svc.processEventForTest({
        runId,
        agentKey,
        event: makeBashToolUse({ id: 'tu_1', command: 'ls', ts: '2026-04-29T12:00:00Z' }),
      });
      await svc.processEventForTest({
        runId,
        agentKey,
        event: makeBashToolUse({ id: 'tu_2', command: 'pwd', ts: '2026-04-29T12:00:02Z' }),
      });

      const rows = await db.selectFrom('state_transitions').selectAll().execute();
      expect(rows.map((r) => r.to_state)).toEqual(['running']);
      expect(seen.filter((e) => e.type === 'agent.state_changed')).toHaveLength(1);
    } finally {
      await db.destroy();
    }
  });
});

describe('IngestService.processEventForTest — fix-pr cycle (CREW-198)', () => {
  it('fires pr_open → running when a new run starts producing tool_calls', async () => {
    const { db, runId: firstRunId, agentKey } = await setup();
    try {
      const svc = new IngestService({ db, logger: silentLogger, eventBus: new EventBus() });

      // Original run: ends with gh pr create → pr_open.
      await svc.processEventForTest({
        runId: firstRunId,
        agentKey,
        event: makeBashToolUse({
          id: 'tu_pr',
          command: 'gh pr create --title hi',
          ts: '2026-04-29T12:00:00Z',
        }),
      });
      expect((await getLatestState(db, agentKey))).toBe('pr_open');

      // Fix-pr dispatch creates a new run. First tool_call from the new run → pr_open → running.
      const fixPrRunId = await insertRun(db, agentKey, 'fix-pr', 'session-fix-pr-1');
      await svc.processEventForTest({
        runId: fixPrRunId,
        agentKey,
        event: makeBashToolUse({
          id: 'tu_fp_1',
          command: 'ls',
          ts: '2026-04-29T12:01:00Z',
        }),
      });
      expect(await getLatestState(db, agentKey)).toBe('running');

      const rows = await db
        .selectFrom('state_transitions')
        .selectAll()
        .orderBy('id', 'asc')
        .execute();
      expect(rows.map((r) => `${r.from_state}->${r.to_state}`)).toEqual([
        'init->pr_open',
        'pr_open->running',
      ]);
    } finally {
      await db.destroy();
    }
  });

  it('does NOT transition pr_open → running on continued activity within the same run', async () => {
    const { db, runId, agentKey } = await setup();
    try {
      const svc = new IngestService({ db, logger: silentLogger, eventBus: new EventBus() });

      await svc.processEventForTest({
        runId,
        agentKey,
        event: makeBashToolUse({
          id: 'tu_pr',
          command: 'gh pr create --title hi',
          ts: '2026-04-29T12:00:00Z',
        }),
      });
      // Within the same run, after pr_open, additional tool_calls don't transition.
      await svc.processEventForTest({
        runId,
        agentKey,
        event: makeBashToolUse({ id: 'tu_2', command: 'ls', ts: '2026-04-29T12:00:01Z' }),
      });
      expect(await getLatestState(db, agentKey)).toBe('pr_open');
    } finally {
      await db.destroy();
    }
  });

  it('does NOT spuriously transition on the first-ever tool_call (empty lastRunIdCache)', async () => {
    // Fresh agent never observed before — first tool_call from the only-ever
    // run should fall through the running-state logic, not falsely trigger
    // pr_open → running.
    const { db, runId, agentKey } = await setup();
    try {
      const svc = new IngestService({ db, logger: silentLogger, eventBus: new EventBus() });
      await svc.processEventForTest({
        runId,
        agentKey,
        event: makeBashToolUse({ id: 'tu_1', command: 'ls', ts: '2026-04-29T12:00:00Z' }),
      });
      expect(await getLatestState(db, agentKey)).toBe('running');
    } finally {
      await db.destroy();
    }
  });
});

async function getLatestState(
  db: Kysely<DaemonDatabase>,
  agentKey: string,
): Promise<string | null> {
  const row = await db
    .selectFrom('state_transitions')
    .select('to_state')
    .where('agent_key', '=', agentKey)
    .orderBy('id', 'desc')
    .executeTakeFirst();
  return row?.to_state ?? null;
}

async function insertRun(
  db: Kysely<DaemonDatabase>,
  agentKey: string,
  command: 'run' | 'fix-pr' | 'finish',
  sessionId: string,
): Promise<number> {
  const inserted = await db
    .insertInto('runs')
    .values({
      agent_key: agentKey,
      command,
      session_id: sessionId,
      started_at: new Date().toISOString(),
      completed_at: null,
      exit_code: null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return inserted.id;
}

describe('IngestService.processEventForTest — tool_calls.changed pings', () => {
  it('publishes tool_calls.changed after each tool_calls insert', async () => {
    const { db, runId, agentKey } = await setup();
    try {
      const bus = new EventBus({ bufferSize: 10 });
      const seen: SseEvent[] = [];
      bus.subscribe({ onEvent: (e) => seen.push(e) });
      const svc = new IngestService({ db, logger: silentLogger, eventBus: bus });

      await svc.processEventForTest({
        runId,
        agentKey,
        event: makeBashToolUse({ id: 'tu_1', command: 'ls', ts: '2026-04-29T12:00:00Z' }),
      });

      const pings = seen.filter(
        (e): e is SseEvent & { type: 'tool_calls.changed' } => e.type === 'tool_calls.changed',
      );
      expect(pings).toHaveLength(1);
      expect(pings[0]?.data.key).toBe(agentKey);
    } finally {
      await db.destroy();
    }
  });

  it('does not publish tool_calls.changed when the insert is a duplicate', async () => {
    const { db, runId, agentKey } = await setup();
    try {
      const bus = new EventBus({ bufferSize: 10 });
      const seen: SseEvent[] = [];
      bus.subscribe({ onEvent: (e) => seen.push(e) });
      const svc = new IngestService({ db, logger: silentLogger, eventBus: bus });

      const event = makeBashToolUse({ id: 'tu_1', command: 'ls', ts: '2026-04-29T12:00:00Z' });
      await svc.processEventForTest({ runId, agentKey, event });
      await svc.processEventForTest({ runId, agentKey, event });

      expect(seen.filter((e) => e.type === 'tool_calls.changed')).toHaveLength(1);
    } finally {
      await db.destroy();
    }
  });
});

describe('IngestService.processEventForTest — PR URL extraction', () => {
  it('writes agents.pr_url when the matching tool_result contains a github PR URL', async () => {
    const { db, runId, agentKey } = await setup();
    try {
      const bus = new EventBus({ bufferSize: 10 });
      const svc = new IngestService({ db, logger: silentLogger, eventBus: bus });

      await svc.processEventForTest({
        runId,
        agentKey,
        event: makeBashToolUse({
          id: 'tu_pr',
          command: 'gh pr create --title hi',
          ts: '2026-04-29T12:00:00Z',
        }),
      });
      await svc.processEventForTest({
        runId,
        agentKey,
        event: makeToolResult({
          tool_use_id: 'tu_pr',
          content: 'Creating pull request for KAN-1...\nhttps://github.com/x/y/pull/42\n',
          ts: '2026-04-29T12:00:01Z',
        }),
      });

      const row = await db
        .selectFrom('agents')
        .where('key', '=', agentKey)
        .selectAll()
        .executeTakeFirst();
      expect(row?.pr_url).toBe('https://github.com/x/y/pull/42');
    } finally {
      await db.destroy();
    }
  });

  it('leaves agents.pr_url NULL when the matching tool_result has no URL', async () => {
    const { db, runId, agentKey } = await setup();
    try {
      const bus = new EventBus({ bufferSize: 10 });
      const svc = new IngestService({ db, logger: silentLogger, eventBus: bus });

      await svc.processEventForTest({
        runId,
        agentKey,
        event: makeBashToolUse({
          id: 'tu_pr',
          command: 'gh pr create',
          ts: '2026-04-29T12:00:00Z',
        }),
      });
      await svc.processEventForTest({
        runId,
        agentKey,
        event: makeToolResult({
          tool_use_id: 'tu_pr',
          content: 'error: not authenticated',
          ts: '2026-04-29T12:00:01Z',
        }),
      });

      const row = await db
        .selectFrom('agents')
        .where('key', '=', agentKey)
        .selectAll()
        .executeTakeFirst();
      expect(row?.pr_url).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  it('ignores tool_results that are not paired with a tracked gh-pr-create tool_use', async () => {
    const { db, runId, agentKey } = await setup();
    try {
      const bus = new EventBus({ bufferSize: 10 });
      const svc = new IngestService({ db, logger: silentLogger, eventBus: bus });

      // No matching tool_use was tracked for `tu_unrelated` — even though the
      // content has a PR URL, we must not write to agents.pr_url.
      await svc.processEventForTest({
        runId,
        agentKey,
        event: makeToolResult({
          tool_use_id: 'tu_unrelated',
          content: 'see https://github.com/x/y/pull/99',
          ts: '2026-04-29T12:00:01Z',
        }),
      });

      const row = await db
        .selectFrom('agents')
        .where('key', '=', agentKey)
        .selectAll()
        .executeTakeFirst();
      expect(row?.pr_url).toBeNull();
    } finally {
      await db.destroy();
    }
  });
});
