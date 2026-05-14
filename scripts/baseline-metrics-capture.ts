import SqliteDatabase from 'better-sqlite3';
import * as path from 'node:path';
import * as os from 'node:os';
import { promises as fs } from 'node:fs';

const DB_PATH = process.env.CREW_DB_FILE ?? path.join(os.homedir(), '.config', 'crew', 'state.db');
const CLEANLINESS_COMMANDS = [
  'npm run lint',
  'npm run typecheck',
  'npm run test:run',
  'npm run format:check',
  'npm run bruno:smoke',
];

interface ToolUseItem {
  type: string;
  name?: string;
  input?: { command?: string };
}
export interface TranscriptEvent {
  type?: string;
  subtype?: string;
  compactMetadata?: {
    trigger?: 'manual' | 'auto';
    preTokens?: number;
    durationMs?: number;
  };
  message?: {
    content?: ToolUseItem[];
    usage?: {
      input_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
      output_tokens?: number;
    };
  };
}

export interface AggregatedStats {
  prClaim: { total: number; uncached: number; cacheRead: number; cacheCreate: number };
  output: { total: number; meanPerTurn: number; maxPerTurn: number };
  turnCount: number;
  toolCallCount: number;
}

export function aggregateTokenStats(events: TranscriptEvent[]): AggregatedStats {
  let outputTotal = 0;
  let outputMax = 0;
  let turnCount = 0;
  let toolCallCount = 0;
  let prClaim = { total: 0, uncached: 0, cacheRead: 0, cacheCreate: 0 };

  for (const ev of events) {
    for (const item of ev.message?.content ?? []) {
      if (item.type === 'tool_use') toolCallCount++;
    }
    const u = ev.message?.usage;
    if (!u) continue;
    turnCount++;
    const output = u.output_tokens ?? 0;
    outputTotal += output;
    if (output > outputMax) outputMax = output;
    const uncached = u.input_tokens ?? 0;
    const cacheRead = u.cache_read_input_tokens ?? 0;
    const cacheCreate = u.cache_creation_input_tokens ?? 0;
    const total = uncached + cacheRead + cacheCreate;
    if (total > 0) {
      prClaim = { total, uncached, cacheRead, cacheCreate };
    }
  }

  return {
    prClaim,
    output: {
      total: outputTotal,
      meanPerTurn: turnCount > 0 ? Math.floor(outputTotal / turnCount) : 0,
      maxPerTurn: outputMax,
    },
    turnCount,
    toolCallCount,
  };
}

async function readTranscript(jsonlPath: string): Promise<TranscriptEvent[]> {
  const raw = await fs.readFile(jsonlPath, 'utf8');
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TranscriptEvent);
}

function extractBashCommands(events: TranscriptEvent[]): string[] {
  const out: string[] = [];
  for (const ev of events) {
    const items = ev.message?.content ?? [];
    for (const item of items) {
      if (item.type === 'tool_use' && item.name === 'Bash' && item.input?.command) {
        out.push(item.input.command);
      }
    }
  }
  return out;
}

function countCleanlinessChecks(commands: string[]): number {
  return CLEANLINESS_COMMANDS.filter((c) => commands.some((b) => b.includes(c))).length;
}

interface PrClaimTokens {
  total: number;
  uncached: number;
  cacheRead: number;
  cacheCreate: number;
}

function lastPrClaimTokens(events: TranscriptEvent[]): PrClaimTokens {
  // Claude API splits prompt cost into input_tokens (uncached delta),
  // cache_read_input_tokens, and cache_creation_input_tokens. Total context
  // is the sum; the components answer the diagnostic question — did progress
  // come from loading less prior content (cacheRead ↓) or fewer per-turn
  // reads (uncached ↓)?
  for (let i = events.length - 1; i >= 0; i--) {
    const usage = events[i].message?.usage;
    if (!usage) continue;
    const uncached = usage.input_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cacheCreate = usage.cache_creation_input_tokens ?? 0;
    const total = uncached + cacheRead + cacheCreate;
    if (total > 0) return { total, uncached, cacheRead, cacheCreate };
  }
  return { total: 0, uncached: 0, cacheRead: 0, cacheCreate: 0 };
}

function countTurns(events: TranscriptEvent[]): number {
  // One usage block per assistant message — counts model invocations
  // regardless of how many tool calls each turn made.
  return events.filter((e) => e.message?.usage).length;
}

function countToolCalls(events: TranscriptEvent[]): number {
  let n = 0;
  for (const ev of events) {
    for (const item of ev.message?.content ?? []) {
      if (item.type === 'tool_use') n++;
    }
  }
  return n;
}

interface CompactionStats {
  total: number;
  auto: number;
  maxPreTokens: number;
}

