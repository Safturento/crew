import { describe, it, expect, vi } from 'vitest';
import { writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { pino, type Logger } from 'pino';
import type { Kysely } from 'kysely';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { useTmpDir } from '../test/tmpdir.js';
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
      const svc = new IngestService({ db, logger: silentLogger });
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
      const svc = new IngestService({ db, logger: silentLogger });
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
      const svc = new IngestService({ db, logger: silentLogger });
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
      const svc = new IngestService({ db, logger: silentLogger });
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
      const svc = new IngestService({ db, logger: silentLogger });
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

      const svc = new IngestService({ db, logger: silentLogger });
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
      const svc = new IngestService({ db, logger: silentLogger });
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
      const svc = new IngestService({ db, logger: silentLogger });
      expect(() => svc.detach(99999)).not.toThrow();
    } finally {
      await db.destroy();
    }
  });
});
