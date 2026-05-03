import { Command } from 'commander';
import { execa } from 'execa';
import { existsSync } from 'node:fs';
import pc from 'picocolors';
import { claudeProjectDirFor } from 'crew-shared';
import { discoverProjectConfig } from '../lib/discover-project-config.js';
import { findLatestSession } from '../lib/sessions/index.js';
import { spawnClaudeFresh, spawnClaudeResume } from '../lib/claude/spawn.js';
import { buildResumePrompt } from '../lib/prompts/resume.js';
import { buildTicketPrompt } from '../lib/prompts/ticket.js';
import { discoverSkills, renderDiscoveredSkillsBlock } from '../lib/prompts/skills.js';
import {
  brunoSmokeOptionsFor,
  needsDockerPorts,
  playwrightFixPrOptsFor,
  playwrightTicketOptsFor,
  readDockerPortsFromEnvFile,
  readEnvBaseMap,
} from '../lib/run/agent-options.js';
import { prepareAgentEnvironment } from '../lib/run/agent-environment.js';
import { worktreePathFor } from '../lib/run/paths.js';
import { streamTranscript } from '../lib/run/stream-transcript.js';
import { readWorktreeState } from '../lib/run/worktree-state.js';
import { checkE2eBaseline, type BaselineCheckResult } from '../lib/run/baseline.js';
import { verifyAfterRunEnabled } from '../lib/playwright/mode-flags.js';
import {
  type DockerPorts,
  playwrightEnabled,
  resolveAppUrl,
  smokeEnabled,
  writeMcpFile,
} from '../lib/playwright/index.js';
import { maybeRunE2eGate } from './run.js';
import { join } from 'node:path';

interface ResumeOptions {
  message?: string;
  skipDocker?: boolean;
}

export async function runResume(key: string, opts: ResumeOptions): Promise<void> {
  if (opts.message !== undefined && opts.message.trim().length === 0) {
    process.stderr.write(pc.red(`error: empty message provided to -m\n`));
    process.exit(1);
  }
  const config = await discoverProjectConfig(process.cwd());
  if (!config) {
    process.stderr.write(pc.red(`error: no crew project config found from ${process.cwd()}\n`));
    process.exit(1);
  }
  const worktree = worktreePathFor(config.repo_path, key);

  if (!existsSync(worktree)) {
    process.stderr.write(
      pc.red(`error: no worktree at ${worktree}; did you mean 'crew run ${key}'?\n`),
    );
    process.exit(1);
  }

  process.stderr.write(pc.dim(`→ git fetch origin (refresh refs)\n`));
  await execa('git', ['fetch', 'origin'], { cwd: worktree, reject: false });

  const state = await readWorktreeState(worktree, { defaultBranch: config.default_branch });
  process.stderr.write(
    pc.dim(
      `→ worktree state: ${state.branch} (${state.commitsAhead} commits ahead, ${state.uncommittedCount} uncommitted)\n`,
    ),
  );

  const dockerPorts: DockerPorts | undefined = needsDockerPorts(config)
    ? readDockerPortsFromEnvFile(worktree)
    : undefined;
  const envVars = readEnvBaseMap(worktree);

  const env = await prepareAgentEnvironment({
    config,
    worktree,
    key,
    env: process.env,
    dockerPorts,
    envVars,
    mode: 'resume',
    skipDocker: opts.skipDocker,
  });

  // Refresh .mcp.json so this resume picks up any changes to the config shape
  // shipped by newer crew code (e.g. --executable-path for the bundled chromium,
  // updated CREW_APP_URL, etc.). Stale .mcp.json from an older crew is a real
  // footgun — the agent silently uses the old config, e.g. falls back to the
  // system chrome channel when crew now wires the bundled chromium directly.
  if (playwrightEnabled(config) && config.playwright && smokeEnabled(config)) {
    const resolved = resolveAppUrl(config.playwright.app_url, dockerPorts, envVars);
    const writeResult = await writeMcpFile(worktree, { appUrl: resolved.raw });
    process.stderr.write(
      pc.dim(`→ refreshed ${join(worktree, '.mcp.json')} (CREW_APP_URL=${resolved.raw})\n`),
    );
    if (writeResult.chromiumPath) {
      process.stderr.write(pc.dim(`    chromium: ${writeResult.chromiumPath}\n`));
    } else {
      process.stderr.write(
        pc.dim(`    chromium: <unresolved> — MCP will fall back to system chrome channel\n`),
      );
    }
  }

  const session = findLatestSession({ worktree });
  const discoveredSkillsBlock = renderDiscoveredSkillsBlock(
    discoverSkills({ repoPath: config.repo_path }),
  );
  const brunoSmoke = brunoSmokeOptionsFor(config, worktree, dockerPorts, envVars);
  const logFile = `/tmp/crew-resume-${key}.log`;
  const claudeEnv = env.resolvedAppUrl ? { CREW_APP_URL: env.resolvedAppUrl } : undefined;

  // Pre-flight baseline check so the agent's prompt declares verify_after_run
  // only when the gate will actually fire post-run (mirrors run.ts).
  let baseline: BaselineCheckResult | undefined;
  let gateWillRun = false;
  if (verifyAfterRunEnabled(config)) {
    baseline = await checkE2eBaseline({
      projectName: config.name,
      repoPath: config.repo_path,
      defaultBranch: config.default_branch,
    });
    if (baseline.green && !opts.skipDocker) {
      gateWillRun = true;
    } else if (!baseline.green) {
      process.stderr.write(
        pc.yellow(`  ! e2e baseline non-green (${baseline.reason}); gate disabled for this run\n`),
      );
    }
  }

  if (session) {
    const prompt = buildResumePrompt({
      key,
      branch: state.branch,
      commitsAhead: state.commitsAhead,
      uncommittedCount: state.uncommittedCount,
      defaultBranch: state.defaultBranch,
      userMessage: opts.message,
      playwright: playwrightFixPrOptsFor(config, env.resolvedAppUrl),
      brunoSmoke,
      discoveredSkillsBlock,
    });
    process.stderr.write(
      `→ Resuming session for ${key}\n` +
        `  worktree: ${worktree}\n` +
        `  session:  ${session.sessionId}\n` +
        `  log:      ${logFile}\n\n` +
        `→ Watching ${session.transcriptPath} (new events only). Ctrl+C to abort.\n\n`,
    );
    const sub = spawnClaudeResume({
      sessionId: session.sessionId,
      prompt,
      logFile,
      cwd: worktree,
      env: claudeEnv,
    });
    await streamUntilExit(sub, { transcriptPath: session.transcriptPath, startAtEnd: true });
    await maybeRunE2eGate({
      config,
      key,
      worktree,
      env: process.env,
      skipDocker: Boolean(opts.skipDocker),
      dockerUnavailable: false,
      resolvedAppUrl: env.resolvedAppUrl,
      repoPath: config.repo_path,
      defaultBranch: config.default_branch,
      baseline,
    });
    return;
  }

  process.stderr.write(pc.dim('→ no prior session found; starting fresh in existing worktree\n'));
  const prompt = buildTicketPrompt({
    key,
    githubRepo: config.github.repo,
    jiraSite: config.jira.site,
    userMessage: opts.message,
    playwright: playwrightTicketOptsFor(config, env.resolvedAppUrl, gateWillRun),
    brunoSmoke,
    discoveredSkillsBlock,
  });
  const projectDir = claudeProjectDirFor(worktree);
  process.stderr.write(
    `→ Spawning fresh agent for ${key}\n` +
      `  worktree: ${worktree}\n` +
      `  log:      ${logFile}\n\n` +
      `→ Waiting for transcript at ${projectDir}…  Ctrl+C to abort.\n\n`,
  );
  const sub = spawnClaudeFresh({
    prompt,
    logFile,
    cwd: worktree,
    env: claudeEnv,
  });
  await streamUntilExit(sub, {
    projectDir,
    onTranscriptResolved: (path) => {
      process.stderr.write(pc.dim(`→ watching ${path}\n\n`));
    },
  });
  await maybeRunE2eGate({
    config,
    key,
    worktree,
    env: process.env,
    skipDocker: Boolean(opts.skipDocker),
    dockerUnavailable: false,
    resolvedAppUrl: env.resolvedAppUrl,
    repoPath: config.repo_path,
    defaultBranch: config.default_branch,
  });
}

