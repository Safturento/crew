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
  type: 'tool_use';
  id?: string;
  name?: string;
  input?: { command?: string };
}

interface ToolResultItem {
  type: 'tool_result';
  tool_use_id?: string;
  content?: string | Array<{ type?: string; text?: string }>;
}

interface OtherContentItem {
  type?: string;
}

type ContentItem = ToolUseItem | ToolResultItem | OtherContentItem;

export interface TranscriptEvent {
  type?: string;
  subtype?: string;
  compactMetadata?: {
    trigger?: 'manual' | 'auto';
    preTokens?: number;
    durationMs?: number;
  };
  message?: {
    content?: ContentItem[];
    usage?: {
      input_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
      output_tokens?: number;
    };
  };
}

export interface PerTurnRow {
  turn_index: number;
  uncached_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_tokens: number;
  output_tokens: number;
  tool_calls_this_turn: number;
  tool_calls_breakdown: Record<string, number>;
}

export interface ToolBreakdownEntry {
  calls: number;
  result_tokens_est: number;
}

export interface AggregatedStats {
  prClaim: { total: number; uncached: number; cacheRead: number; cacheCreate: number };
  output: { total: number; meanPerTurn: number; maxPerTurn: number };
  toolBreakdown: Record<string, ToolBreakdownEntry>;
  maxToolResultSizeTokens: number;
  perTurnRows: PerTurnRow[];
  turnCount: number;
  toolCallCount: number;
}

// Estimate tool_result content size in tokens via the chars/4 heuristic
// (Claude's standard rule of thumb). ~10% error; documented in the spec.
function toolResultTokens(content: ToolResultItem['content']): number {
  if (typeof content === 'string') return Math.floor(content.length / 4);
  if (Array.isArray(content)) {
    const chars = content.reduce((sum, c) => sum + (c.text?.length ?? 0), 0);
    return Math.floor(chars / 4);
  }
  return 0;
}

export function aggregateTokenStats(events: TranscriptEvent[]): AggregatedStats {
  const perTurnRows: PerTurnRow[] = [];
  const toolBreakdown: Record<string, ToolBreakdownEntry> = {};
  const toolUseIdToName = new Map<string, string>();
  let outputTotal = 0;
  let outputMax = 0;
  let toolCallCount = 0;
  let maxToolResultSizeTokens = 0;
  let prClaim = { total: 0, uncached: 0, cacheRead: 0, cacheCreate: 0 };

  for (const ev of events) {
    const items = ev.message?.content ?? [];
    const thisTurnBreakdown: Record<string, number> = {};
    let thisTurnToolUses = 0;
    for (const item of items) {
      if (item.type === 'tool_use') {
        thisTurnToolUses++;
        toolCallCount++;
        const name = item.name ?? 'unknown';
        thisTurnBreakdown[name] = (thisTurnBreakdown[name] ?? 0) + 1;
        toolBreakdown[name] ??= { calls: 0, result_tokens_est: 0 };
        toolBreakdown[name].calls++;
        if (item.id) toolUseIdToName.set(item.id, name);
      } else if (item.type === 'tool_result') {
        const tokens = toolResultTokens(item.content);
        if (tokens > maxToolResultSizeTokens) maxToolResultSizeTokens = tokens;
        const name = item.tool_use_id ? toolUseIdToName.get(item.tool_use_id) : undefined;
        if (name) {
          toolBreakdown[name] ??= { calls: 0, result_tokens_est: 0 };
          toolBreakdown[name].result_tokens_est += tokens;
        }
      }
    }
    const u = ev.message?.usage;
    if (!u) continue;
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
    perTurnRows.push({
      turn_index: perTurnRows.length,
      uncached_tokens: uncached,
      cache_read_tokens: cacheRead,
      cache_creation_tokens: cacheCreate,
      total_tokens: total,
      output_tokens: output,
      tool_calls_this_turn: thisTurnToolUses,
      tool_calls_breakdown: thisTurnBreakdown,
    });
  }

  return {
    prClaim,
    output: {
      total: outputTotal,
      meanPerTurn: perTurnRows.length > 0 ? Math.floor(outputTotal / perTurnRows.length) : 0,
      maxPerTurn: outputMax,
    },
    toolBreakdown,
    maxToolResultSizeTokens,
    perTurnRows,
    turnCount: perTurnRows.length,
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
      if (item.type === 'tool_use' && item.name === 'Bash' && 'input' in item && item.input?.command) {
        out.push(item.input.command);
      }
    }
  }
  return out;
}