function compactionStats(events: TranscriptEvent[]): CompactionStats {
  // compact_boundary events carry compactMetadata.trigger ("manual" / "auto")
  // and preTokens (context size right before compaction). Auto compactions are
  // the "filled the window" signal — ideal post-progressive-disclosure runs
  // never hit one. Manual compactions are user/agent grooming and worth
  // tracking separately.
  let total = 0;
  let auto = 0;
  let maxPreTokens = 0;
  for (const ev of events) {
    if (ev.type !== 'system' || ev.subtype !== 'compact_boundary') continue;
    total++;
    if (ev.compactMetadata?.trigger === 'auto') auto++;
    const pre = ev.compactMetadata?.preTokens ?? 0;
    if (pre > maxPreTokens) maxPreTokens = pre;
  }
  return { total, auto, maxPreTokens };
}

interface RunRow {
  id: number;
  session_id: string;
  agent_key: string;
  worktree_path: string;
}

async function main(): Promise<void> {
  try {
    await fs.access(DB_PATH);
  } catch {
    console.error(`daemon DB not found at ${DB_PATH}`);
    console.error('set CREW_DB_FILE to the canonical daemon state.db path');
    console.error('(for the docker stack, copy the volume contents out first)');
    process.exit(1);
  }

  const db = new SqliteDatabase(DB_PATH);

  const hasRunsTable = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='runs'`)
    .get() as { name: string } | undefined;
  if (!hasRunsTable) {
    console.error(`DB at ${DB_PATH} has no \`runs\` table — wrong DB?`);
    console.error('the canonical daemon DB lives in the `crew-state` docker volume');
    console.error('options: docker cp the volume out, or CREW_DB_FILE=/path/to/state.db');
    db.close();
    process.exit(1);
  }

  const rows = db
    .prepare(
      `SELECT runs.id, runs.session_id, runs.agent_key, agents.worktree_path
       FROM runs JOIN agents ON agents.key = runs.agent_key
       WHERE runs.command = 'run' AND runs.completed_at IS NOT NULL
       ORDER BY runs.completed_at DESC LIMIT 20`,
    )
    .all() as RunRow[];

  // Throwaway snapshot table — script is meant to be re-runnable. Drop and
  // recreate so schema changes between runs don't require a separate migration.
  db.exec(`DROP TABLE IF EXISTS baseline_metrics`);
  db.exec(`CREATE TABLE baseline_metrics (
    run_id INTEGER PRIMARY KEY,
    cleanliness_pass_count INTEGER,
    turn_count INTEGER,
    tool_call_count INTEGER,
    compaction_count INTEGER,
    auto_compaction_count INTEGER,
    max_pre_compact_tokens INTEGER,
    pr_claim_input_tokens INTEGER,
    pr_claim_uncached_tokens INTEGER,
    pr_claim_cache_read_tokens INTEGER,
    pr_claim_cache_creation_tokens INTEGER,
    captured_at TEXT NOT NULL
  )`);

  if (rows.length === 0) {
    console.log('no completed `crew run` rows found — nothing to baseline');
    db.close();
    return;
  }

  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  const projectDirs = await fs.readdir(projectsDir);

  for (const row of rows) {
    let transcriptPath: string | null = null;
    for (const pdir of projectDirs) {
      const candidate = path.join(projectsDir, pdir, `${row.session_id}.jsonl`);
      try {
        await fs.access(candidate);
        transcriptPath = candidate;
        break;
      } catch {
        // not found in this project dir, keep searching
      }
    }
    if (!transcriptPath) {
      console.warn(`run ${row.id}: transcript not found for session ${row.session_id}`);
      continue;
    }
    const events = await readTranscript(transcriptPath);
    const commands = extractBashCommands(events);
    const cleanlinessCount = countCleanlinessChecks(commands);
    const turns = countTurns(events);
    const toolCalls = countToolCalls(events);
    const compactions = compactionStats(events);
    const tokens = lastPrClaimTokens(events);
    db.prepare(
      `INSERT INTO baseline_metrics (
         run_id, cleanliness_pass_count, turn_count, tool_call_count,
         compaction_count, auto_compaction_count, max_pre_compact_tokens,
         pr_claim_input_tokens, pr_claim_uncached_tokens,
         pr_claim_cache_read_tokens, pr_claim_cache_creation_tokens,
         captured_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      row.id,
      cleanlinessCount,
      turns,
      toolCalls,
      compactions.total,
      compactions.auto,
      compactions.maxPreTokens,
      tokens.total,
      tokens.uncached,
      tokens.cacheRead,
      tokens.cacheCreate,
      new Date().toISOString(),
    );
    const compactSuffix =
      compactions.total > 0
        ? `, compact=${compactions.total}(${compactions.auto} auto, peak=${compactions.maxPreTokens})`
        : '';
    console.log(
      `run ${row.id}: cleanliness=${cleanlinessCount}/${CLEANLINESS_COMMANDS.length}, turns=${turns}, tools=${toolCalls}, tokens=${tokens.total} (cached=${tokens.cacheRead})${compactSuffix}`,
    );
  }
  console.log('baseline capture complete');
  db.close();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
