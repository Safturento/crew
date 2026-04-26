import { Command } from 'commander';
import Table from 'cli-table3';
import pc from 'picocolors';
import {
  discoverProjectConfig,
  listSessionsForRepo,
  loadProjectConfigByName,
  type SessionSummary,
} from '../lib/index.js';

export interface ListOptions {
  all?: boolean;
  running?: boolean;
  /** Override Date.now for deterministic age formatting (testing). */
  now?: number;
}

const FINISHED_DEFAULT_LIMIT = 5;
const ALL_WINDOW_MS = 24 * 60 * 60_000;

/**
 * Apply --running / --all filters and the default "running + last 5 finished"
 * shape. Pure: takes pre-discovered sessions, returns the slice to render.
 */
export function selectSessionsToShow(
  sessions: SessionSummary[],
  opts: ListOptions = {},
): SessionSummary[] {
  const now = opts.now ?? Date.now();
  const sorted = [...sessions].sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

  if (opts.running) {
    return sorted.filter((s) => s.running);
  }

  if (opts.all) {
    return sorted.filter((s) => now - s.lastModified.getTime() <= ALL_WINDOW_MS);
  }

  const running = sorted.filter((s) => s.running);
  const finished = sorted.filter((s) => !s.running).slice(0, FINISHED_DEFAULT_LIMIT);
  return [...running, ...finished];
}

/**
 * Render a table of sessions. Returns the rendered string so it's easy to
 * snapshot in tests; the CLI command just `console.log`s the result.
 */
export function formatListTable(sessions: SessionSummary[], opts: { now?: number } = {}): string {
  if (sessions.length === 0) return 'no sessions';

  const now = opts.now ?? Date.now();
  const table = new Table({
    head: ['', 'KEY', 'branch', 'tools', 'tokens', 'age', 'last-tool'],
    style: { head: ['dim'], border: ['dim'] },
  });

  for (const s of sessions) {
    const status = s.running ? pc.green('●') : pc.dim('·');
    const key = ticketKeyFromBranch(s.branch);
    table.push([
      status,
      key ?? pc.dim('—'),
      s.branch ?? pc.dim('—'),
      String(s.toolCalls),
      formatTokens(s.outputTokens),
      formatAge(now - s.lastModified.getTime()),
      s.lastToolName ?? pc.dim('—'),
    ]);
  }

  return table.toString();
}

function ticketKeyFromBranch(branch: string | null): string | null {
  if (!branch) return null;
  const match = branch.match(/^[A-Z][A-Z0-9_]+-\d+$/);
  return match ? branch : null;
}

function formatTokens(n: number): string {
  if (n >= 10_000) return `${Math.floor(n / 1000)}k`;
  if (n >= 1000) return `${(Math.floor((n * 10) / 1000) / 10).toString()}k`;
  return String(n);
}

function formatAge(ms: number): string {
  if (ms < 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) return remMinutes === 0 ? `${hours}h` : `${hours}h ${remMinutes}m`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export const listCommand = new Command('list')
  .description('list claude code sessions for the current project')
  .option('--all', 'include finished runs from the last 24 hours')
  .option('--running', 'show only sessions whose claude process is still active')
  .option('--project <name>', 'use a specific project config instead of auto-discovering')
  .action(async (options: { all?: boolean; running?: boolean; project?: string }) => {
    const config = options.project
      ? loadProjectConfigByName(options.project)
      : await discoverProjectConfig(process.cwd());

    if (!config) {
      console.error(
        pc.red('error:'),
        'no crew project config matches this repository — pass --project <name> or configure ~/.config/crew/projects/<name>.toml',
      );
      process.exit(1);
    }

    const sessions = listSessionsForRepo({ repoPath: config.repo_path });
    const visible = selectSessionsToShow(sessions, {
      all: options.all,
      running: options.running,
    });

    console.log(formatListTable(visible));
  });
