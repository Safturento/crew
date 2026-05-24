import { Command } from 'commander';
import { execa } from 'execa';
import { existsSync, readFileSync } from 'node:fs';
import {
  assemblePrFeedback,
  buildFixPrPrompt,
  discoverProjectConfig,
  fetchTicketSummaryFromEnv,
  findLatestSession,
  getHeadSha,
  getPrForBranch,
  hasUncommittedChanges,
  isMidRebase,
  NO_FEEDBACK_MARKER,
  resolveWorktreePath,
  spawnClaudeResume,
} from '../lib/index.js';
import { crewDaemonClientFromEnv } from '../lib/daemon-client/index.js';
import {
  brunoSmokeOptionsFor,
  needsDockerPorts,
  playwrightFixPrOptsFor,
  readDockerPortsFromEnvFile,
  readEnvBaseMap,
  streamTranscript,
} from '../lib/run/index.js';
import { runResumePreflight } from '../lib/preflight/index.js';
import { playwrightEnabled, resolveAppUrl, type DockerPorts } from '../lib/mcp-config/index.js';
import { emitStartupEvent } from '../lib/startup-events/index.js';

export type FeedbackMode =
  | { kind: 'pr' }
  | { kind: 'file'; path: string }
  | { kind: 'message'; message: string };

