import { Command } from 'commander';
import pc from 'picocolors';
import {
  discoverProjectConfig,
  findLatestSessionForBranch,
  formatToolCall,
  getPrForBranch,
  loadProjectConfigByName,
  summarizeSessionStatus,
  type PrSummary,
  type SessionStatus,
  type SessionSummary,
} from '../lib/index.js';

export interface FormatStatusReportArgs {
  key: string;
  session: SessionSummary;
  status: SessionStatus;
  pr: PrSummary | null;
}

/**
 * Render a human-readable status report. Pure: takes the already-fetched
 * session, status, and PR info; returns a printable string.
 */
export function formatStatusReport(args: FormatStatusReportArgs): string {
  const { key, session, status, pr } = args;
  const lines: string[] = [];

  const stateLabel = session.running ? pc.green('● running') : pc.dim('· finished');
  lines.push(pc.bold(`${key}  `) + stateLabel);
  lines.push(pc.dim(`  worktree: ${session.worktreePath}`));
  lines.push(pc.dim(`  branch:   ${session.branch ?? '—'}`));
  lines.push(pc.dim(`  session:  ${session.sessionId}`));

  if (status.runtimeMs !== null) {
    lines.push(pc.dim(`  runtime:  ${formatDuration(status.runtimeMs)}`));
  }
  if (pr) {
    lines.push(pc.dim(`  PR:       #${pr.number} (${pr.state})  ${pr.url}`));
  }

  lines.push('');

  if (status.timeline.length === 0) {
    lines.push(pc.yellow('no tool calls in this session yet'));
    return lines.join('\n');
  }

  lines.push(pc.bold('current step:'));
  if (status.currentStep) {
    lines.push(`  ${formatToolCall(status.currentStep)}`);
  }
  lines.push('');

  lines.push(pc.bold(`tokens by tool  (total ${formatTokens(status.totalOutputTokens)}):`));
  const sortedTools = Object.entries(status.tokensByTool).sort((a, b) => b[1] - a[1]);
  for (const [tool, tokens] of sortedTools) {
    lines.push(`  ${tool.padEnd(12)} ${formatTokens(tokens)}`);
  }
  lines.push('');

  lines.push(pc.bold(`timeline (${status.timeline.length} calls):`));
  for (const call of status.timeline) {
    lines.push(`  ${formatToolCall(call)}`);
  }

  return lines.join('\n');
}

function formatTokens(n: number): string {
  if (n >= 10_000) return `${Math.floor(n / 1000)}k tok`;
  if (n >= 1000) return `${(Math.floor((n * 10) / 1000) / 10).toString()}k tok`;
  return `${n} tok`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes === 0 ? `${hours}h` : `${hours}h ${remMinutes}m`;
}

export const statusCommand = new Command('status')
  .description('show detailed status of the most recent session for a ticket key')
  .argument('<key>', 'ticket key, e.g. KAN-23 (matches gitBranch in transcripts)')
  .option('--project <name>', 'use a specific project config instead of auto-discovering')
  .action(async (key: string, options: { project?: string }) => {
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

    const session = findLatestSessionForBranch({ repoPath: config.repo_path, branch: key });
    if (!session) {
      console.error(pc.red('error:'), `no session found for branch ${key}`);
      process.exit(1);
    }

    const status = summarizeSessionStatus(session.transcriptPath);
    const pr = await getPrForBranch(key).catch(() => null);

    console.log(formatStatusReport({ key, session, status, pr }));
  });
