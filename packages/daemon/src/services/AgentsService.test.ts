import { describe, it, expect, afterEach, vi } from 'vitest';
import type { Logger } from 'pino';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import type { Kysely } from 'kysely';
import { AgentsService } from './AgentsService.js';
import { TimelineService } from './TimelineService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function freshDb(): Promise<Kysely<DaemonDatabase>> {
  const dir = mkdtempSync(join(tmpdir(), 'crew-agents-svc-'));
  tmpdirs.push(dir);
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

async function makeAgent(
  db: Kysely<DaemonDatabase>,
  key: string,
  overrides: Partial<{
    projectName: string;
    ticketTitle: string | null;
    worktreePath: string;
    branch: string;
    prUrl: string | null;
    appUrl: string | null;
  }> = {},
): Promise<void> {
  await db
    .insertInto('agents')
    .values({
      key,
      project_name: overrides.projectName ?? 'demo',
      ticket_title: overrides.ticketTitle ?? `${key} title`,
      worktree_path: overrides.worktreePath ?? `/x/${key}`,
      branch: overrides.branch ?? key,
      pr_url: overrides.prUrl ?? null,
      app_url: overrides.appUrl ?? null,
      created_at: '2026-04-29T12:00:00Z',
    })
    .execute();
}

async function makeRun(
  db: Kysely<DaemonDatabase>,
  agentKey: string,
  sessionId: string,
  opts: {
    command?: 'run' | 'fix-pr' | 'finish';
    completedAt?: string | null;
    exitCode?: number | null;
  } = {},
): Promise<number> {
  const row = await db
    .insertInto('runs')
    .values({
      agent_key: agentKey,
      command: opts.command ?? 'run',
      session_id: sessionId,
      started_at: '2026-04-29T12:00:00Z',
      completed_at: opts.completedAt ?? null,
      exit_code: opts.exitCode ?? null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

async function makeToolCall(
  db: Kysely<DaemonDatabase>,
  runId: number,
  opts: {
    tool?: string;
    summary?: string;
    tokens?: number;
    inputTokens?: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    occurredAt?: string;
  } = {},
): Promise<void> {
  await db
    .insertInto('tool_calls')
    .values({
      run_id: runId,
      tool_name: opts.tool ?? 'Read',
      input_summary: opts.summary ?? '/x',
      output_tokens: opts.tokens ?? 10,
      input_tokens: opts.inputTokens ?? 0,
      cache_read_tokens: opts.cacheReadTokens ?? 0,
      cache_creation_tokens: opts.cacheCreationTokens ?? 0,
      occurred_at: opts.occurredAt ?? '2026-04-29T12:00:01Z',
    })
    .execute();
}

function makeProjectsDir(toml: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'crew-projects-'));
  tmpdirs.push(dir);
  for (const [name, body] of Object.entries(toml)) {
    writeFileSync(join(dir, `${name}.toml`), body);
  }
  return dir;
}

interface AssistantEventInput {
  /** Per-message output_tokens. `undefined` becomes a missing field (treated as 0). */
  outputTokens?: number;
  /** Per-message input_tokens. */
  inputTokens?: number;
  /** Per-message cache_read_input_tokens. */
  cacheReadTokens?: number;
  /** Per-message cache_creation_input_tokens. */
  cacheCreationTokens?: number;
  /** Tool uses on this message — emitted as `tool_use` content blocks alongside text. */
  toolUses?: { name: string; input?: Record<string, unknown> }[];
  /** Optional text content block; emitted before the tool_use blocks. */
  text?: string;
  /** ISO timestamp. Defaults to a synthetic increasing value per call. */
  timestamp?: string;
  /** Optional model id stamped on message.model. */
  model?: string;
}

let assistantEventCounter = 0;
function makeAssistantEventLine(opts: AssistantEventInput): string {
  assistantEventCounter += 1;
  const content: Array<Record<string, unknown>> = [];
  if (opts.text) content.push({ type: 'text', text: opts.text });
  for (const tu of opts.toolUses ?? []) {
    content.push({
      type: 'tool_use',
      id: `t_${assistantEventCounter}`,
      name: tu.name,
      input: tu.input ?? {},
    });
  }
  if (content.length === 0) content.push({ type: 'text', text: 'assistant body' });
  const usage: Record<string, number> = {};
  if (opts.outputTokens !== undefined) usage.output_tokens = opts.outputTokens;
  if (opts.inputTokens !== undefined) usage.input_tokens = opts.inputTokens;
  if (opts.cacheReadTokens !== undefined) usage.cache_read_input_tokens = opts.cacheReadTokens;
  if (opts.cacheCreationTokens !== undefined)
    usage.cache_creation_input_tokens = opts.cacheCreationTokens;
  const message: Record<string, unknown> = {
    role: 'assistant',
    content,
    usage,
  };
  if (opts.model !== undefined) message.model = opts.model;
  return JSON.stringify({
    type: 'assistant',
    timestamp:
      opts.timestamp ?? `2026-05-23T12:00:${String(assistantEventCounter).padStart(2, '0')}Z`,
    message,
  });
}

function writeTranscriptJsonl(lines: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'crew-jsonl-'));
  tmpdirs.push(dir);
  const path = join(dir, 'transcript.jsonl');
  writeFileSync(path, lines.join('\n') + '\n');
  return path;
}

function makeTimelineForPath(path: string): TimelineService {
  return new TimelineService({ resolveJsonlPath: async () => path });
}

const KANBAN_TOML = `
name = "kanban-api"
repo_path = "~/code/kanban-api"
[jira]
project_key = "KAN"
site = "https://safturento.atlassian.net"
[github]
repo = "safturento/kanban-api"
[playwright]
app_url = "http://localhost:7421"
start_command = "npm run dev"
[playwright.smoke]
enabled = true
`;

const KANBAN_NO_PW_TOML = `
name = "kanban-api"
repo_path = "~/code/kanban-api"
[jira]
project_key = "KAN"
site = "https://safturento.atlassian.net"
[github]
repo = "safturento/kanban-api"
`;

type AnyTransitionState =
  | 'init'
  | 'running'
  | 'pr_open'
  | 'pr_merged'
  | 'error'
  | 'finished'
  | 'idle'
  | 'waiting';

async function makeStateTransition(
  db: Kysely<DaemonDatabase>,
  agentKey: string,
  to: AnyTransitionState,
  ts: number,
  from: AnyTransitionState | null = null,
  source: string | null = null,
): Promise<void> {
  await db
    .insertInto('state_transitions')
    .values({ agent_key: agentKey, from_state: from, to_state: to, ts, source })
    .execute();
}