interface KillableSubprocess extends PromiseLike<{ exitCode?: number | null }> {
  kill(signal?: NodeJS.Signals | number): boolean;
}

interface StreamUntilExitTarget {
  transcriptPath?: string;
  projectDir?: string;
  startAtEnd?: boolean;
  onTranscriptResolved?: (path: string) => void;
}

/**
 * Wire SIGINT/SIGTERM to terminate the spawned claude, then stream its
 * transcript to stdout until the subprocess exits. Mirrors the bridge in
 * `runFixPr`: kill on signal, let the abort propagate from the subprocess
 * lifecycle to the tail loop, and the tail's read-then-check-abort
 * guarantees a final drain. Resume's process exit code is set to 130 if
 * the user aborted, matching the bash convention.
 */
async function streamUntilExit(
  sub: KillableSubprocess,
  target: StreamUntilExitTarget,
): Promise<void> {
  let signaled = false;
  const onSignal = (): void => {
    signaled = true;
    process.stderr.write(pc.yellow('\n→ Aborting…\n'));
    sub.kill('SIGTERM');
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  const abort = new AbortController();
  void Promise.resolve(sub)
    .catch(() => {})
    .finally(() => abort.abort());

  let exitCode: number | null | undefined;
  try {
    await streamTranscript({
      transcriptPath: target.transcriptPath,
      projectDir: target.projectDir,
      signal: abort.signal,
      startAtEnd: target.startAtEnd,
      onTranscriptResolved: target.onTranscriptResolved,
    });
    try {
      const result = await sub;
      exitCode = result.exitCode;
    } catch (err) {
      exitCode = (err as { exitCode?: number }).exitCode ?? 1;
    }
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }

  if (signaled) {
    process.exitCode = 130;
  } else if (typeof exitCode === 'number') {
    process.exitCode = exitCode;
  }
}

export const resumeCommand = new Command('resume')
  .description('Continue an interrupted crew run on an existing worktree')
  .argument('<key>', 'Jira ticket key (e.g. KAN-23)', (v) => v.toUpperCase())
  .option(
    '-m, --message <message>',
    "additional context to give the agent on resume (e.g. -m 'focus on lib/x')",
  )
  .option('--skip-docker', 'skip the docker stack ensure step')
  .action(async (key: string, opts: ResumeOptions) => {
    await runResume(key, opts);
  });