export interface LoadFeedbackOptions {
  key: string;
  mode: FeedbackMode;
  branch?: string;
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

export async function loadFeedback(opts: LoadFeedbackOptions): Promise<LoadedFeedback> {
  if (opts.mode.kind === 'file') {
    const path = opts.mode.path;
    if (!existsSync(path)) {
      throw new Error(`feedback file not found: ${path}`);
    }
    return { feedback: readFileSync(path, 'utf8'), source: `file: ${path}` };
  }

  if (opts.mode.kind === 'message') {
    const msg = opts.mode.message;
    if (msg.trim().length === 0) {
      throw new Error('empty message provided to -m');
    }
    return { feedback: msg, source: 'inline message' };
  }

  const branch = opts.branch ?? opts.key;
  const pr = await getPrForBranch(branch, 'open');
  if (!pr) {
    throw new Error(
      `no open PR found on branch ${branch}. Open one first or use --from-file or -m '<msg>'.`,
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

interface FixPrFlags {
  fromPr?: boolean;
  fromFile?: string;
  message?: string;
}

function selectMode(flags: FixPrFlags): FeedbackMode {
  const explicit = [
    flags.fromPr ? 'pr' : null,
    flags.fromFile !== undefined ? 'file' : null,
    flags.message !== undefined ? 'message' : null,
  ].filter(Boolean);
  if (explicit.length > 1) {
    throw new Error('--from-pr, --from-file, and -m are mutually exclusive');
  }
  if (flags.fromFile !== undefined) return { kind: 'file', path: flags.fromFile };
  if (flags.message !== undefined) return { kind: 'message', message: flags.message };
  return { kind: 'pr' };
}

export const fixPrCommand = new Command('fix-pr')
  .description("Resume the worktree's Claude Code session with review feedback")
  .argument('<key>', 'Jira ticket key (e.g. KAN-23)', (v) => v.toUpperCase())
  .option('--from-pr', 'Auto-pull feedback from the open PR for the branch (default)')
  .option('--from-file <path>', 'Read feedback from a file at <path>')
  .option(
    '-m, --message <message>',
    "inline feedback message (e.g. -m 'the test on line 42 is failing')",
  )
  .action(async (key: string, flags: FixPrFlags) => {
    await runFixPr(key, flags);
  });

function repoPathFromWorktree(worktree: string, key: string): string {
  const suffix = `-${key}`;
  return worktree.endsWith(suffix) ? worktree.slice(0, -suffix.length) : worktree;
}

export function formatLeftoverRebaseError(opts: { worktree: string; key: string }): string {
  return (
    `${opts.worktree} is mid-rebase from a prior run. Recover with:\n` +
    `  cd ${opts.worktree} && git rebase --abort\n` +
    `Then re-run crew fix-pr ${opts.key}.`
  );
}

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

  // Leftover-rebase guard (CREW-110): detect a worktree stranded mid-rebase by
  // a prior failed run and fail fast with a tailored recovery message before
  // touching docker or git status. This branches *before* the uncommitted-
  // changes check so the user gets recovery guidance instead of the generic
  // "commit, stash, or discard" path.
  if (await isMidRebase(worktree)) {
    throw new Error(formatLeftoverRebaseError({ worktree, key }));
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

  const repoPath = repoPathFromWorktree(worktree, key);
  const projectConfig = await discoverProjectConfig(repoPath);

  // Lift the .env port read so both bruno-smoke and playwright share a single
  // source of dockerPorts. Only read when something actually needs ports.
  const dockerPorts: DockerPorts | undefined =
    projectConfig && needsDockerPorts(projectConfig)
      ? readDockerPortsFromEnvFile(worktree)
      : undefined;
  // env-spec projects: read the materialized .env so ${VAR} placeholders in
  // app_url / base_url resolve. undefined for legacy projects.
  const envVars = projectConfig ? readEnvBaseMap(worktree) : undefined;

  const brunoSmoke = projectConfig
    ? brunoSmokeOptionsFor(projectConfig, worktree, dockerPorts, envVars)
    : undefined;

  let resolvedAppUrl: string | undefined;
  let pwEnabled = false;
  if (projectConfig) {
    pwEnabled = playwrightEnabled(projectConfig);
    if (pwEnabled && projectConfig.playwright) {
      resolvedAppUrl = resolveAppUrl(projectConfig.playwright.app_url, dockerPorts, envVars).raw;
    }
    // CREW-201: preflight phase is the only pre-spawn work fix-pr does
    // (worktree, env, npm, docker, mcp are all reused from the prior
    // `crew run`). Bracket it so the dashboard's drawer Timeline shows
    // a Preflight row before the claude spawn lands.
    const preflightStartedAt = Date.now();
    await emitStartupEvent(key, {
      type: 'system',
      subtype: 'crew_startup_preflight',
      status: 'started',
      timestamp: new Date().toISOString(),
      summary: 'resume preflight begun',
    });
    try {
      await runResumePreflight({ config: projectConfig, worktree });
      await emitStartupEvent(key, {
        type: 'system',
        subtype: 'crew_startup_preflight',
        status: 'completed',
        timestamp: new Date().toISOString(),
        summary: 'resume preflight ok',
        durationMs: Date.now() - preflightStartedAt,
      });
    } catch (err) {
      await emitStartupEvent(key, {
        type: 'system',
        subtype: 'crew_startup_preflight',
        status: 'failed',
        timestamp: new Date().toISOString(),
        summary: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - preflightStartedAt,
      });
      throw err;
    }
  }

  const prompt = buildFixPrPrompt({
    key,
    feedback,
    feedbackSource: source,
    playwright: projectConfig ? playwrightFixPrOptsFor(projectConfig, resolvedAppUrl) : undefined,
    brunoSmoke,
    playwrightEnabled: pwEnabled,
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

  // Capture HEAD pre-spawn so the footer can detect whether the agent's
  // in-prompt rebase produced new commits. The wrapper no longer rebases
  // up-front, so this comparison is the only signal that an inspection
  // advisory should be printed.
  const headBefore = await getHeadSha(worktree);

  const claudeSpawnStartedAt = Date.now();
  await emitStartupEvent(key, {
    type: 'system',
    subtype: 'crew_startup_claude_spawn',
    status: 'started',
    timestamp: new Date().toISOString(),
    summary: 'spawning claude --resume',
  });
  const sub = spawnClaudeResume({
    sessionId: session.sessionId,
    prompt,
    logFile,
    cwd: worktree,
    env: resolvedAppUrl
      ? { CREW_APP_URL: resolvedAppUrl, PLAYWRIGHT_BASE_URL: resolvedAppUrl }
      : undefined,
  });
  await emitStartupEvent(key, {
    type: 'system',
    subtype: 'crew_startup_claude_spawn',
    status: 'completed',
    timestamp: new Date().toISOString(),
    summary: `claude resume pid=${sub.pid ?? '?'}`,
    durationMs: Date.now() - claudeSpawnStartedAt,
    logPath: logFile,
  });

  // Register the run with the daemon. Skipped when no project config is in
  // scope (legacy / non-crew-managed paths still use fix-pr without a TOML);
  // the daemon-client swallows connection errors so a downed daemon is fine.
  const daemonClient = crewDaemonClientFromEnv(process.env);
  let runId: number | null = null;
  if (projectConfig) {
    // Best-effort Jira title — registerRun COALESCEs '' against the existing
    // value so missing creds / network errors never clobber a known title.
    const ticketTitle = await fetchTicketSummaryFromEnv(
      key,
      projectConfig.jira.site,
      process.env,
    );
    const registration = await daemonClient.registerRun({
      key,
      projectName: projectConfig.name,
      ticketTitle,
      worktreePath: worktree,
      branch: key,
      sessionId: session.sessionId,
      command: 'fix-pr',
      startedAt: new Date().toISOString(),
    });
    if (registration.ok) runId = registration.run.id;
  }

  // Set the flag and kill the subprocess on SIGINT — but DO NOT call
  // process.exit(130) inline. The inline exit short-circuits the tail
  // loop's final drain, dropping events written between the kill and the
  // exit. Let abort propagate from sub.finally → streamTranscript →
  // resolved exit code.
  let signaled = false;
  const onSignal = (): void => {
    signaled = true;
    process.stderr.write('\n→ Aborting…\n');
    sub.kill('SIGTERM');
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  // Bridge the subprocess lifecycle to an AbortSignal so the tail loop exits
  // cleanly after claude terminates (or crashes). Drain-then-check-abort in
  // the generator guarantees a final flush of trailing events.
  const abort = new AbortController();
  void Promise.resolve(sub)
    .catch(() => {})
    .finally(() => abort.abort());

  let claudeExitCode = 0;
  try {
    await streamTranscript({
      transcriptPath: session.transcriptPath,
      signal: abort.signal,
      startAtEnd: true,
    });
    try {
      await sub;
    } catch (err) {
      claudeExitCode = (err as { exitCode?: number }).exitCode ?? 1;
    }
    if (runId !== null) {
      await daemonClient.completeRun(runId, {
        exitCode: claudeExitCode,
        completedAt: new Date().toISOString(),
      });
    }
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }

  const headAfter = await getHeadSha(worktree);

  printFooter({
    key,
    worktree,
    logFile,
    headChanged: headBefore !== headAfter,
    claudeExitCode,
  });
  process.exitCode = signaled ? 130 : claudeExitCode;
}

interface PrintFooterOptions {
  key: string;
  worktree: string;
  logFile: string;
  headChanged: boolean;
  claudeExitCode: number;
}

export function printFooter(opts: PrintFooterOptions): void {
  const log = existsSync(opts.logFile) ? readFileSync(opts.logFile, 'utf8') : '';
  process.stdout.write(
    `\n─────────────────────────────────────────────────────────────\n` +
      `→ Run finished (rc=${opts.claudeExitCode}). Final claude output:\n` +
      `  (full log: ${opts.logFile})\n` +
      `─────────────────────────────────────────────────────────────\n\n` +
      log +
      '\n',
  );

  if (opts.claudeExitCode !== 0) return;

  if (opts.headChanged) {
    process.stdout.write(
      `\n─────────────────────────────────────────────────────────────\n` +
        `⚠  HEAD moved during this run (rebase or new commits).\n` +
        `   Inspect locally — and check whether the agent already pushed:\n` +
        `     cd ${opts.worktree}\n` +
        `     git log --oneline origin/${opts.key}..HEAD     # commits ahead of origin\n` +
        `     git diff origin/${opts.key}..HEAD              # full diff vs origin\n` +
        `   If anything is unpushed and looks right:\n` +
        `     git push --force-with-lease origin ${opts.key}\n` +
        `─────────────────────────────────────────────────────────────\n`,
    );
  } else {
    process.stdout.write(
      `\n→ Push when ready:\n` + `     git push --force-with-lease origin ${opts.key}\n`,
    );
  }
}
