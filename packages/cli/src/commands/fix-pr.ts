import { Command } from 'commander';
import { execa } from 'execa';
import { existsSync, readFileSync } from 'node:fs';
import { stdin as processStdin } from 'node:process';
import type { Readable } from 'node:stream';
import {
  assemblePrFeedback,
  buildFixPrPrompt,
  fetchOrigin,
  findLatestSession,
  formatToolCall,
  getPrForBranch,
  hasUncommittedChanges,
  NO_FEEDBACK_MARKER,
  parseToolCall,
  parseTranscript,
  rebaseOnto,
  resolveWorktreePath,
  spawnClaudeResume,
  tailTranscript,
} from '../lib/index.js';

export type FeedbackMode = { kind: 'pr' } | { kind: 'file'; path: string } | { kind: 'stdin' };

export interface LoadFeedbackOptions {
  key: string;
  mode: FeedbackMode;
  branch?: string;
}

export interface LoadFeedbackDeps {
  stdin?: Readable;
}

export interface LoadedFeedback {
  feedback: string;
  source: string;
}

export function parseGithubPrUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\//);
  if (!match) return null;
  const [, owner, repo] = match;
  if (!owner || !repo) return null;
  return { owner, repo };
}

export async function loadFeedback(
  opts: LoadFeedbackOptions,
  deps: LoadFeedbackDeps = {},
): Promise<LoadedFeedback> {
  if (opts.mode.kind === 'file') {
    const path = opts.mode.path;
    if (!existsSync(path)) {
      throw new Error(`feedback file not found: ${path}`);
    }
    return { feedback: readFileSync(path, 'utf8'), source: `file: ${path}` };
  }

  if (opts.mode.kind === 'stdin') {
    const stream = deps.stdin ?? processStdin;
    const text = await readStreamToString(stream);
    if (text.length === 0) {
      throw new Error('empty feedback on stdin');
    }
    return { feedback: text, source: 'stdin' };
  }

  const branch = opts.branch ?? opts.key;
  const pr = await getPrForBranch(branch);
  if (!pr) {
    throw new Error(
      `no PR found on branch ${branch}. Open one first or use --from-file / --from-stdin.`,
    );
  }
  const slug = parseGithubPrUrl(pr.url);
  if (!slug) {
    throw new Error(`could not parse owner/repo from PR url: ${pr.url}`);
  }
  const md = await assemblePrFeedback({
    owner: slug.owner,
    repo: slug.repo,
    prNumber: pr.number,
    prUrl: pr.url,
  });
  return { feedback: md, source: `auto-pulled from GitHub PR for ${opts.key}` };
}

async function readStreamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks).toString('utf8');
}

interface FixPrFlags {
  fromPr?: boolean;
  fromFile?: string;
  fromStdin?: boolean;
}

function selectMode(flags: FixPrFlags): FeedbackMode {
  const explicit = [
    flags.fromPr ? 'pr' : null,
    flags.fromFile !== undefined ? 'file' : null,
    flags.fromStdin ? 'stdin' : null,
  ].filter(Boolean);
  if (explicit.length > 1) {
    throw new Error('--from-pr, --from-file, and --from-stdin are mutually exclusive');
  }
  if (flags.fromFile !== undefined) return { kind: 'file', path: flags.fromFile };
  if (flags.fromStdin) return { kind: 'stdin' };
  return { kind: 'pr' };
}

export const fixPrCommand = new Command('fix-pr')
  .description("Resume the worktree's Claude Code session with review feedback")
  .argument('<key>', 'Jira ticket key (e.g. KAN-23)')
  .option('--from-pr', 'Auto-pull feedback from the open PR for the branch (default)')
  .option('--from-file <path>', 'Read feedback from a file at <path>')
  .option('--from-stdin', 'Read feedback piped on stdin')
  .action(async (key: string, flags: FixPrFlags) => {
    await runFixPr(key, flags);
  });