function countCleanlinessChecks(commands: string[]): number {
  return CLEANLINESS_COMMANDS.filter((c) => commands.some((b) => b.includes(c))).length;
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

  // Throwaway snapshot tables — script is meant to be re-runnable. Drop and
  // recreate so schema changes between runs don't require a separate migration.
  db.exec(`DROP TABLE IF EXISTS baseline_metrics`);
  db.exec(`DROP TABLE IF EXISTS baseline_metrics_per_turn`);
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
    output_tokens_total INTEGER NOT NULL,
    output_tokens_mean_per_turn INTEGER NOT NULL,
    output_tokens_max_per_turn INTEGER NOT NULL,
    max_tool_result_size_tokens INTEGER NOT NULL,
    tool_token_breakdown TEXT NOT NULL,
    captured_at TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE baseline_metrics_per_turn (
    run_id INTEGER NOT NULL,
    turn_index INTEGER NOT NULL,
    uncached_tokens INTEGER NOT NULL,
    cache_read_tokens INTEGER NOT NULL,
    cache_creation_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    tool_calls_this_turn INTEGER NOT NULL,
    tool_calls_breakdown TEXT NOT NULL,
    PRIMARY KEY (run_id, turn_index)
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
    const compactions = compactionStats(events);
    const stats = aggregateTokenStats(events);
    db.prepare(
      `INSERT INTO baseline_metrics (
         run_id, cleanliness_pass_count, turn_count, tool_call_count,
         compaction_count, auto_compaction_count, max_pre_compact_tokens,
         pr_claim_input_tokens, pr_claim_uncached_tokens,
         pr_claim_cache_read_tokens, pr_claim_cache_creation_tokens,
         output_tokens_total, output_tokens_mean_per_turn, output_tokens_max_per_turn,
         max_tool_result_size_tokens, tool_token_breakdown,
         captured_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      row.id,
      cleanlinessCount,
      stats.turnCount,
      stats.toolCallCount,
      compactions.total,
      compactions.auto,
      compactions.maxPreTokens,
      stats.prClaim.total,
      stats.prClaim.uncached,
      stats.prClaim.cacheRead,
      stats.prClaim.cacheCreate,
      stats.output.total,
      stats.output.meanPerTurn,
      stats.output.maxPerTurn,
      stats.maxToolResultSizeTokens,
      JSON.stringify(stats.toolBreakdown),
      new Date().toISOString(),
    );
    const insertTurn = db.prepare(
      `INSERT INTO baseline_metrics_per_turn (
         run_id, turn_index,
         uncached_tokens, cache_read_tokens, cache_creation_tokens,
         total_tokens, output_tokens,
         tool_calls_this_turn, tool_calls_breakdown
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertAllTurns = db.transaction((turns: typeof stats.perTurnRows) => {
      for (const turn of turns) {
        insertTurn.run(
          row.id,
          turn.turn_index,
          turn.uncached_tokens,
          turn.cache_read_tokens,
          turn.cache_creation_tokens,
          turn.total_tokens,
          turn.output_tokens,
          turn.tool_calls_this_turn,
          JSON.stringify(turn.tool_calls_breakdown),
        );
      }
    });
    insertAllTurns(stats.perTurnRows);
    const compactSuffix =
      compactions.total > 0
        ? `, compact=${compactions.total}(${compactions.auto} auto, peak=${compactions.maxPreTokens})`
        : '';
    console.log(
      `run ${row.id}: cleanliness=${cleanlinessCount}/${CLEANLINESS_COMMANDS.length}, turns=${stats.turnCount}, tools=${stats.toolCallCount}, tokens=${stats.prClaim.total} (cached=${stats.prClaim.cacheRead})${compactSuffix}`,
    );
  }
  console.log('baseline capture complete');
  db.close();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
