import { describe, it, expect, vi } from 'vitest';
import { writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { pino, type Logger } from 'pino';
import type { Kysely } from 'kysely';
import { summarizeInput, type TranscriptEvent } from 'crew-shared';
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

  it('detects pr_open + captures pr_url when gh pr create trails a long heredoc body (past the summary window)', async () => {
    const { db, runId, agentKey } = await setup();
    try {
      const bus = new EventBus({ bufferSize: 10 });
      const svc = new IngestService({ db, logger: silentLogger, eventBus: bus });

      // Real-world shape (CREW-237/CREW-241): write the PR body to a file via a
      // heredoc, THEN call gh pr create --body-file. The `gh pr create` line
      // lands far past the 140-char Bash input summary, so detecting off the
      // summary misses it — detection must run against the raw command.
      const longBody = 'x'.repeat(300);
      const command = `cat > body.md <<'EOF'\n## Summary\n${longBody}\nEOF\ngh pr create --base main --head FOO --body-file body.md`;
      expect(summarizeInput('Bash', { command })).not.toContain('gh pr create');

      await svc.processEventForTest({
        runId,
        agentKey,
        event: makeBashToolUse({ id: 'tu_pr', command, ts: '2026-04-29T12:00:00Z' }),
      });
      await svc.processEventForTest({
        runId,
        agentKey,
        event: makeToolResult({
          tool_use_id: 'tu_pr',
          content: 'Creating pull request...\nhttps://github.com/x/y/pull/99\n',
          ts: '2026-04-29T12:00:01Z',
        }),
      });

      expect(await getLatestState(db, agentKey)).toBe('pr_open');
      const row = await db
        .selectFrom('agents')
        .where('key', '=', agentKey)
        .select('pr_url')
        .executeTakeFirst();
      expect(row?.pr_url).toBe('https://github.com/x/y/pull/99');
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
      expect(await getLatestState(db, agentKey)).toBe('pr_open');

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

  it('recordRunCompleted fires running → pr_open + publishes for fix-pr runs', async () => {
    const { db, runId: originalRunId, agentKey } = await setup();
    try {
      const bus = new EventBus({ bufferSize: 10 });
      const seen: SseEvent[] = [];
      bus.subscribe({ onEvent: (e) => seen.push(e) });
      const svc = new IngestService({ db, logger: silentLogger, eventBus: bus });

      // Bring the agent up to pr_open from the original run, then trigger the
      // fix-pr cycle's first half (pr_open → running).
      await svc.processEventForTest({
        runId: originalRunId,
        agentKey,
        event: makeBashToolUse({
          id: 'tu_pr',
          command: 'gh pr create --title hi',
          ts: '2026-04-29T12:00:00Z',
        }),
      });
      const fixPrRunId = await insertRun(db, agentKey, 'fix-pr', 'session-fix-pr-2');
      await svc.processEventForTest({
        runId: fixPrRunId,
        agentKey,
        event: makeBashToolUse({ id: 'tu_fp', command: 'ls', ts: '2026-04-29T12:01:00Z' }),
      });
      expect(await getLatestState(db, agentKey)).toBe('running');

      seen.length = 0;
      await svc.recordRunCompleted(agentKey, fixPrRunId, '2026-04-29T12:02:00Z');

      expect(await getLatestState(db, agentKey)).toBe('pr_open');
      const transitions = seen.filter((e) => e.type === 'agent.state_changed');
      expect(transitions).toHaveLength(1);
      expect(transitions[0]).toMatchObject({
        type: 'agent.state_changed',
        data: { key: agentKey, from: 'running', to: 'pr_open' },
      });
    } finally {
      await db.destroy();
    }
  });

  it('recordRunCompleted is a no-op for non-fix-pr runs', async () => {
    // A regular `run` command completing shouldn't push a `running` agent to
    // pr_open — only fix-pr runs trigger the cycle-back transition.
    const { db, runId, agentKey } = await setup();
    try {
      const svc = new IngestService({ db, logger: silentLogger, eventBus: new EventBus() });
      await svc.processEventForTest({
        runId,
        agentKey,
        event: makeBashToolUse({ id: 'tu_1', command: 'ls', ts: '2026-04-29T12:00:00Z' }),
      });
      expect(await getLatestState(db, agentKey)).toBe('running');

      await svc.recordRunCompleted(agentKey, runId, '2026-04-29T12:01:00Z');
      // Still running — the `run` command's completion does not cycle.
      expect(await getLatestState(db, agentKey)).toBe('running');
    } finally {
      await db.destroy();
    }
  });

  it('primes lastRunIdCache from latest tool_call on agent attach so daemon restart mid-fix-pr still detects the cycle', async () => {
    // Daemon restart scenario: agent in pr_open from the original run, then a
    // fix-pr run starts. The first tool_call AFTER the restart should still
    // trigger pr_open → running because the cache was primed from the latest
    // tool_call's run_id on the original run.
    const { db, runId: originalRunId, agentKey, sessionId } = await setup();
    try {
      // Original run wrote a tool_call + reached pr_open.
      const svcA = new IngestService({ db, logger: silentLogger, eventBus: new EventBus() });
      await svcA.processEventForTest({
        runId: originalRunId,
        agentKey,
        event: makeBashToolUse({
          id: 'tu_pr',
          command: 'gh pr create --title hi',
          ts: '2026-04-29T12:00:00Z',
        }),
      });
      expect(await getLatestState(db, agentKey)).toBe('pr_open');

      // Simulate daemon restart: brand-new IngestService instance with an
      // empty in-memory cache, then attach prior to seeing any events.
      const fixPrRunId = await insertRun(db, agentKey, 'fix-pr', 'session-fix-pr-restart');
      const customDir = tmp();
      const jsonlPath = join(customDir, `${sessionId}.jsonl`);
      writeFileSync(jsonlPath, '');
      const svcB = new IngestService({ db, logger: silentLogger, eventBus: new EventBus() });
      svcB.attach({ runId: fixPrRunId, jsonlPath });
      // Give the tail's priming step a beat to complete before the first event
      // lands on disk; this mirrors the real ordering (priming awaited before
      // events flow). We also explicitly call attachAgent to make the test
      // resilient to background-priming timing.
      await svcB.primeAgentForTest(agentKey);

      // First tool_call from fix-pr arrives. Should trigger pr_open → running.
      await svcB.processEventForTest({
        runId: fixPrRunId,
        agentKey,
        event: makeBashToolUse({ id: 'tu_fp', command: 'ls', ts: '2026-04-29T12:01:00Z' }),
      });
      expect(await getLatestState(db, agentKey)).toBe('running');
      svcB.detach(fixPrRunId);
    } finally {
      await db.destroy();
    }
  });

  it('recordRunCompleted is a no-op when previous state is not running', async () => {
    const { db, agentKey } = await setup();
    try {
      const svc = new IngestService({ db, logger: silentLogger, eventBus: new EventBus() });
      const fixPrRunId = await insertRun(db, agentKey, 'fix-pr', 'session-fix-pr-noop');
      // Agent state is `init` (never ingested anything). Completion shouldn't
      // transition.
      await svc.recordRunCompleted(agentKey, fixPrRunId, '2026-04-29T12:00:00Z');
      expect(await getLatestState(db, agentKey)).toBeNull();
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

// ─── CREW-201: startup event ingest ───

describe('IngestService.ingestStartupEvent', () => {
  it('inserts a row + publishes startup_events.changed', async () => {
    const { db, agentKey } = await setup();
    try {
      const bus = new EventBus({ bufferSize: 10 });
      const seen: SseEvent[] = [];
      bus.subscribe({ onEvent: (e) => seen.push(e) });
      const svc = new IngestService({ db, logger: silentLogger, eventBus: bus });

      await svc.ingestStartupEvent(agentKey, {
        type: 'system',
        subtype: 'crew_startup_npm_install',
        status: 'started',
        timestamp: '2026-05-23T10:00:00.000Z',
        summary: 'npm ci begun',
      });

      const rows = await db.selectFrom('startup_events').selectAll().execute();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        agent_key: agentKey,
        subtype: 'crew_startup_npm_install',
        status: 'started',
        summary: 'npm ci begun',
      });
      expect(rows[0].ts).toBe(Date.parse('2026-05-23T10:00:00.000Z'));
      expect(seen.some((e) => e.type === 'startup_events.changed')).toBe(true);
    } finally {
      await db.destroy();
    }
  });

  it('dedupes a re-ingested event (same agent_key/subtype/status/ts)', async () => {
    const { db, agentKey } = await setup();
    try {
      const svc = new IngestService({ db, logger: silentLogger, eventBus: new EventBus() });
      const event = {
        type: 'system' as const,
        subtype: 'crew_startup_docker' as const,
        status: 'completed' as const,
        timestamp: '2026-05-23T10:01:00.000Z',
        summary: 'docker healthy',
        durationMs: 5_000,
      };

      await svc.ingestStartupEvent(agentKey, event);
      await svc.ingestStartupEvent(agentKey, event);

      const rows = await db.selectFrom('startup_events').selectAll().execute();
      expect(rows).toHaveLength(1);
    } finally {
      await db.destroy();
    }
  });

  it('failed event transitions the agent to error', async () => {
    const { db, agentKey } = await setup();
    try {
      const bus = new EventBus({ bufferSize: 10 });
      const seen: SseEvent[] = [];
      bus.subscribe({ onEvent: (e) => seen.push(e) });
      const svc = new IngestService({ db, logger: silentLogger, eventBus: bus });

      await svc.ingestStartupEvent(agentKey, {
        type: 'system',
        subtype: 'crew_startup_npm_install',
        status: 'failed',
        timestamp: '2026-05-23T10:00:00.000Z',
        summary: 'exit 1',
        logPath: '/tmp/crew-npm-install-KAN-1.log',
      });

      const trans = await db
        .selectFrom('state_transitions')
        .selectAll()
        .where('agent_key', '=', agentKey)
        .orderBy('id', 'asc')
        .execute();
      expect(trans.map((t) => t.to_state)).toContain('error');
      const stateChanged = seen.filter(
        (e) => e.type === 'agent.state_changed' && (e.data as { to?: string }).to === 'error',
      );
      expect(stateChanged).toHaveLength(1);
    } finally {
      await db.destroy();
    }
  });

  it('does not re-fire error transition for an agent already in error', async () => {
    const { db, agentKey } = await setup();
    try {
      const svc = new IngestService({ db, logger: silentLogger, eventBus: new EventBus() });
      await svc.ingestStartupEvent(agentKey, {
        type: 'system',
        subtype: 'crew_startup_docker',
        status: 'failed',
        timestamp: '2026-05-23T10:00:00.000Z',
        summary: 'first failure',
      });
      await svc.ingestStartupEvent(agentKey, {
        type: 'system',
        subtype: 'crew_startup_mcp',
        status: 'failed',
        timestamp: '2026-05-23T10:00:01.000Z',
        summary: 'second failure (already in error)',
      });

      const errorTrans = await db
        .selectFrom('state_transitions')
        .selectAll()
        .where('agent_key', '=', agentKey)
        .where('to_state', '=', 'error')
        .execute();
      expect(errorTrans).toHaveLength(1);
    } finally {
      await db.destroy();
    }
  });

  it('does not transition to error for non-failed events', async () => {
    const { db, agentKey } = await setup();
    try {
      const svc = new IngestService({ db, logger: silentLogger, eventBus: new EventBus() });
      await svc.ingestStartupEvent(agentKey, {
        type: 'system',
        subtype: 'crew_startup_npm_install',
        status: 'started',
        timestamp: '2026-05-23T10:00:00.000Z',
        summary: 'begun',
      });
      await svc.ingestStartupEvent(agentKey, {
        type: 'system',
        subtype: 'crew_startup_npm_install',
        status: 'completed',
        timestamp: '2026-05-23T10:00:01.000Z',
        summary: 'done',
        durationMs: 1000,
      });

      const errorTrans = await db
        .selectFrom('state_transitions')
        .selectAll()
        .where('agent_key', '=', agentKey)
        .where('to_state', '=', 'error')
        .execute();
      expect(errorTrans).toHaveLength(0);
    } finally {
      await db.destroy();
    }
  });
});

describe('IngestService.watchStartupEvents', () => {
  it('ingests events from new files appended in the watched dir', async () => {
    const { db, agentKey } = await setup();
    const startupDir = tmp();
    const svc = new IngestService({ db, logger: silentLogger, eventBus: new EventBus() });
    try {
      await svc.watchStartupEvents(startupDir);
      const path = join(startupDir, `${agentKey}.jsonl`);
      writeFileSync(
        path,
        JSON.stringify({
          type: 'system',
          subtype: 'crew_startup_preflight',
          status: 'started',
          timestamp: '2026-05-23T10:00:00.000Z',
          summary: 'preflight begun',
        }) + '\n',
      );
      // chokidar fire latency
      await delay(800);
      appendFileSync(
        path,
        JSON.stringify({
          type: 'system',
          subtype: 'crew_startup_preflight',
          status: 'completed',
          timestamp: '2026-05-23T10:00:01.000Z',
          summary: 'preflight ok',
          durationMs: 1000,
        }) + '\n',
      );
      await delay(800);

      const rows = await db
        .selectFrom('startup_events')
        .selectAll()
        .where('agent_key', '=', agentKey)
        .orderBy('ts', 'asc')
        .execute();
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.status)).toEqual(['started', 'completed']);
    } finally {
      await svc.stopStartupWatcher();
      await db.destroy();
    }
  }, 10_000);

  it('preserves a partial line written without a trailing newline (race-safe)', async () => {
    const { db, agentKey } = await setup();
    const startupDir = tmp();
    const svc = new IngestService({ db, logger: silentLogger, eventBus: new EventBus() });
    try {
      await svc.watchStartupEvents(startupDir);
      const path = join(startupDir, `${agentKey}.jsonl`);
      const event1 = JSON.stringify({
        type: 'system',
        subtype: 'crew_startup_preflight',
        status: 'started',
        timestamp: '2026-05-23T10:00:00.000Z',
        summary: 'preflight begun',
      });
      const event2 = JSON.stringify({
        type: 'system',
        subtype: 'crew_startup_preflight',
        status: 'completed',
        timestamp: '2026-05-23T10:00:01.000Z',
        summary: 'preflight ok',
        durationMs: 1000,
      });

      // First write lands an event WITHOUT the trailing newline — mimics
      // chokidar firing mid-flush. The handler must buffer it, not consume
      // half a line and skip past.
      writeFileSync(path, event1);
      await delay(800);
      const partialRows = await db
        .selectFrom('startup_events')
        .selectAll()
        .where('agent_key', '=', agentKey)
        .execute();
      expect(partialRows).toHaveLength(0);

      // Subsequent append completes the first line and adds a second.
      appendFileSync(path, '\n' + event2 + '\n');
      await delay(800);
      const rows = await db
        .selectFrom('startup_events')
        .selectAll()
        .where('agent_key', '=', agentKey)
        .orderBy('ts', 'asc')
        .execute();
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.status)).toEqual(['started', 'completed']);
    } finally {
      await svc.stopStartupWatcher();
      await db.destroy();
    }
  }, 10_000);

  it('skips malformed JSON lines', async () => {
    const { db, agentKey } = await setup();
    const startupDir = tmp();
    const svc = new IngestService({ db, logger: silentLogger, eventBus: new EventBus() });
    try {
      await svc.watchStartupEvents(startupDir);
      writeFileSync(
        join(startupDir, `${agentKey}.jsonl`),
        'not json at all\n' +
          JSON.stringify({
            type: 'system',
            subtype: 'crew_startup_mcp',
            status: 'completed',
            timestamp: '2026-05-23T10:00:00.000Z',
            summary: 'wrote .mcp.json',
            durationMs: 50,
          }) +
          '\n',
      );
      await delay(800);

      const rows = await db.selectFrom('startup_events').selectAll().execute();
      expect(rows).toHaveLength(1);
      expect(rows[0].subtype).toBe('crew_startup_mcp');
    } finally {
      await svc.stopStartupWatcher();
      await db.destroy();
    }
  }, 10_000);
});