async function runFixPr(key: string, flags: FixPrFlags): Promise<void> {
  const mode = selectMode(flags);

  const { stdout: gitTop } = await execa('git', ['rev-parse', '--show-toplevel']);
  const repoTop = gitTop.trim();
  const worktree = repoTop.endsWith(`-${key}`) ? repoTop : resolveWorktreePath(repoTop, key);

  if (!existsSync(worktree)) {
    throw new Error(
      `worktree not found: ${worktree}\nfix-pr only resumes existing sessions; run 'crew run ${key}' for a fresh agent.`,
    );
  }

  const session = findLatestSession({ worktree });
  if (!session) {
    throw new Error(
      `no prior Claude Code session found for ${worktree}.\nRun 'crew run ${key}' first.`,
    );
  }

  if (await hasUncommittedChanges(worktree)) {
    throw new Error(
      `${worktree} has uncommitted changes — auto-rebase would be unsafe.\nCommit, stash, or discard first.`,
    );
  }

  const { feedback, source } = await loadFeedback({ key, mode, branch: key });
  if (feedback.startsWith(NO_FEEDBACK_MARKER)) {
    process.stderr.write(`${feedback}\n→ Nothing to apply. Exiting.\n`);
    return;
  }

  process.stderr.write('→ Fetching origin/main and rebasing on top…\n');
  let conflicts: string[] | undefined;
  try {
    await fetchOrigin(worktree, 'main');
    const result = await rebaseOnto(worktree, 'origin/main');
    if (!result.ok) {
      conflicts = result.conflicts;
      process.stderr.write(
        `\n→ Rebase produced conflicts. Handing off to the agent for resolution.\n` +
          `  Affected files:\n` +
          conflicts.map((f) => `      ${f}`).join('\n') +
          `\n  The agent will resolve, run verification, and stop SHORT of pushing.\n\n`,
      );
    }
  } catch (err) {
    throw new Error(
      `rebase failed for an unexpected reason — worktree left as-is for manual inspection:\n  cd ${worktree}\n  git status`,
      { cause: err },
    );
  }

  const prompt = buildFixPrPrompt({
    key,
    feedback,
    feedbackSource: source,
    conflictFiles: conflicts,
  });

  const logFile = `/tmp/crew-fix-pr-${key}.log`;
  process.stderr.write(
    `→ Resuming session for ${key}\n` +
      `  worktree:  ${worktree}\n` +
      `  session:   ${session.sessionId}\n` +
      `  feedback:  ${source}\n` +
      `  log:       ${logFile}\n\n` +
      `→ Watching ${session.transcriptPath} (new events only). Ctrl+C to abort.\n\n`,
  );

  const sub = spawnClaudeResume({
    sessionId: session.sessionId,
    prompt,
    logFile,
  });

  const onSignal = (): void => {
    process.stderr.write('\n→ Aborting…\n');
    sub.kill('SIGTERM');
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    await tailTranscript({
      transcriptPath: session.transcriptPath,
      until: sub,
      onLine: (line) => {
        for (const event of parseTranscript(line)) {
          const call = parseToolCall(event);
          if (call) process.stdout.write(`${formatToolCall(call)}\n`);
        }
      },
    });
    await sub;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }

  const log = existsSync(logFile) ? readFileSync(logFile, 'utf8') : '';
  process.stdout.write(
    `\n─────────────────────────────────────────────────────────────\n` +
      `→ Run finished. Final claude output:\n` +
      `  (full log: ${logFile})\n` +
      `─────────────────────────────────────────────────────────────\n\n` +
      log +
      '\n',
  );

  if (conflicts && conflicts.length > 0) {
    process.stdout.write(
      `\n─────────────────────────────────────────────────────────────\n` +
        `⚠  Conflicts were resolved during this run — nothing has been pushed.\n` +
        `   Inspect the resolution before shipping:\n` +
        `     cd ${worktree}\n` +
        `     git log --oneline origin/${key}..HEAD     # commits to review\n` +
        `     git diff origin/${key}..HEAD              # full diff of pending push\n` +
        `   When you're satisfied:\n` +
        `     git push --force-with-lease origin ${key}\n` +
        `─────────────────────────────────────────────────────────────\n`,
    );
  } else {
    process.stdout.write(
      `\n→ Push when ready:\n` + `     git push --force-with-lease origin ${key}\n`,
    );
  }
}
