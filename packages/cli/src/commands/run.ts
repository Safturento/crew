import {
  chmodSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
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
  .argument('<key>', 'Jira ticket key (e.g. KAN-23)')
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

  // Ensure ~/.local/bin is on $PATH so child processes can find tools that
  // shells normally augment (e.g. user-installed gh). Mirrors run-ticket.sh.
  const localBin = join(homedir(), '.local', 'bin');
  const path = process.env.PATH ?? '';
  if (!path.split(':').includes(localBin)) {
    process.env.PATH = `${localBin}:${path}`;
  }

  const skipDocker = opts.skipDocker || !(await hasBinary('docker'));

  const required = ['claude', 'gh', 'jq', 'bwrap'];
  const missing = await preflightTools(required);
  if (missing.length > 0) {
    fail(`missing required tool(s) on PATH: ${missing.join(', ')}`);
  }

  const ghTokenSource = join(config.repo_path, '.claude', 'secrets', 'gh-token');
  if (!existsSync(ghTokenSource) || statSync(ghTokenSource).size === 0) {
    fail(
      `gh-token file missing or empty: ${ghTokenSource}\n       create it with: echo 'github_pat_…' > ${ghTokenSource} && chmod 600 ${ghTokenSource}`,
    );
  }

  const worktree = worktreePathFor(config.repo_path, key);
  if (existsSync(worktree)) {
    fail(
      `worktree already exists at ${worktree}\n       remove it first: git worktree remove '${worktree}'`,
    );
  }

  console.log(pc.dim(`→ fetching origin/${config.default_branch}…`));
  await execa('git', ['-C', config.repo_path, 'fetch', 'origin', config.default_branch], {
    stdout: 'inherit',
    stderr: 'inherit',
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
    { stdout: 'inherit', stderr: 'inherit' },
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

  const dockerProcess = startDockerBringup(config, worktree, key, skipDocker);

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
  const claudeProcess = execa('claude', ['--dangerously-skip-permissions', '-p', prompt], {
    cwd: worktree,
    stdin: 'ignore',
    stdout: logStream,
    stderr: logStream,
    env: { ...process.env, GH_TOKEN: ghToken },
    reject: false,
  });

  // When claude exits, give the tail one more poll cycle to drain any
  // trailing events, then abort.
  const abort = new AbortController();
  claudeProcess
    .finally(async () => {
      await delay(400);
      abort.abort();
    })
    .catch(() => {});

  const sigintHandler = (): void => {
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
    console.error(
      pc.red(`claude exited (rc=${result.exitCode ?? '?'}) before producing a transcript.`),
    );
    if (existsSync(logPath)) console.error(readFileSync(logPath, 'utf8'));
    process.exit(typeof result.exitCode === 'number' ? result.exitCode : 1);
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

  process.exit(typeof result.exitCode === 'number' ? result.exitCode : 1);
}

function startDockerBringup(
  config: ProjectConfig,
  worktree: string,
  key: string,
  skip: boolean,
): ResultPromise | null {
  if (skip || !config.docker) {
    console.log(pc.dim('→ docker bringup skipped'));
    return null;
  }

  const dockerLogPath = dockerLogPathFor(key);
  const dockerStream = createWriteStream(dockerLogPath, { flags: 'w' });
  const script = buildDockerBringupScript(config.repo_path);
  const proc = execa('bash', ['-c', script], {
    cwd: worktree,
    stdin: 'ignore',
    stdout: dockerStream,
    stderr: dockerStream,
    detached: true,
    reject: false,
    env: process.env,
  });
  proc.unref();
  proc.finally(() => dockerStream.end()).catch(() => {});

  console.log(pc.dim(`→ docker bringup running in background (log: ${dockerLogPath})`));
  return proc;
}

function buildDockerBringupScript(repoPath: string): string {
  // Bring the worktree's compose stack up, optionally clone data from the
  // canonical worktree's stack, then stop the containers (warm but idle so
  // they don't burn RAM). Mirrors the Recipes-App run-ticket.sh behavior.
  const dbCloneScript = join(repoPath, 'scripts', 'db-clone-from-main.sh');
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
  echo "[$(date +%T)] docker compose stop (leaving stack warm-but-stopped)"
  docker compose stop 2>&1
  echo "[$(date +%T)] ✓ stack stopped"
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
