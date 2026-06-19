import { Command } from 'commander';
import { execa } from 'execa';
import { randomUUID } from 'node:crypto';
import { readdir, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import pc from 'picocolors';
import type { FinishStepStatus } from 'crew-shared';
import {
  type CrewDaemonClient,
  crewDaemonClientFromEnv,
  discoverProjectConfig,
  fetchTicketSummary,
  JiraClient,
  type ProjectConfig,
} from '../lib/index.js';
import { emitFinishCompleted } from '../lib/state-events/index.js';

export interface FinishDeps {
  cwd: string;
  config: ProjectConfig;
  jiraSecrets: { email: string; token: string } | null;
  daemonClient: CrewDaemonClient;
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

// Names of dotfiles known to be created as zero-byte placeholders by
// Claude Code's sandbox launcher when it bind-mounts over the worktree
// instead of a sandbox-internal tmpdir. Conservative allowlist — extend
// only when a new stub name is observed in the wild.
const SANDBOX_STUB_NAMES = new Set([
  '.bash_profile',
  '.bashrc',
  '.gitconfig',
  '.gitmodules',
  '.profile',
  '.ripgreprc',
  '.vscode',
  '.zprofile',
  '.zshrc',
]);

// Both modes have been observed for these placeholders depending on the
// launcher path: 0o444 (read-only mask) and 0o666 (umask-default touch).
const SANDBOX_STUB_MODES = new Set([0o444, 0o666]);

export async function pruneSandboxStubs(
  worktreePath: string,
  warn: (msg: string) => void,
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(worktreePath);
  } catch {
    return;
  }
  for (const name of entries) {
    if (!SANDBOX_STUB_NAMES.has(name)) continue;
    const full = join(worktreePath, name);
    let info;
    try {
      info = await stat(full);
    } catch {
      continue;
    }
    if (info.size !== 0) continue;
    if (!SANDBOX_STUB_MODES.has(info.mode & 0o777)) continue;
    try {
      await unlink(full);
      warn(`pruned sandbox stub ${name}`);
    } catch (err) {
      warn(`prune sandbox stub ${name}: ${(err as Error).message}`);
    }
  }
}

/**
 * Reports one finish step (ok/skip/error) to the daemon so the dashboard
 * drawer can render a live checklist (CREW-220). The label is the same
 * human string echoed to the terminal; `detail` carries the error message
 * (or skip reason). Best-effort — implementations may no-op when the daemon
 * is unreachable.
 */
type StepReporter = (label: string, status: FinishStepStatus, detail?: string) => Promise<void>;

/**
 * Builds a reporter bound to one agent key + a monotonic step index, so the
 * stored checklist preserves emission order. Returns a no-op when there is
 * no daemon run to attach to (registration failed / daemon down) — avoids a
 * per-step round-trip and warning storm against an unreachable daemon.
 */
function makeStepReporter(
  key: string,
  daemonClient: CrewDaemonClient,
  enabled: boolean,
): StepReporter {
  if (!enabled) return async () => {};
  let index = 0;
  return async (label, status, detail) => {
    await daemonClient.reportFinishStep(key, {
      index: index++,
      label,
      status,
      detail,
      ts: Date.now(),
    });
  };
}

async function step(
  label: string,
  fn: () => Promise<void>,
  log: (msg: string) => void,
  warn: (msg: string) => void,
  report: StepReporter,
): Promise<void> {
  try {
    await fn();
    log(label);
    await report(label, 'ok');
  } catch (err) {
    const detail = (err as Error).message;
    warn(`${label}: ${detail}`);
    await report(label, 'error', detail);
  }
}

async function transitionJira(
  key: string,
  config: ProjectConfig,
  secrets: { email: string; token: string },
  log: (msg: string) => void,
  warn: (msg: string) => void,
  report: StepReporter,
): Promise<void> {
  const label = `jira ${key} → Done`;
  const jira = new JiraClient({
    site: config.jira.site,
    email: secrets.email,
    token: secrets.token,
  });
  try {
    const issue = await jira.getIssue(key);
    if (issue.fields.status.name === 'Done') {
      log(`jira ${key} already Done`);
      await report(label, 'skip', 'already Done');
      return;
    }
    const transitions = await jira.getTransitions(key);
    const done = transitions.find((t) => t.to.name === 'Done' || t.name === 'Done');
    if (!done) {
      warn(`jira transition to Done: no transition with target "Done" found for ${key}`);
      await report(label, 'error', `no transition with target "Done" found for ${key}`);
      return;
    }
    await jira.transition(key, done.id);
    log(`jira ${key} → Done`);
    await report(label, 'ok');
  } catch (err) {
    const detail = (err as Error).message;
    warn(`jira transition: ${detail}`);
    await report(label, 'error', detail);
  }
}

async function unlinkIfExists(
  path: string,
  log: (msg: string) => void,
  warn: (msg: string) => void,
  report: StepReporter,
): Promise<void> {
  const label = `rm ${path}`;
  try {
    await unlink(path);
    log(label);
    await report(label, 'ok');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      warn(`rm ${path}: skipped (does not exist)`);
      await report(label, 'skip', 'does not exist');
    } else {
      const detail = (err as Error).message;
      warn(`rm ${path}: ${detail}`);
      await report(label, 'error', detail);
    }
  }
}

