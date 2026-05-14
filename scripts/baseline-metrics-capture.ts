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
interface TranscriptEvent {
  message?: {
    content?: ToolUseItem[];
    usage?: { input_tokens?: number };
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

function lastInputTokens(events: TranscriptEvent[]): number {
  for (let i = events.length - 1; i >= 0; i--) {
    const usage = events[i].message?.usage;
    if (usage?.input_tokens) return usage.input_tokens;
  }
  return 0;
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

  db.exec(`CREATE TABLE IF NOT EXISTS baseline_metrics (
    run_id INTEGER PRIMARY KEY,
    cleanliness_pass_count INTEGER,
    pr_claim_input_tokens INTEGER,
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
    const tokens = lastInputTokens(events);
    db.prepare(
      `INSERT OR REPLACE INTO baseline_metrics (run_id, cleanliness_pass_count, pr_claim_input_tokens, captured_at)
       VALUES (?, ?, ?, ?)`,
    ).run(row.id, cleanlinessCount, tokens, new Date().toISOString());
    console.log(
      `run ${row.id}: cleanliness=${cleanlinessCount}/${CLEANLINESS_COMMANDS.length}, tokens=${tokens}`,
    );
  }
  console.log('baseline capture complete');
  db.close();
}

void main();