describe('AgentsService.list', () => {
  it('returns initializing for an agent whose latest run has zero tool_calls', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-1');
      await makeRun(db, 'KAN-1', 's1');
      const svc = new AgentsService({ db });
      const agents = await svc.list();
      expect(agents).toHaveLength(1);
      expect(agents[0]).toMatchObject({
        key: 'KAN-1',
        projectName: 'demo',
        ticketTitle: 'KAN-1 title',
        state: 'initializing',
        tokens: 0,
      });
    } finally {
      await db.destroy();
    }
  });

  it('returns running for an agent whose latest run is open and has tool_calls', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-2');
      const runId = await makeRun(db, 'KAN-2', 's2');
      await makeToolCall(db, runId, { tokens: 5 });
      const svc = new AgentsService({ db });
      const agents = await svc.list();
      expect(agents[0]).toMatchObject({ key: 'KAN-2', state: 'running', tokens: 5 });
    } finally {
      await db.destroy();
    }
  });

  // CREW-234: the badge now follows the transition log. IngestService's
  // ⏎-aware live detection writes the pr_open transition (incl. the cd-prefixed
  // `gh pr create` variant — covered by IngestService/parser tests); list()
  // just projects it.
  it('returns pr_open when the transition log records pr_open for a completed run', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-3');
      const runId = await makeRun(db, 'KAN-3', 's3', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, runId, {
        tool: 'Bash',
        summary: 'gh pr create --title hello',
        tokens: 1,
      });
      await makeStateTransition(db, 'KAN-3', 'running', 1000, 'init');
      await makeStateTransition(db, 'KAN-3', 'pr_open', 2000, 'running');
      const svc = new AgentsService({ db });
      expect((await svc.list())[0]).toMatchObject({ key: 'KAN-3', state: 'pr_open' });
    } finally {
      await db.destroy();
    }
  });

  // CREW-264 Defect 1: a completed exit-0 run with no terminal transition is
  // `idle` (run ended, no PR — CREW-257), never a fabricated `finished`. The
  // old `return 'finished'` fallthrough masqueraded a dropped detection as a
  // clean close-out. `finished` is now produced only by `finishCompletedOk`.
  it('returns idle when latest run is completed=0 with an empty/non-terminal transition log', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-4');
      const runId = await makeRun(db, 'KAN-4', 's4', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, runId, { tool: 'Read', tokens: 2 });
      const svc = new AgentsService({ db });
      expect((await svc.list())[0]).toMatchObject({ key: 'KAN-4', state: 'idle' });
    } finally {
      await db.destroy();
    }
  });

  it('returns error when latest run completed with a non-zero exit code', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-5');
      const runId = await makeRun(db, 'KAN-5', 's5', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 1,
      });
      await makeToolCall(db, runId, { tokens: 3 });
      expect((await new AgentsService({ db }).list())[0]).toMatchObject({
        key: 'KAN-5',
        state: 'error',
      });
    } finally {
      await db.destroy();
    }
  });

  it('aggregates tokens across all runs of the same agent', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-6');
      const r1 = await makeRun(db, 'KAN-6', 's6a', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      const r2 = await makeRun(db, 'KAN-6', 's6b', { command: 'fix-pr' });
      await makeToolCall(db, r1, { tokens: 100, occurredAt: '2026-04-29T13:00:01Z' });
      await makeToolCall(db, r2, { tokens: 200, occurredAt: '2026-04-29T14:00:01Z' });
      const agents = await new AgentsService({ db }).list();
      expect(agents[0]).toMatchObject({ key: 'KAN-6', tokens: 300, state: 'running' });
    } finally {
      await db.destroy();
    }
  });

  it('returns an empty list when no agents exist', async () => {
    const db = await freshDb();
    try {
      expect(await new AgentsService({ db }).list()).toEqual([]);
    } finally {
      await db.destroy();
    }
  });

  // CREW-116: finish runs must not poison state derivation.
  it('returns finished after a finish run completes ok, even though gh pr create was observed earlier', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-7');
      const r1 = await makeRun(db, 'KAN-7', 's7a', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, r1, {
        tool: 'Bash',
        summary: 'gh pr create --title hello',
        tokens: 1,
      });
      await makeRun(db, 'KAN-7', `finish-KAN-7-${'a'.repeat(8)}`, {
        command: 'finish',
        completedAt: '2026-04-29T14:00:00Z',
        exitCode: 0,
      });
      const agents = await new AgentsService({ db }).list();
      expect(agents[0]).toMatchObject({ key: 'KAN-7', state: 'finished' });
    } finally {
      await db.destroy();
    }
  });

  // CREW-202: pr_merged is sourced from state_transitions (the PrPoller
  // writes it). list() must surface it even though hasPrCreate is still
  // true on the underlying tool_calls.
  it('returns pr_merged when latest state_transitions row is pr_merged', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-PM-1', { prUrl: 'https://github.com/x/y/pull/1' });
      const r1 = await makeRun(db, 'KAN-PM-1', 's-pm-1', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, r1, {
        tool: 'Bash',
        summary: 'gh pr create --title hi',
        tokens: 1,
      });
      await makeStateTransition(db, 'KAN-PM-1', 'pr_open', 1000, 'running');
      await makeStateTransition(db, 'KAN-PM-1', 'pr_merged', 2000, 'pr_open');
      const agents = await new AgentsService({ db }).list();
      expect(agents[0]).toMatchObject({ key: 'KAN-PM-1', state: 'pr_merged' });
    } finally {
      await db.destroy();
    }
  });

  // finishCompletedOk still wins over pr_merged — once finish has completed
  // cleanly the agent is done, regardless of any earlier pr_merged transition.
  it('returns finished when finish run completed even if pr_merged transition exists', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-PM-2', { prUrl: 'https://github.com/x/y/pull/2' });
      const r1 = await makeRun(db, 'KAN-PM-2', 's-pm-2', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, r1, {
        tool: 'Bash',
        summary: 'gh pr create --title hi',
        tokens: 1,
      });
      await makeStateTransition(db, 'KAN-PM-2', 'pr_merged', 2000, 'pr_open');
      await makeRun(db, 'KAN-PM-2', `finish-KAN-PM-2-${'c'.repeat(8)}`, {
        command: 'finish',
        completedAt: '2026-04-29T14:00:00Z',
        exitCode: 0,
      });
      const agents = await new AgentsService({ db }).list();
      expect(agents[0]).toMatchObject({ key: 'KAN-PM-2', state: 'finished' });
    } finally {
      await db.destroy();
    }
  });

  it('keeps the prior state (pr_open) while a finish run is in progress with no tool_calls', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-8');
      const r1 = await makeRun(db, 'KAN-8', 's8a', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, r1, {
        tool: 'Bash',
        summary: 'gh pr create --title hi',
        tokens: 1,
      });
      await makeStateTransition(db, 'KAN-8', 'running', 1000, 'init');
      await makeStateTransition(db, 'KAN-8', 'pr_open', 2000, 'running');
      // Open finish run with no tool_calls.
      await makeRun(db, 'KAN-8', `finish-KAN-8-${'b'.repeat(8)}`, { command: 'finish' });
      const agents = await new AgentsService({ db }).list();
      expect(agents[0]).toMatchObject({ key: 'KAN-8', state: 'pr_open' });
    } finally {
      await db.destroy();
    }
  });

  // CREW-234: the in-flight crew fix-pr face. The transition log re-flips
  // pr_open → running on the new run's first tool_call (CREW-198), so the badge
  // must read 'running' even though `gh pr create` ran earlier and the
  // forever-true has_pr_create flag would have kept it stuck on pr_open.
  it('reflects the in-flight fix-pr running phase from the transition log', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-FIXPR', { prUrl: 'https://github.com/x/y/pull/9' });
      const original = await makeRun(db, 'KAN-FIXPR', 's-orig', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, original, {
        tool: 'Bash',
        summary: 'gh pr create --title hi',
        tokens: 1,
      });
      // In-flight fix-pr run (not completed) with a tool_call.
      const fixPr = await makeRun(db, 'KAN-FIXPR', 's-fixpr', { command: 'fix-pr' });
      await makeToolCall(db, fixPr, { tool: 'Read', tokens: 1 });
      await makeStateTransition(db, 'KAN-FIXPR', 'running', 1000, 'init');
      await makeStateTransition(db, 'KAN-FIXPR', 'pr_open', 2000, 'running');
      await makeStateTransition(db, 'KAN-FIXPR', 'running', 3000, 'pr_open');
      const agents = await new AgentsService({ db }).list();
      expect(agents[0]).toMatchObject({ key: 'KAN-FIXPR', state: 'running' });
    } finally {
      await db.destroy();
    }
  });

  // CREW-234: the false-Finished face. A completed run that opened a PR but
  // whose summary the cruder SQL flag missed used to fall through to
  // 'finished'. The transition log holds pr_open, so the badge reads pr_open.
  it('reads pr_open from the transition log for a completed run that opened a PR', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-FALSEFIN', { prUrl: 'https://github.com/x/y/pull/10' });
      const r1 = await makeRun(db, 'KAN-FALSEFIN', 's-ff', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, r1, { tool: 'Read', tokens: 1 });
      await makeStateTransition(db, 'KAN-FALSEFIN', 'running', 1000, 'init');
      await makeStateTransition(db, 'KAN-FALSEFIN', 'pr_open', 2000, 'running');
      const agents = await new AgentsService({ db }).list();
      expect(agents[0]).toMatchObject({ key: 'KAN-FALSEFIN', state: 'pr_open' });
    } finally {
      await db.destroy();
    }
  });

  // CREW-264 Defect 2: a `source='override'` transition is the newest row and
  // must escape the terminal guards — an operator moving an agent OUT of a
  // terminal state has to survive the list refetch, not just the SSE flip.

  it('honors an override out of finished (survives a list re-derive)', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-OV-FIN');
      const r1 = await makeRun(db, 'KAN-OV-FIN', 's-ov-fin', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, r1, { tool: 'Read', tokens: 1 });
      // A clean finish run makes finishCompletedOk true (terminal guard).
      await makeRun(db, 'KAN-OV-FIN', `finish-KAN-OV-FIN-${'a'.repeat(8)}`, {
        command: 'finish',
        completedAt: '2026-04-29T14:00:00Z',
        exitCode: 0,
      });
      await makeStateTransition(db, 'KAN-OV-FIN', 'finished', 2000, null, 'cli-finish');
      await makeStateTransition(db, 'KAN-OV-FIN', 'running', 3000, 'finished', 'override');
      const agents = await new AgentsService({ db }).list();
      expect(agents[0]).toMatchObject({ key: 'KAN-OV-FIN', state: 'running' });
    } finally {
      await db.destroy();
    }
  });

  it('honors an override out of pr_merged (survives a list re-derive)', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-OV-PM', { prUrl: 'https://github.com/x/y/pull/1' });
      const r1 = await makeRun(db, 'KAN-OV-PM', 's-ov-pm', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, r1, { tool: 'Read', tokens: 1 });
      await makeStateTransition(db, 'KAN-OV-PM', 'pr_merged', 2000, 'pr_open', 'poller');
      await makeStateTransition(db, 'KAN-OV-PM', 'pr_open', 3000, 'pr_merged', 'override');
      const agents = await new AgentsService({ db }).list();
      expect(agents[0]).toMatchObject({ key: 'KAN-OV-PM', state: 'pr_open' });
    } finally {
      await db.destroy();
    }
  });

  it('honors an override out of error (survives a list re-derive)', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-OV-ERR');
      const r1 = await makeRun(db, 'KAN-OV-ERR', 's-ov-err', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 1,
      });
      await makeToolCall(db, r1, { tool: 'Read', tokens: 1 });
      await makeStateTransition(db, 'KAN-OV-ERR', 'error', 2000, 'running', 'runner-exit');
      await makeStateTransition(db, 'KAN-OV-ERR', 'idle', 3000, 'error', 'override');
      const agents = await new AgentsService({ db }).list();
      expect(agents[0]).toMatchObject({ key: 'KAN-OV-ERR', state: 'idle' });
    } finally {
      await db.destroy();
    }
  });

  // The override escape only applies to `source='override'`. A non-override
  // latest transition still defers to the legacy terminal guards, so legacy /
  // backfilled agents are unaffected.
  it('still defers to the finish guard when the latest transition is not an override', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-OV-LEGACY');
      const r1 = await makeRun(db, 'KAN-OV-LEGACY', 's-ov-legacy', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, r1, { tool: 'Read', tokens: 1 });
      await makeRun(db, 'KAN-OV-LEGACY', `finish-KAN-OV-LEGACY-${'b'.repeat(8)}`, {
        command: 'finish',
        completedAt: '2026-04-29T14:00:00Z',
        exitCode: 0,
      });
      // Latest transition is a non-override running row — the finish guard
      // (finishCompletedOk) must still win.
      await makeStateTransition(db, 'KAN-OV-LEGACY', 'running', 3000, 'init', 'cli-fixpr');
      const agents = await new AgentsService({ db }).list();
      expect(agents[0]).toMatchObject({ key: 'KAN-OV-LEGACY', state: 'finished' });
    } finally {
      await db.destroy();
    }
  });

  // CREW-264: a stale override does not win forever — a newer automatic event
  // (here PrPoller's pr_merged) writes a non-override row that becomes the
  // latest transition, so the terminal guards re-take precedence over the
  // earlier override. This is the safety net that justifies gating on
  // `source='override'` rather than "any newer transition".
  it('lets a newer automatic transition re-take precedence over a stale override', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-OV-RECOVER', { prUrl: 'https://github.com/x/y/pull/3' });
      const r1 = await makeRun(db, 'KAN-OV-RECOVER', 's-ov-recover', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, r1, { tool: 'Read', tokens: 1 });
      await makeStateTransition(db, 'KAN-OV-RECOVER', 'pr_merged', 2000, 'pr_open', 'poller');
      // Operator overrides back to pr_open…
      await makeStateTransition(db, 'KAN-OV-RECOVER', 'pr_open', 3000, 'pr_merged', 'override');
      // …then the PR re-merges and the poller writes a fresh, newer pr_merged.
      await makeStateTransition(db, 'KAN-OV-RECOVER', 'pr_merged', 4000, 'pr_open', 'poller');
      const agents = await new AgentsService({ db }).list();
      expect(agents[0]).toMatchObject({ key: 'KAN-OV-RECOVER', state: 'pr_merged' });
    } finally {
      await db.destroy();
    }
  });
});

describe('AgentsService.getByKey', () => {
  it('returns null when no run exists for that key', async () => {
    const db = await freshDb();
    try {
      const svc = new AgentsService({ db });
      expect(await svc.getByKey('NOPE-99')).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  it('returns null when an agent row exists but has no runs', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-X');
      const svc = new AgentsService({ db });
      expect(await svc.getByKey('KAN-X')).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  it('returns detail with runs, tokens breakdown, and tool_call_count', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-1', {
        projectName: 'demo',
        ticketTitle: 'Demo title',
        worktreePath: '/work/KAN-1',
        prUrl: 'https://github.com/x/y/pull/1',
      });
      const r1 = await makeRun(db, 'KAN-1', 's1', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      const r2 = await makeRun(db, 'KAN-1', 's2', {
        command: 'fix-pr',
        completedAt: '2026-04-29T15:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, r1, {
        tool: 'Bash',
        summary: 'gh pr create --title hello',
        tokens: 100,
        inputTokens: 25,
        cacheReadTokens: 5,
        cacheCreationTokens: 7,
        occurredAt: '2026-04-29T13:00:01Z',
      });
      await makeToolCall(db, r2, {
        tool: 'Read',
        tokens: 200,
        inputTokens: 50,
        cacheReadTokens: 10,
        cacheCreationTokens: 0,
        occurredAt: '2026-04-29T14:00:01Z',
      });
      await makeStateTransition(db, 'KAN-1', 'running', 1000, 'init');
      await makeStateTransition(db, 'KAN-1', 'pr_open', 2000, 'running');

      const svc = new AgentsService({ db });
      const detail = await svc.getByKey('KAN-1');
      expect(detail).not.toBeNull();
      expect(detail).toMatchObject({
        key: 'KAN-1',
        project: 'demo',
        ticket_key: 'KAN-1',
        ticket_title: 'Demo title',
        state: 'pr_open',
        worktree_path: '/work/KAN-1',
        pr_url: 'https://github.com/x/y/pull/1',
        tool_call_count: 2,
        tokens: {
          total: 100 + 25 + 5 + 7 + 200 + 50 + 10 + 0,
          input: 25 + 50,
          output: 100 + 200,
          cache_read: 5 + 10,
          cache_creation: 7,
        },
      });
      expect(detail?.runs).toHaveLength(2);
      expect(detail?.runs[0]).toMatchObject({
        command: 'run',
        started_at: '2026-04-29T12:00:00Z',
        completed_at: '2026-04-29T13:00:00Z',
      });
      expect(detail?.runs[1]).toMatchObject({
        command: 'fix-pr',
        completed_at: '2026-04-29T15:00:00Z',
      });
      expect(typeof detail?.runs[0].id).toBe('string');
    } finally {
      await db.destroy();
    }
  });

  it('returns pr_url as null when not set', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-2');
      await makeRun(db, 'KAN-2', 's1');
      const detail = await new AgentsService({ db }).getByKey('KAN-2');
      expect(detail).not.toBeNull();
      expect(detail?.pr_url).toBeNull();
      expect(detail?.state).toBe('initializing');
    } finally {
      await db.destroy();
    }
  });

  // CREW-116: same finish-aware logic must apply on the single-agent endpoint.
  it('returns finished after a finish run completes ok (single-agent endpoint)', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-FIN-1');
      const r1 = await makeRun(db, 'KAN-FIN-1', 'sfin1', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, r1, {
        tool: 'Bash',
        summary: 'gh pr create --title finished',
        tokens: 1,
      });
      await makeRun(db, 'KAN-FIN-1', `finish-KAN-FIN-1-1`, {
        command: 'finish',
        completedAt: '2026-04-29T14:00:00Z',
        exitCode: 0,
      });
      const detail = await new AgentsService({ db }).getByKey('KAN-FIN-1');
      expect(detail?.state).toBe('finished');
    } finally {
      await db.destroy();
    }
  });

  it('keeps state at pr_open while a finish run is in progress (single-agent endpoint)', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-FIN-2');
      const r1 = await makeRun(db, 'KAN-FIN-2', 'sfin2', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, r1, {
        tool: 'Bash',
        summary: 'gh pr create --title hi',
        tokens: 1,
      });
      await makeStateTransition(db, 'KAN-FIN-2', 'running', 1000, 'init');
      await makeStateTransition(db, 'KAN-FIN-2', 'pr_open', 2000, 'running');
      await makeRun(db, 'KAN-FIN-2', `finish-KAN-FIN-2-1`, { command: 'finish' });
      const detail = await new AgentsService({ db }).getByKey('KAN-FIN-2');
      expect(detail?.state).toBe('pr_open');
    } finally {
      await db.destroy();
    }
  });

  // CREW-234: the false-Finished face on the detail endpoint. getByKey's crude
  // `LIKE 'gh pr create%'` flag missed the `cd … ⏎ gh pr create` summary and
  // fell through to 'finished'. The transition log (written by IngestService's
  // ⏎-aware live detection) holds pr_open, so the drawer now reads pr_open and
  // agrees with the list.
  it('reads pr_open from the transition log when the cd-prefixed PR summary would be missed', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-FF-G', { prUrl: 'https://github.com/x/y/pull/11' });
      const r1 = await makeRun(db, 'KAN-FF-G', 's-ff-g', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, r1, {
        tool: 'Bash',
        summary: 'cd /home/me/Repos/crew-KAN-FF-G ⏎ gh pr create --base main --head KAN-FF-G',
        tokens: 1,
      });
      await makeStateTransition(db, 'KAN-FF-G', 'running', 1000, 'init');
      await makeStateTransition(db, 'KAN-FF-G', 'pr_open', 2000, 'running');
      const detail = await new AgentsService({ db }).getByKey('KAN-FF-G');
      expect(detail?.state).toBe('pr_open');
    } finally {
      await db.destroy();
    }
  });

  // CREW-264 Defect 1 (single-agent endpoint): completed exit-0 run, empty log
  // → idle, not a fabricated finished.
  it('returns idle for a completed exit-0 run with no terminal transition (single-agent endpoint)', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-IDLE-G');
      const r1 = await makeRun(db, 'KAN-IDLE-G', 's-idle-g', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, r1, { tool: 'Read', tokens: 1 });
      const detail = await new AgentsService({ db }).getByKey('KAN-IDLE-G');
      expect(detail?.state).toBe('idle');
    } finally {
      await db.destroy();
    }
  });

  // CREW-264 Defect 2 (single-agent endpoint): an override out of a terminal
  // state survives the detail refetch, mirroring list().
  it('honors an override out of finished (single-agent endpoint)', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-OV-FIN-G');
      const r1 = await makeRun(db, 'KAN-OV-FIN-G', 's-ov-fin-g', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, r1, { tool: 'Read', tokens: 1 });
      await makeRun(db, 'KAN-OV-FIN-G', `finish-KAN-OV-FIN-G-1`, {
        command: 'finish',
        completedAt: '2026-04-29T14:00:00Z',
        exitCode: 0,
      });
      await makeStateTransition(db, 'KAN-OV-FIN-G', 'finished', 2000, null, 'cli-finish');
      await makeStateTransition(db, 'KAN-OV-FIN-G', 'running', 3000, 'finished', 'override');
      const detail = await new AgentsService({ db }).getByKey('KAN-OV-FIN-G');
      expect(detail?.state).toBe('running');
    } finally {
      await db.destroy();
    }
  });

  // CREW-234: in-flight fix-pr on the detail endpoint — log re-flipped to
  // running, so the drawer badge reads running, not the stuck pr_open.
  it('reflects the in-flight fix-pr running phase from the transition log (single-agent endpoint)', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-FIXPR-G', { prUrl: 'https://github.com/x/y/pull/12' });
      const original = await makeRun(db, 'KAN-FIXPR-G', 's-orig-g', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, original, {
        tool: 'Bash',
        summary: 'gh pr create --title hi',
        tokens: 1,
      });
      const fixPr = await makeRun(db, 'KAN-FIXPR-G', 's-fixpr-g', { command: 'fix-pr' });
      await makeToolCall(db, fixPr, { tool: 'Read', tokens: 1 });
      await makeStateTransition(db, 'KAN-FIXPR-G', 'running', 1000, 'init');
      await makeStateTransition(db, 'KAN-FIXPR-G', 'pr_open', 2000, 'running');
      await makeStateTransition(db, 'KAN-FIXPR-G', 'running', 3000, 'pr_open');
      const detail = await new AgentsService({ db }).getByKey('KAN-FIXPR-G');
      expect(detail?.state).toBe('running');
    } finally {
      await db.destroy();
    }
  });

  it('zero tool_calls produces all-zero token breakdown and tool_call_count of 0', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-3');
      await makeRun(db, 'KAN-3', 's1');
      const detail = await new AgentsService({ db }).getByKey('KAN-3');
      expect(detail?.tool_call_count).toBe(0);
      expect(detail?.tokens).toEqual({
        total: 0,
        input: 0,
        output: 0,
        cache_read: 0,
        cache_creation: 0,
      });
    } finally {
      await db.destroy();
    }
  });

  // CREW-178: drawer redesign needs app_url + jira_url + tokens_by_tool on the detail.
  it('composes app_url from playwright.app_url and jira_url from jira.site', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-23', { projectName: 'kanban-api' });
      await makeRun(db, 'KAN-23', 's1');
      const projectsDir = makeProjectsDir({ 'kanban-api': KANBAN_TOML });
      const detail = await new AgentsService({ db, projectsDir }).getByKey('KAN-23');
      expect(detail?.app_url).toBe('http://localhost:7421');
      expect(detail?.jira_url).toBe('https://safturento.atlassian.net/browse/KAN-23');
    } finally {
      await db.destroy();
    }
  });

  it('returns null app_url when project config has no playwright or bruno_smoke', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-23', { projectName: 'kanban-api' });
      await makeRun(db, 'KAN-23', 's1');
      const projectsDir = makeProjectsDir({ 'kanban-api': KANBAN_NO_PW_TOML });
      const detail = await new AgentsService({ db, projectsDir }).getByKey('KAN-23');
      expect(detail?.app_url).toBeNull();
      // jira_url still composes — it only depends on the site, which is always present.
      expect(detail?.jira_url).toBe('https://safturento.atlassian.net/browse/KAN-23');
    } finally {
      await db.destroy();
    }
  });

  it('returns null app_url + jira_url when the project config is missing', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-23', { projectName: 'kanban-api' });
      await makeRun(db, 'KAN-23', 's1');
      // Empty projects dir — loader will throw and getByKey should swallow it.
      const projectsDir = makeProjectsDir();
      const detail = await new AgentsService({ db, projectsDir }).getByKey('KAN-23');
      expect(detail?.app_url).toBeNull();
      expect(detail?.jira_url).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  // CREW-233: the stored per-worktree app_url wins over the static config port.
  it('prefers the stored per-worktree app_url over deriveAppUrl(cfg)', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-23', {
        projectName: 'kanban-api',
        appUrl: 'http://localhost:51234',
      });
      await makeRun(db, 'KAN-23', 's1');
      const projectsDir = makeProjectsDir({ 'kanban-api': KANBAN_TOML });
      const detail = await new AgentsService({ db, projectsDir }).getByKey('KAN-23');
      // KANBAN_TOML's playwright.app_url is :7421 — the stored value must win.
      expect(detail?.app_url).toBe('http://localhost:51234');
      expect(detail?.jira_url).toBe('https://safturento.atlassian.net/browse/KAN-23');
    } finally {
      await db.destroy();
    }
  });

  it('falls back to deriveAppUrl(cfg) when no app_url is stored', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-23', { projectName: 'kanban-api', appUrl: null });
      await makeRun(db, 'KAN-23', 's1');
      const projectsDir = makeProjectsDir({ 'kanban-api': KANBAN_TOML });
      const detail = await new AgentsService({ db, projectsDir }).getByKey('KAN-23');
      expect(detail?.app_url).toBe('http://localhost:7421');
    } finally {
      await db.destroy();
    }
  });

  it('logs a warning (instead of swallowing) when project config load fails', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-23', { projectName: 'kanban-api', appUrl: null });
      await makeRun(db, 'KAN-23', 's1');
      const warn = vi.fn();
      const logger = { warn } as unknown as Logger;
      // Empty projects dir — loader throws; the failure must be logged, not swallowed.
      const projectsDir = makeProjectsDir();
      const detail = await new AgentsService({ db, projectsDir, logger }).getByKey('KAN-23');
      expect(detail?.app_url).toBeNull();
      expect(detail?.jira_url).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ project: 'kanban-api', key: 'KAN-23' }),
        expect.stringContaining('project config'),
      );
    } finally {
      await db.destroy();
    }
  });

  it("aggregates tokens_by_tool across all of the agent's runs, ordered by totalTokens desc", async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-23', { projectName: 'kanban-api' });
      const r1 = await makeRun(db, 'KAN-23', 's1', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      const r2 = await makeRun(db, 'KAN-23', 's2', { command: 'fix-pr' });
      // run 1: Bash×2 (1000 + 500 output), Read×1 (200 output)
      await makeToolCall(db, r1, {
        tool: 'Bash',
        tokens: 1000,
        occurredAt: '2026-04-29T12:00:01Z',
      });
      await makeToolCall(db, r1, {
        tool: 'Bash',
        tokens: 500,
        occurredAt: '2026-04-29T12:00:02Z',
      });
      await makeToolCall(db, r1, {
        tool: 'Read',
        tokens: 200,
        occurredAt: '2026-04-29T12:00:03Z',
      });
      // run 2: Bash×1 (300 output), Edit×1 (700 output)
      await makeToolCall(db, r2, {
        tool: 'Bash',
        tokens: 300,
        occurredAt: '2026-04-29T12:00:04Z',
      });
      await makeToolCall(db, r2, {
        tool: 'Edit',
        tokens: 700,
        occurredAt: '2026-04-29T12:00:05Z',
      });
      const projectsDir = makeProjectsDir({ 'kanban-api': KANBAN_TOML });
      const detail = await new AgentsService({ db, projectsDir }).getByKey('KAN-23');
      // totalTokens-desc: Bash 1800, Edit 700, Read 200.
      expect(detail?.tokens_by_tool).toHaveLength(3);
      expect(detail?.tokens_by_tool[0]).toMatchObject({
        tool: 'Bash',
        totalTokens: 1800,
        tokens: { input: 0, output: 1800, cacheCreation: 0, cacheRead: 0 },
      });
      expect(detail?.tokens_by_tool[1]).toMatchObject({
        tool: 'Edit',
        totalTokens: 700,
        tokens: { input: 0, output: 700, cacheCreation: 0, cacheRead: 0 },
      });
      expect(detail?.tokens_by_tool[2]).toMatchObject({
        tool: 'Read',
        totalTokens: 200,
        tokens: { input: 0, output: 200, cacheCreation: 0, cacheRead: 0 },
      });
    } finally {
      await db.destroy();
    }
  });

  it('returns an empty tokens_by_tool array when the agent has no tool calls', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-23', { projectName: 'kanban-api' });
      await makeRun(db, 'KAN-23', 's1');
      const projectsDir = makeProjectsDir({ 'kanban-api': KANBAN_TOML });
      const detail = await new AgentsService({ db, projectsDir }).getByKey('KAN-23');
      expect(detail?.tokens_by_tool).toEqual([]);
    } finally {
      await db.destroy();
    }
  });

  it('surfaces per-category buckets per tool row (CREW-195)', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-23', { projectName: 'kanban-api' });
      const r1 = await makeRun(db, 'KAN-23', 's1');
      await makeToolCall(db, r1, {
        tool: 'Bash',
        tokens: 100,
        inputTokens: 50,
        cacheReadTokens: 25,
        cacheCreationTokens: 25,
      });
      const projectsDir = makeProjectsDir({ 'kanban-api': KANBAN_TOML });
      const detail = await new AgentsService({ db, projectsDir }).getByKey('KAN-23');
      expect(detail?.tokens_by_tool).toEqual([
        {
          tool: 'Bash',
          tokens: { input: 50, output: 100, cacheCreation: 25, cacheRead: 25 },
          totalTokens: 200,
        },
      ]);
    } finally {
      await db.destroy();
    }
  });

  // CREW-191: TokensByTool panel must surface the model's own output tokens —
  // not just tokens attributed to tool_use messages. The aggregate is sourced
  // from the JSONL transcript via TimelineService, since text-only / thinking-
  // only assistant turns never make it to the tool_calls table.
  describe('Assistant row (CREW-191)', () => {
    it('prepends an Assistant row summing output_tokens across text-only assistant events', async () => {
      const db = await freshDb();
      try {
        await makeAgent(db, 'KAN-AS-1');
        await makeRun(db, 'KAN-AS-1', 's1');
        const path = writeTranscriptJsonl([
          makeAssistantEventLine({ text: 'planning', outputTokens: 100 }),
          makeAssistantEventLine({
            outputTokens: 200,
            toolUses: [{ name: 'Bash', input: { command: 'ls' } }],
          }),
          makeAssistantEventLine({ text: 'wrap up', outputTokens: 50 }),
        ]);
        const detail = await new AgentsService({
          db,
          timelineService: makeTimelineForPath(path),
        }).getByKey('KAN-AS-1');
        expect(detail).not.toBeNull();
        const assistant = detail?.tokens_by_tool.find((r) => r.tool === 'Assistant');
        expect(assistant).toBeDefined();
        // Text-only turns (100 + 50). The tool-bearing turn flows to Bash.
        expect(assistant?.tokens.output).toBe(150);
        expect(assistant?.totalTokens).toBe(150);
      } finally {
        await db.destroy();
      }
    });

    it('places the Assistant row first regardless of tool token counts', async () => {
      const db = await freshDb();
      try {
        await makeAgent(db, 'KAN-AS-2');
        const r1 = await makeRun(db, 'KAN-AS-2', 's1');
        await makeToolCall(db, r1, { tool: 'Bash', tokens: 999_000 });
        const path = writeTranscriptJsonl([
          makeAssistantEventLine({ text: 'tiny', outputTokens: 100 }),
        ]);
        const detail = await new AgentsService({
          db,
          timelineService: makeTimelineForPath(path),
        }).getByKey('KAN-AS-2');
        expect(detail?.tokens_by_tool[0]?.tool).toBe('Assistant');
      } finally {
        await db.destroy();
      }
    });

    it('omits the Assistant row when no text-only assistant events carry tokens', async () => {
      const db = await freshDb();
      try {
        await makeAgent(db, 'KAN-AS-3');
        const r1 = await makeRun(db, 'KAN-AS-3', 's1');
        await makeToolCall(db, r1, { tool: 'Bash', tokens: 500 });
        const path = writeTranscriptJsonl([
          makeAssistantEventLine({ text: 'silent', outputTokens: 0 }),
        ]);
        const detail = await new AgentsService({
          db,
          timelineService: makeTimelineForPath(path),
        }).getByKey('KAN-AS-3');
        expect(detail?.tokens_by_tool.find((r) => r.tool === 'Assistant')).toBeUndefined();
        expect(detail?.tokens_by_tool).toEqual([
          {
            tool: 'Bash',
            tokens: { input: 0, output: 500, cacheCreation: 0, cacheRead: 0 },
            totalTokens: 500,
          },
        ]);
      } finally {
        await db.destroy();
      }
    });

    it('treats missing/zero usage fields as 0 when summing across events', async () => {
      const db = await freshDb();
      try {
        await makeAgent(db, 'KAN-AS-4');
        await makeRun(db, 'KAN-AS-4', 's1');
        const path = writeTranscriptJsonl([
          makeAssistantEventLine({ text: 'a' }),
          makeAssistantEventLine({ text: 'b', outputTokens: 100 }),
        ]);
        const detail = await new AgentsService({
          db,
          timelineService: makeTimelineForPath(path),
        }).getByKey('KAN-AS-4');
        const assistant = detail?.tokens_by_tool.find((r) => r.tool === 'Assistant');
        expect(assistant?.tokens.output).toBe(100);
        expect(assistant?.tokens.cacheRead).toBe(0);
        expect(assistant?.tokens.cacheCreation).toBe(0);
      } finally {
        await db.destroy();
      }
    });

    it('falls back to existing behaviour when timelineService is not provided', async () => {
      const db = await freshDb();
      try {
        await makeAgent(db, 'KAN-AS-6');
        const r1 = await makeRun(db, 'KAN-AS-6', 's1');
        await makeToolCall(db, r1, { tool: 'Bash', tokens: 100 });
        const detail = await new AgentsService({ db }).getByKey('KAN-AS-6');
        expect(detail?.tokens_by_tool).toEqual([
          {
            tool: 'Bash',
            tokens: { input: 0, output: 100, cacheCreation: 0, cacheRead: 0 },
            totalTokens: 100,
          },
        ]);
      } finally {
        await db.destroy();
      }
    });

    it('gracefully no-ops when the JSONL transcript is missing', async () => {
      const db = await freshDb();
      try {
        await makeAgent(db, 'KAN-AS-7');
        const r1 = await makeRun(db, 'KAN-AS-7', 's1');
        await makeToolCall(db, r1, { tool: 'Bash', tokens: 100 });
        const tl = new TimelineService({ resolveJsonlPath: async () => null });
        const detail = await new AgentsService({ db, timelineService: tl }).getByKey('KAN-AS-7');
        expect(detail?.tokens_by_tool).toEqual([
          {
            tool: 'Bash',
            tokens: { input: 0, output: 100, cacheCreation: 0, cacheRead: 0 },
            totalTokens: 100,
          },
        ]);
      } finally {
        await db.destroy();
      }
    });
  });

  // CREW-195: per-category buckets enable cost-weighted display in the
  // dashboard. The Assistant row also tracks input + cache fields, and
  // AgentDetail surfaces the dominant model so the dashboard can pick rates.
  describe('cost-weighting foundation (CREW-195)', () => {
    it('Assistant bucket includes input + cache fields from text-only turns', async () => {
      const db = await freshDb();
      try {
        await makeAgent(db, 'KAN-CW-1');
        await makeRun(db, 'KAN-CW-1', 's1');
        const path = writeTranscriptJsonl([
          makeAssistantEventLine({
            text: 'thinking…',
            inputTokens: 200,
            outputTokens: 50,
            cacheReadTokens: 5000,
            cacheCreationTokens: 100,
          }),
        ]);
        const detail = await new AgentsService({
          db,
          timelineService: makeTimelineForPath(path),
        }).getByKey('KAN-CW-1');
        const assistant = detail?.tokens_by_tool.find((r) => r.tool === 'Assistant');
        expect(assistant?.tokens).toEqual({
          input: 200,
          output: 50,
          cacheCreation: 100,
          cacheRead: 5000,
        });
        expect(assistant?.totalTokens).toBe(200 + 50 + 100 + 5000);
      } finally {
        await db.destroy();
      }
    });

    it('exposes the dominant model on AgentDetail (mode of message.model)', async () => {
      const db = await freshDb();
      try {
        await makeAgent(db, 'KAN-CW-2');
        await makeRun(db, 'KAN-CW-2', 's1');
        const path = writeTranscriptJsonl([
          makeAssistantEventLine({ model: 'claude-sonnet-4-6', text: 'a', outputTokens: 1 }),
          makeAssistantEventLine({ model: 'claude-sonnet-4-6', text: 'b', outputTokens: 1 }),
          makeAssistantEventLine({ model: 'claude-haiku-4-5', text: 'c', outputTokens: 1 }),
        ]);
        const detail = await new AgentsService({
          db,
          timelineService: makeTimelineForPath(path),
        }).getByKey('KAN-CW-2');
        expect(detail?.model).toBe('claude-sonnet-4-6');
      } finally {
        await db.destroy();
      }
    });

    it('falls back to empty model string when transcript has no assistant events', async () => {
      const db = await freshDb();
      try {
        await makeAgent(db, 'KAN-CW-3');
        await makeRun(db, 'KAN-CW-3', 's1');
        const detail = await new AgentsService({ db }).getByKey('KAN-CW-3');
        expect(detail?.model).toBe('');
      } finally {
        await db.destroy();
      }
    });
  });
});