export async function runFinish(key: string, deps: FinishDeps): Promise<FinishResult> {
  const { cwd, config, jiraSecrets, daemonClient, log, warn } = deps;
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
    await pruneSandboxStubs(worktreePath, warn);
    if (await hasUncommittedChanges(worktreePath)) {
      return {
        ok: false,
        reason: `worktree ${worktreePath} has uncommitted changes. Commit or discard them, then re-run.`,
      };
    }
  }

  // Past the refusal gates — register a finish run with the daemon. crew finish
  // has no Claude transcript to tail, so the sessionId is synthetic; the
  // daemon's ingest tail attach will no-op silently for the missing JSONL.
  // A downed daemon returns ok:false; runId stays null and we skip the
  // companion completeRun. CLI proceeds with local merge work either way.
  const startedAt = new Date().toISOString();
  // Best-effort Jira title — preserves any existing daemon-side value via
  // the registerRun COALESCE upsert when '' returns (missing creds, etc).
  const ticketTitle = jiraSecrets
    ? await fetchTicketSummary({
        key,
        jiraSite: config.jira.site,
        email: jiraSecrets.email,
        token: jiraSecrets.token,
        warn,
      })
    : '';
  const registration = await daemonClient.registerRun({
    key,
    projectName: config.name,
    ticketTitle,
    worktreePath,
    branch: key,
    sessionId: `finish-${key}-${randomUUID()}`,
    command: 'finish',
    startedAt,
  });
  const runId = registration.ok ? registration.run.id : null;
  // Each step() / skip path reports its outcome so the dashboard drawer can
  // render a live checklist (CREW-220). No-op when no daemon run is attached.
  const report = makeStepReporter(key, daemonClient, runId !== null);

  let exitCode = 0;
  try {
    if (worktreeRegistered) {
      await step(
        'docker compose down -v',
        async () => {
          await execa('docker', ['compose', 'down', '-v'], { cwd: worktreePath });
        },
        log,
        warn,
        report,
      );
      await step(
        `git worktree remove ${worktreePath}`,
        async () => {
          await execa('git', ['-C', config.repo_path, 'worktree', 'remove', worktreePath]);
        },
        log,
        warn,
        report,
      );
    } else {
      warn(`docker compose down -v: skipped (worktree ${worktreePath} not registered)`);
      await report('docker compose down -v', 'skip', `worktree ${worktreePath} not registered`);
      warn(`git worktree remove: skipped (${worktreePath} not registered)`);
      await report(`git worktree remove ${worktreePath}`, 'skip', `${worktreePath} not registered`);
    }

    await step(
      `git branch -D ${key}`,
      async () => {
        await execa('git', ['-C', config.repo_path, 'branch', '-D', key]);
      },
      log,
      warn,
      report,
    );

    await step(
      `git push origin --delete ${key}`,
      async () => {
        await execa('git', ['-C', config.repo_path, 'push', 'origin', '--delete', key]);
      },
      log,
      warn,
      report,
    );

    await step(
      'git fetch --prune origin',
      async () => {
        await execa('git', ['-C', config.repo_path, 'fetch', '--prune', 'origin']);
      },
      log,
      warn,
      report,
    );

    if (jiraSecrets) {
      await transitionJira(key, config, jiraSecrets, log, warn, report);
    } else {
      warn(
        'jira transition to Done: skipped (CREW_JIRA_EMAIL / CREW_JIRA_API_TOKEN not set). Transition manually.',
      );
      await report(`jira ${key} → Done`, 'skip', 'CREW_JIRA_EMAIL / CREW_JIRA_API_TOKEN not set');
    }

    await unlinkIfExists(`/tmp/crew-run-${key}.log`, log, warn, report);
    await unlinkIfExists(`/tmp/crew-fix-pr-${key}.log`, log, warn, report);
  } catch (err) {
    exitCode = 1;
    if (runId !== null) {
      await daemonClient.completeRun(runId, {
        exitCode,
        completedAt: new Date().toISOString(),
      });
    }
    throw err;
  }

  if (runId !== null) {
    await daemonClient.completeRun(runId, {
      exitCode,
      completedAt: new Date().toISOString(),
    });
  }

  // Concrete state trigger: cleanup finished → terminal `finished` state via
  // the daemon's reducer. Kept alongside the existing completeRun call until
  // the inferred-state path is fully retired (plan Task 6) (CREW-255).
  await emitFinishCompleted(key);

  return { ok: true };
}

export function readJiraSecrets(env: NodeJS.ProcessEnv): { email: string; token: string } | null {
  const email = env.CREW_JIRA_EMAIL?.trim();
  const token = env.CREW_JIRA_API_TOKEN?.trim();
  if (email && token) return { email, token };
  return null;
}

export const finishCommand = new Command('finish')
  .description('post-merge cleanup: docker, worktree, branches, jira, /tmp logs')
  .argument('<key>', 'ticket key, e.g. KAN-23', (v) => v.toUpperCase())
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
        daemonClient: crewDaemonClientFromEnv(process.env),
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
