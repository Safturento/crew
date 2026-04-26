import { Command } from 'commander';
import { execa } from 'execa';
import { unlink } from 'node:fs/promises';
import { resolve, basename, dirname, join, sep } from 'node:path';
import pc from 'picocolors';
import { discoverProjectConfig, JiraClient, type ProjectConfig } from '../lib/index.js';

export interface FinishDeps {
  cwd: string;
  config: ProjectConfig;
  jiraSecrets: { email: string; token: string } | null;
  log: (msg: string) => void;
  warn: (msg: string) => void;
}

export interface FinishResult {
  ok: boolean;
  reason?: string;
}

export function computeWorktreePath(repoPath: string, key: string): string {
  const normalised = repoPath.replace(/\/+$/, '');
  return join(dirname(normalised), `${basename(normalised)}-${key}`);
}

export function isInsideWorktree(cwd: string, worktree: string): boolean {
  const c = resolve(cwd);
  const w = resolve(worktree);
  return c === w || c.startsWith(w + sep);
}

interface PrInfo {
  number: number;
  state: string;
}

async function getPr(repoPath: string, branch: string): Promise<PrInfo | null> {
  const { stdout } = await execa(
    'gh',
    ['pr', 'list', '--head', branch, '--state', 'all', '--json', 'number,state'],
    { cwd: repoPath },
  );
  const list = JSON.parse(stdout) as PrInfo[];
  return list[0] ?? null;
}

async function isWorktreeRegistered(repoPath: string, worktreePath: string): Promise<boolean> {
  const { stdout } = await execa('git', ['-C', repoPath, 'worktree', 'list', '--porcelain']);
  const target = resolve(worktreePath);
  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      const path = resolve(line.slice('worktree '.length).trim());
      if (path === target) return true;
    }
  }
  return false;
}

async function hasUncommittedChanges(worktreePath: string): Promise<boolean> {
  const { stdout } = await execa('git', ['-C', worktreePath, 'status', '--porcelain']);
  return stdout.trim().length > 0;
}

async function step(
  label: string,
  fn: () => Promise<void>,
  log: (msg: string) => void,
  warn: (msg: string) => void,
): Promise<void> {
  try {
    await fn();
    log(label);
  } catch (err) {
    warn(`${label}: ${(err as Error).message}`);
  }
}

async function transitionJira(
  key: string,
  config: ProjectConfig,
  secrets: { email: string; token: string },
  log: (msg: string) => void,
  warn: (msg: string) => void,
): Promise<void> {
  const jira = new JiraClient({
    site: config.jira.site,
    email: secrets.email,
    token: secrets.token,
  });
  try {
    const issue = await jira.getIssue(key);
    if (issue.fields.status.name === 'Done') {
      log(`jira ${key} already Done`);
      return;
    }
    const transitions = await jira.getTransitions(key);
    const done = transitions.find((t) => t.to.name === 'Done' || t.name === 'Done');
    if (!done) {
      warn(`jira transition to Done: no transition with target "Done" found for ${key}`);
      return;
    }
    await jira.transition(key, done.id);
    log(`jira ${key} → Done`);
  } catch (err) {
    warn(`jira transition: ${(err as Error).message}`);
  }
}

async function unlinkIfExists(
  path: string,
  log: (msg: string) => void,
  warn: (msg: string) => void,
): Promise<void> {
  try {
    await unlink(path);
    log(`rm ${path}`);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      warn(`rm ${path}: skipped (does not exist)`);
    } else {
      warn(`rm ${path}: ${(err as Error).message}`);
    }
  }
}

export async function runFinish(key: string, deps: FinishDeps): Promise<FinishResult> {
  const { cwd, config, jiraSecrets, log, warn } = deps;
  const worktreePath = computeWorktreePath(config.repo_path, key);

  if (isInsideWorktree(cwd, worktreePath)) {
    return {
      ok: false,
      reason: `current directory is inside the worktree being removed (${worktreePath}). cd to ${config.repo_path} or elsewhere and re-run.`,
    };
  }

  const pr = await getPr(config.repo_path, key);
  if (!pr) {
    return {
      ok: false,
      reason: `no PR found for branch ${key}. Open a PR and merge it before running finish.`,
    };
  }
  if (pr.state !== 'MERGED') {
    return {
      ok: false,
      reason: `PR #${pr.number} is ${pr.state}, expected MERGED.`,
    };
  }

  const worktreeRegistered = await isWorktreeRegistered(config.repo_path, worktreePath);

  if (worktreeRegistered) {
    if (await hasUncommittedChanges(worktreePath)) {
      return {
        ok: false,
        reason: `worktree ${worktreePath} has uncommitted changes. Commit or discard them, then re-run.`,
      };
    }
  }

  if (worktreeRegistered) {
    await step(
      'docker compose down -v',
      async () => {
        await execa('docker', ['compose', 'down', '-v'], { cwd: worktreePath });
      },
      log,
      warn,
    );
    await step(
      `git worktree remove ${worktreePath}`,
      async () => {
        await execa('git', ['-C', config.repo_path, 'worktree', 'remove', worktreePath]);
      },
      log,
      warn,
    );
  } else {
    warn(`docker compose down -v: skipped (worktree ${worktreePath} not registered)`);
    warn(`git worktree remove: skipped (${worktreePath} not registered)`);
  }

  await step(
    `git branch -D ${key}`,
    async () => {
      await execa('git', ['-C', config.repo_path, 'branch', '-D', key]);
    },
    log,
    warn,
  );

  await step(
    `git push origin --delete ${key}`,
    async () => {
      await execa('git', ['-C', config.repo_path, 'push', 'origin', '--delete', key]);
    },
    log,
    warn,
  );

  await step(
    'git fetch --prune origin',
    async () => {
      await execa('git', ['-C', config.repo_path, 'fetch', '--prune', 'origin']);
    },
    log,
    warn,
  );

  if (jiraSecrets) {
    await transitionJira(key, config, jiraSecrets, log, warn);
  } else {
    warn(
      'jira transition to Done: skipped (CREW_JIRA_EMAIL / CREW_JIRA_API_TOKEN not set). Transition manually.',
    );
  }

  await unlinkIfExists(`/tmp/crew-run-${key}.log`, log, warn);
  await unlinkIfExists(`/tmp/crew-fix-pr-${key}.log`, log, warn);

  return { ok: true };
}

function readJiraSecrets(env: NodeJS.ProcessEnv): { email: string; token: string } | null {
  const email = env.CREW_JIRA_EMAIL;
  const token = env.CREW_JIRA_API_TOKEN;
  if (email && token) return { email, token };
  return null;
}

export const finishCommand = new Command('finish')
  .description('post-merge cleanup: docker, worktree, branches, jira, /tmp logs')
  .argument('<key>', 'ticket key, e.g. KAN-23')
  .action(async (key: string) => {
    const cwd = process.cwd();
    const config = await discoverProjectConfig(cwd);
    if (!config) {
      console.error(pc.red('✗'), `no crew project config matches ${cwd}`);
      process.exit(1);
    }
    try {
      const result = await runFinish(key, {
        cwd,
        config,
        jiraSecrets: readJiraSecrets(process.env),
        log: (msg) => console.log(pc.green('✓'), msg),
        warn: (msg) => console.log(pc.yellow('!'), msg),
      });
      if (!result.ok) {
        console.error(pc.red('✗'), result.reason ?? 'finish failed');
        process.exit(1);
      }
    } catch (err) {
      console.error(pc.red('✗'), `finish failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });
