import {
  chmodSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Command } from 'commander';
import { execa, type ResultPromise } from 'execa';
import pc from 'picocolors';
import { discoverProjectConfig, type ProjectConfig } from '../lib/config/index.js';
import { writeDockerEnv } from '../lib/docker/index.js';
import { buildTicketPrompt } from '../lib/prompts/index.js';
import {
  claudeProjectDirFor,
  dockerLogPathFor,
  findNewestTranscript,
  hasBinary,
  preflightTools,
  requireGhToken,
  requireWorktreeAvailable,
  runLogPathFor,
  worktreePathFor,
} from '../lib/run/index.js';
import { formatToolCall, parseToolCall, tailTranscript } from '../lib/transcripts/index.js';

interface RunOptions {
  skipDocker?: boolean;
}

export const runCommand = new Command('run')
  .description(
    'create a worktree for <key>, generate the docker .env, and launch a sandboxed claude agent on the ticket — equivalent of run-ticket.sh',
  )
  .argument('<key>', 'Jira ticket key (e.g. KAN-23)', (v) => v.toUpperCase())
  .option('--skip-docker', 'skip the per-worktree docker bringup')
  .action(async (key: string, options: RunOptions) => {
    await runTicket(key, options);
  });

async function runTicket(key: string, opts: RunOptions): Promise<never> {
  const config = await discoverProjectConfig(process.cwd());
  if (!config) {
    fail(
      'no crew project config matches this repository — configure ~/.config/crew/projects/<name>.toml',
    );
  }

  // Build the augmented PATH once and pass it explicitly to every subprocess
  // rather than mutating process.env. ~/.local/bin is prepended so user-
  // installed binaries (e.g. gh) are reachable even if the shell that invoked
  // crew didn't already include it. Mirrors run-ticket.sh.
  const localBin = join(homedir(), '.local', 'bin');
  const childPath = ((): string => {
    const existing = process.env.PATH ?? '';
    const segments = existing.split(':');
    if (segments.includes(localBin)) return existing;
    return `${localBin}:${existing}`;
  })();

  const skipDocker = opts.skipDocker || !hasBinary('docker', childPath);

  const required = ['claude', 'gh', 'jq', 'bwrap'];
  const missing = preflightTools(required, childPath);
  if (missing.length > 0) {
    fail(`missing required tool(s) on PATH: ${missing.join(', ')}`);
  }

  const ghTokenSource = join(config.repo_path, '.claude', 'secrets', 'gh-token');
  try {
    requireGhToken(ghTokenSource);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  const worktree = worktreePathFor(config.repo_path, key);
  try {
    requireWorktreeAvailable(worktree);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  const childEnv = { ...process.env, PATH: childPath };

  console.log(pc.dim(`→ fetching origin/${config.default_branch}…`));
  await execa('git', ['-C', config.repo_path, 'fetch', 'origin', config.default_branch], {
    stdout: 'inherit',
    stderr: 'inherit',
    env: childEnv,
  });

  console.log(
    pc.dim(
      `→ creating worktree at ${worktree} on branch ${key} (from origin/${config.default_branch})…`,
    ),
  );
  await execa(
    'git',
    [
      '-C',
      config.repo_path,
      'worktree',
      'add',
      '-b',
      key,
      worktree,
      `origin/${config.default_branch}`,
    ],
    { stdout: 'inherit', stderr: 'inherit', env: childEnv },
  );

  const secretsDir = join(worktree, '.claude', 'secrets');
  mkdirSync(secretsDir, { recursive: true });
  const ghTokenDest = join(secretsDir, 'gh-token');
  copyFileSync(ghTokenSource, ghTokenDest);
  chmodSync(ghTokenDest, 0o600);

  if (config.docker) {
    const env = writeDockerEnv(worktree, { canonicalWorktree: config.docker.canonical_worktree });
    console.log(pc.dim(`→ wrote ${env.envPath}`));
    console.log(pc.dim(`    project: ${env.composeProjectName}`));
    console.log(pc.dim(`    http:    ${env.caddyHttpPort}`));
    console.log(pc.dim(`    https:   ${env.caddyHttpsPort}`));
    console.log(pc.dim(`    pg:      ${env.postgresPort}`));
    console.log(pc.dim(`    url:     ${env.appUrl}`));
  }

  const dockerProcess = startDockerBringup(config, worktree, key, skipDocker, childEnv);

  const ghToken = readFileSync(ghTokenDest, 'utf8').trim();
  const prompt = buildTicketPrompt({
    key,
    githubRepo: config.github.repo,
    jiraSite: config.jira.site,
  });

  const logPath = runLogPathFor(key);
  console.log();
  console.log(pc.dim(`→ launching claude in headless mode for ${key}`));
  console.log(pc.dim(`    worktree: ${worktree}`));
  console.log(pc.dim(`    branch:   ${key}`));
  console.log(pc.dim(`    log:      ${logPath}`));
  console.log();

  const logStream = createWriteStream(logPath, { flags: 'w' });
  // Pipe stdout/stderr through after spawn rather than passing logStream as
  // stdio directly: execa v9 rejects WriteStream objects whose fd hasn't
  // been assigned yet (createWriteStream returns synchronously but opens
  // the file on the next tick), causing an immediate ERR_INVALID_ARG_VALUE.
  const claudeProcess = execa('claude', ['--dangerously-skip-permissions', '-p', prompt], {
    cwd: worktree,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...childEnv, GH_TOKEN: ghToken },
    reject: false,
  });
  claudeProcess.stdout?.pipe(logStream);
  claudeProcess.stderr?.pipe(logStream);

  // When claude exits, give the tail one more poll cycle to drain any
  // trailing events, then abort.
  const abort = new AbortController();
  claudeProcess
    .finally(async () => {
      await delay(400);
      abort.abort();
    })
    .catch(() => {});

  let signaled = false;
  const sigintHandler = (): void => {
    signaled = true;
    console.error(pc.yellow('\n→ aborting…'));
    claudeProcess.kill('SIGTERM');
  };
  process.on('SIGINT', sigintHandler);
  process.on('SIGTERM', sigintHandler);

  const projectDir = claudeProjectDirFor(worktree);
  console.log(pc.dim(`→ waiting for transcript at ${projectDir}…`));
  const transcriptPath = await findNewestTranscript(projectDir, { signal: abort.signal });

  if (!transcriptPath) {
    logStream.end();
    const result = await claudeProcess;
    if (result.failed && result.shortMessage) {
      console.error(pc.red(`claude failed to spawn: ${result.shortMessage.split('\n')[0]}`));
    } else {
      console.error(
        pc.red(`claude exited (rc=${result.exitCode ?? '?'}) before producing a transcript.`),
      );
    }
    if (existsSync(logPath)) console.error(readFileSync(logPath, 'utf8'));
    process.exit(resolveExitCode(result, signaled));
  }

  console.log(pc.dim(`→ watching ${transcriptPath}`));
  console.log(pc.dim('  (Ctrl+C to abort)'));
  console.log();

  for await (const event of tailTranscript(transcriptPath, { signal: abort.signal })) {
    const call = parseToolCall(event);
    if (call) console.log(formatToolCall(call));
  }

  const result = await claudeProcess;
  logStream.end();
  process.off('SIGINT', sigintHandler);
  process.off('SIGTERM', sigintHandler);

  // Wait up to 120s for the docker bringup to finish so the summary can include
  // its outcome; if it's still going, abandon it to the background.
  if (dockerProcess) {
    console.log();
    console.log(pc.dim('→ waiting up to 120s for docker bringup…'));
    const finished = await Promise.race([
      dockerProcess.then(() => true),
      delay(120_000).then(() => false),
    ]);
    if (!finished) {
      console.warn(
        pc.yellow(
          `  ! docker bringup still running after 120s — continuing in background (${dockerLogPathFor(key)})`,
        ),
      );
    }
  }

  console.log();
  console.log(pc.dim('─────────────────────────────────────────────────────────────'));
  console.log(pc.bold(`→ run finished (rc=${result.exitCode ?? '?'}). Final claude output:`));
  console.log(pc.dim(`  log: ${logPath}`));
  if (dockerProcess) console.log(pc.dim(`  docker log: ${dockerLogPathFor(key)}`));
  console.log(pc.dim('─────────────────────────────────────────────────────────────'));
  console.log();

  if (existsSync(logPath)) console.log(readFileSync(logPath, 'utf8'));

  process.exit(resolveExitCode(result, signaled));
}

export interface ExecResult {
  exitCode?: number;
  signal?: string;
}

export function resolveExitCode(result: ExecResult, signaled: boolean): number {
  // bash convention: a process killed by SIGINT/SIGTERM exits 130/143. We
  // collapse both into 130 so callers see "user canceled" uniformly,
  // matching run-ticket.sh's `exit 130` after a Ctrl+C trap.
  if (signaled || result.signal === 'SIGINT' || result.signal === 'SIGTERM') return 130;
  return typeof result.exitCode === 'number' ? result.exitCode : 1;
}

function startDockerBringup(
  config: ProjectConfig,
  worktree: string,
  key: string,
  skip: boolean,
  env: NodeJS.ProcessEnv,
): ResultPromise | null {
  if (skip || !config.docker) {
    console.log(pc.dim('→ docker bringup skipped'));
    return null;
  }

  const dockerLogPath = dockerLogPathFor(key);
  const dockerStream = createWriteStream(dockerLogPath, { flags: 'w' });
  const stopAfterBringup = !config.visual_testing?.enabled;
  const script = buildDockerBringupScript(config.repo_path, { stopAfterBringup });
  // See note above the claudeProcess spawn: execa v9 rejects WriteStream
  // objects whose fd is still null. Pipe after spawn instead.
  const proc = execa('bash', ['-c', script], {
    cwd: worktree,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    detached: true,
    reject: false,
    env,
  });
  proc.stdout?.pipe(dockerStream);
  proc.stderr?.pipe(dockerStream);
  proc.unref();
  proc.finally(() => dockerStream.end()).catch(() => {});

  console.log(pc.dim(`→ docker bringup running in background (log: ${dockerLogPath})`));
  return proc;
}

export interface BringupScriptOptions {
  stopAfterBringup: boolean;
}

export function buildDockerBringupScript(
  repoPath: string,
  opts: BringupScriptOptions,
): string {
  // Bring the worktree's compose stack up, optionally clone data from the
  // canonical worktree's stack. When stopAfterBringup is true (default for
  // ticket runs without visual_testing), stop the containers afterward so
  // they're warm but idle. When false (visual_testing enabled), leave the
  // stack running so the agent can hit the live URL via Playwright MCP.
  const dbCloneScript = join(repoPath, 'scripts', 'db-clone-from-main.sh');
  const stopBlock = opts.stopAfterBringup
    ? `  echo "[$(date +%T)] docker compose stop (leaving stack warm-but-stopped)"
  docker compose stop 2>&1
  echo "[$(date +%T)] ✓ stack stopped"`
    : `  echo "[$(date +%T)] ✓ leaving stack running for visual testing"`;
  return `set -u
echo "[$(date +%T)] docker compose up --build --detach"
if docker compose up --build --detach 2>&1; then
  echo "[$(date +%T)] ✓ docker stack up"
  if [ -x ${shellQuote(dbCloneScript)} ]; then
    echo "[$(date +%T)] db-clone-from-main"
    if ${shellQuote(dbCloneScript)} 2>&1; then
      echo "[$(date +%T)] ✓ data cloned from main"
    else
      echo "[$(date +%T)] ! data clone skipped (main's stack isn't running)"
    fi
  fi
${stopBlock}
else
  echo "[$(date +%T)] ! docker stack failed to come up"
fi
`;
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function fail(message: string): never {
  console.error(pc.red(`error: ${message}`));
  process.exit(1);
}