describe('AgentsService.getByKey pr_merged (CREW-202)', () => {
  it('returns pr_merged when latest state_transitions row is pr_merged', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-PM-G', { prUrl: 'https://github.com/x/y/pull/1' });
      const r1 = await makeRun(db, 'KAN-PM-G', 's-pm-g', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, r1, {
        tool: 'Bash',
        summary: 'gh pr create --title hi',
        tokens: 1,
      });
      await makeStateTransition(db, 'KAN-PM-G', 'pr_merged', 2000, 'pr_open');
      const detail = await new AgentsService({ db }).getByKey('KAN-PM-G');
      expect(detail?.state).toBe('pr_merged');
    } finally {
      await db.destroy();
    }
  });

  it('returns finished over pr_merged when a finish run has completed', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-PM-GF', { prUrl: 'https://github.com/x/y/pull/2' });
      const r1 = await makeRun(db, 'KAN-PM-GF', 's-pm-gf', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, r1, {
        tool: 'Bash',
        summary: 'gh pr create --title hi',
        tokens: 1,
      });
      await makeStateTransition(db, 'KAN-PM-GF', 'pr_merged', 2000, 'pr_open');
      await makeRun(db, 'KAN-PM-GF', `finish-KAN-PM-GF-${'d'.repeat(8)}`, {
        command: 'finish',
        completedAt: '2026-04-29T14:00:00Z',
        exitCode: 0,
      });
      const detail = await new AgentsService({ db }).getByKey('KAN-PM-GF');
      expect(detail?.state).toBe('finished');
    } finally {
      await db.destroy();
    }
  });
});

