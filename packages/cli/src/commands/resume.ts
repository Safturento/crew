import { Command } from 'commander';
import { execa } from 'execa';
import { existsSync } from 'node:fs';
import pc from 'picocolors';
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
} from '../lib/run/agent-options.js';
import { prepareAgentEnvironment } from '../lib/run/agent-environment.js';
import { worktreePathFor } from '../lib/run/paths.js';
import { readWorktreeState } from '../lib/run/worktree-state.js';
import type { DockerPorts } from '../lib/playwright/index.js';

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

  const env = await prepareAgentEnvironment({
    config,
    worktree,
    key,
    env: process.env,
    dockerPorts,
    mode: 'resume',
    skipDocker: opts.skipDocker,
  });

  const session = findLatestSession({ worktree });
  const discoveredSkillsBlock = renderDiscoveredSkillsBlock(
    discoverSkills({ repoPath: config.repo_path }),
  );
  const brunoSmoke = brunoSmokeOptionsFor(config, worktree, dockerPorts);
  const logFile = `/tmp/crew-resume-${key}.log`;
  const claudeEnv = env.resolvedAppUrl ? { CREW_APP_URL: env.resolvedAppUrl } : undefined;

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
        `  log:      ${logFile}\n\n`,
    );
    const sub = spawnClaudeResume({
      sessionId: session.sessionId,
      prompt,
      logFile,
      cwd: worktree,
      env: claudeEnv,
    });
    await wireSignalsAndWait(sub);
    return;
  }

  process.stderr.write(pc.dim('→ no prior session found; starting fresh in existing worktree\n'));
  const prompt = buildTicketPrompt({
    key,
    githubRepo: config.github.repo,
    jiraSite: config.jira.site,
    userMessage: opts.message,
    playwright: playwrightTicketOptsFor(config, env.resolvedAppUrl),
    brunoSmoke,
    discoveredSkillsBlock,
  });
  process.stderr.write(
    `→ Spawning fresh agent for ${key}\n` +
      `  worktree: ${worktree}\n` +
      `  log:      ${logFile}\n\n`,
  );
  const sub = spawnClaudeFresh({
    prompt,
    logFile,
    cwd: worktree,
    env: claudeEnv,
  });
  await wireSignalsAndWait(sub);
}

interface KillableSubprocess extends PromiseLike<{ exitCode?: number | null }> {
  kill(signal?: NodeJS.Signals | number): boolean;
}

async function wireSignalsAndWait(sub: KillableSubprocess): Promise<void> {
  const onSignal = (): void => {
    process.stderr.write(pc.yellow('\n→ Aborting…\n'));
    sub.kill('SIGTERM');
    process.exit(130);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  try {
    await sub;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
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
