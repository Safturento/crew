import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { parseTranscript } from 'crew-shared';
import type { TranscriptEvent, ToolUseContent } from 'crew-shared';

const DEFAULT_PROJECTS_ROOT = join(homedir(), '.claude', 'projects');
const DEFAULT_RUNNING_WINDOW_MS = 60_000;

export interface ListSessionsForRepoOptions {
  /** Absolute path to the repo root (e.g. `/home/u/Repo`). */
  repoPath: string;
  /** Override `~/.claude/projects/` for testing. */
  projectsRoot?: string;
  /** Window during which a session counts as "running" if it has no last-prompt event. */
  runningWindowMs?: number;
  /** Override `Date.now()` for deterministic running checks (testing). */
  now?: () => number;
}

export interface SessionSummary {
  sessionId: string;
  transcriptPath: string;
  worktreePath: string;
  branch: string | null;
  toolCalls: number;
  outputTokens: number;
  lastModified: Date;
  lastToolName: string | null;
  running: boolean;
}

/**
 * Discover all Claude Code sessions that belong to a registered repo. A
 * session "belongs" if its project directory matches the repo's encoded path
 * exactly, or starts with `<encoded>-` (i.e. a sibling worktree named
 * `<basename>-<KEY>`). Returns one summary per `.jsonl` file, sorted by
 * `lastModified` descending.
 */
export function listSessionsForRepo(opts: ListSessionsForRepoOptions): SessionSummary[] {
  const projectsRoot = opts.projectsRoot ?? DEFAULT_PROJECTS_ROOT;
  if (!existsSync(projectsRoot)) return [];

  const repoEncoded = opts.repoPath.replace(/\//g, '-');
  const runningWindow = opts.runningWindowMs ?? DEFAULT_RUNNING_WINDOW_MS;
  const now = opts.now ? opts.now() : Date.now();

  const summaries: SessionSummary[] = [];
  for (const entry of readdirSync(projectsRoot)) {
    if (entry !== repoEncoded && !entry.startsWith(`${repoEncoded}-`)) continue;
    const projectDir = join(projectsRoot, entry);
    if (!statSync(projectDir).isDirectory()) continue;

    // Decode by slicing off the matched repo-encoded prefix and reattaching
    // the remainder. We can't naively swap every `-` back to `/` because
    // worktree basenames legitimately contain `-` (e.g. `Repo-KAN-23`).
    const worktreePath =
      entry === repoEncoded ? opts.repoPath : opts.repoPath + entry.slice(repoEncoded.length);
    for (const file of readdirSync(projectDir)) {
      if (!file.endsWith('.jsonl')) continue;
      const fullPath = join(projectDir, file);
      const stat = statSync(fullPath);
      const events = parseTranscript(readFileSync(fullPath, 'utf8'));

      summaries.push(
        summarize({
          events,
          sessionId: basename(file, '.jsonl'),
          transcriptPath: fullPath,
          worktreePath,
          lastModified: stat.mtime,
          now,
          runningWindow,
        }),
      );
    }
  }

  summaries.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  return summaries;
}

interface SummarizeArgs {
  events: TranscriptEvent[];
  sessionId: string;
  transcriptPath: string;
  worktreePath: string;
  lastModified: Date;
  now: number;
  runningWindow: number;
}

function summarize(args: SummarizeArgs): SessionSummary {
  let toolCalls = 0;
  let outputTokens = 0;
  let branch: string | null = null;
  let lastToolName: string | null = null;

  for (const event of args.events) {
    if (event.type === 'assistant' || event.type === 'user') {
      if (!branch && event.gitBranch) branch = event.gitBranch;
    }
    if (event.type !== 'assistant') continue;
    outputTokens += event.message.usage.output_tokens;
    const toolUse = event.message.content.find((c): c is ToolUseContent => c.type === 'tool_use');
    if (!toolUse) continue;
    toolCalls += 1;
    lastToolName = toolUse.name;
  }

  // mtime-based: a transcript appended to within `runningWindowMs` is
  // assumed live. The `last-prompt` sentinel is not usable here — Claude
  // writes one per turn (for resume support), not at session end.
  const running = args.now - args.lastModified.getTime() <= args.runningWindow;

  return {
    sessionId: args.sessionId,
    transcriptPath: args.transcriptPath,
    worktreePath: args.worktreePath,
    branch,
    toolCalls,
    outputTokens,
    lastModified: args.lastModified,
    lastToolName,
    running,
  };
}