describe('AgentsService.countByProject', () => {
  it('returns an empty map when no agents exist', async () => {
    const db = await freshDb();
    try {
      const svc = new AgentsService({ db });
      expect(await svc.countByProject()).toEqual(new Map());
    } finally {
      await db.destroy();
    }
  });

  it('returns one entry per project with the number of registered agents', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-A', { projectName: 'kanban' });
      await makeAgent(db, 'KAN-B', { projectName: 'kanban' });
      await makeAgent(db, 'KAN-C', { projectName: 'kanban' });
      await makeAgent(db, 'REC-A', { projectName: 'recipes' });
      const svc = new AgentsService({ db });
      const counts = await svc.countByProject();
      expect(counts.get('kanban')).toBe(3);
      expect(counts.get('recipes')).toBe(1);
    } finally {
      await db.destroy();
    }
  });

  it('omits projects with no agents', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'X-1', { projectName: 'has-agents' });
      const counts = await new AgentsService({ db }).countByProject();
      expect(counts.has('has-agents')).toBe(true);
      expect(counts.has('absent')).toBe(false);
    } finally {
      await db.destroy();
    }
  });
});

describe('AgentsService.getStateHistory', () => {
  it('returns transitions ordered by ts ascending', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-1');
      // Insert out of order to prove the query orders by ts.
      await makeStateTransition(db, 'KAN-1', 'pr_open', 3000, 'running');
      await makeStateTransition(db, 'KAN-1', 'init', 1000, null);
      await makeStateTransition(db, 'KAN-1', 'running', 2000, 'init');
      const out = await new AgentsService({ db }).getStateHistory('KAN-1');
      expect(out.transitions.map((t) => t.to)).toEqual(['init', 'running', 'pr_open']);
      expect(out.transitions.map((t) => t.from)).toEqual([null, 'init', 'running']);
      expect(out.transitions.map((t) => t.ts)).toEqual([1000, 2000, 3000]);
    } finally {
      await db.destroy();
    }
  });

  it('returns an empty transitions list when none exist for the key', async () => {
    const db = await freshDb();
    try {
      const out = await new AgentsService({ db }).getStateHistory('NOPE-99');
      expect(out).toEqual({ transitions: [] });
    } finally {
      await db.destroy();
    }
  });

  it('only returns transitions for the requested agent', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-1');
      await makeAgent(db, 'KAN-2');
      await makeStateTransition(db, 'KAN-1', 'init', 100, null);
      await makeStateTransition(db, 'KAN-2', 'init', 200, null);
      await makeStateTransition(db, 'KAN-2', 'running', 300, 'init');
      const out = await new AgentsService({ db }).getStateHistory('KAN-2');
      expect(out.transitions).toHaveLength(2);
      expect(out.transitions.map((t) => t.to)).toEqual(['init', 'running']);
    } finally {
      await db.destroy();
    }
  });
});

describe('AgentsService.updateTicketTitle', () => {
  it('updates the ticket_title for an existing agent and returns true', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-23', { ticketTitle: null });
      const svc = new AgentsService({ db });
      const updated = await svc.updateTicketTitle('KAN-23', 'Add board archival endpoint');
      expect(updated).toBe(true);
      const row = await db
        .selectFrom('agents')
        .select(['ticket_title'])
        .where('key', '=', 'KAN-23')
        .executeTakeFirst();
      expect(row?.ticket_title).toBe('Add board archival endpoint');
    } finally {
      await db.destroy();
    }
  });

  it('stores NULL when passed an empty string (matches registerRun upsert contract)', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-23', { ticketTitle: 'existing' });
      const svc = new AgentsService({ db });
      const updated = await svc.updateTicketTitle('KAN-23', '');
      expect(updated).toBe(true);
      const row = await db
        .selectFrom('agents')
        .select(['ticket_title'])
        .where('key', '=', 'KAN-23')
        .executeTakeFirst();
      expect(row?.ticket_title).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  it('returns false when no agent matches the key', async () => {
    const db = await freshDb();
    try {
      const svc = new AgentsService({ db });
      const updated = await svc.updateTicketTitle('KAN-999', 'anything');
      expect(updated).toBe(false);
    } finally {
      await db.destroy();
    }
  });
});
