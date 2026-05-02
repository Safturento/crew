import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { execa, type ResultPromise } from 'execa';
import pc from 'picocolors';
import type { ProjectConfig } from 'crew-shared';
import { agentNeedsAppRunning } from '../run/app-lifecycle.js';
import { dockerLogPathFor } from '../run/paths.js';

export interface StartDockerBringupOptions {
  config: ProjectConfig;
  worktree: string;
  key: string;
  skip: boolean;
  env: NodeJS.ProcessEnv;
}

/**
 * Detached/background docker bringup for the fresh `crew run` path. Uses
 * `--build`, optionally runs the project's `db-clone-from-main.sh`, and
 * stops the stack after when the agent doesn't need the app running. The
 * caller gets the process handle so it can wire SIGINT and wait at end of
 * run. Use `ensureStackRunning` instead for resume scenarios.
 */
export function startDockerBringup(opts: StartDockerBringupOptions): ResultPromise | null {
  const { config, worktree, key, skip, env } = opts;
  if (skip || !config.docker) {
    console.log(pc.dim('→ docker bringup skipped'));
    return null;
  }

  const dockerLogPath = dockerLogPathFor(key);
  const dockerStream = createWriteStream(dockerLogPath, { flags: 'w' });
  const stopAfterBringup = !agentNeedsAppRunning(config);
  const script = buildDockerBringupScript(config.repo_path, { stopAfterBringup });
  // execa v9 rejects WriteStream objects whose fd is still null when used
  // directly as stdio. Pipe after spawn instead.
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

export function buildDockerBringupScript(repoPath: string, opts: BringupScriptOptions): string {
  // Bring the worktree's compose stack up, optionally clone data from the
  // canonical worktree's stack. When stopAfterBringup is true (default for
  // ticket runs without playwright), stop the containers afterward so
  // they're warm but idle. When false (playwright enabled), leave the
  // stack running so the agent can hit the live URL via Playwright MCP.
  const dbCloneScript = join(repoPath, 'scripts', 'db-clone-from-main.sh');
  const stopBlock = opts.stopAfterBringup
    ? `  echo "[$(date +%T)] docker compose stop (leaving stack warm-but-stopped)"
  docker compose stop 2>&1
  echo "[$(date +%T)] ✓ stack stopped"`
    : `  echo "[$(date +%T)] ✓ leaving stack running for visual testing"`;
  // `--wait` blocks until services with healthchecks reach `healthy` (services
  // without one are treated as healthy when `running`). Without it, the clone
  // step below races the backend container's own seed (CREW-68).
  return `set -u
echo "[$(date +%T)] docker compose up --build --wait"
if docker compose up --build --wait 2>&1; then
  echo "[$(date +%T)] ✓ docker stack up"
  if [ -x ${shellQuote(dbCloneScript)} ]; then
    echo "[$(date +%T)] db-clone-from-main"
    if ${shellQuote(dbCloneScript)} 2>&1; then
      echo "[$(date +%T)] ✓ data cloned from main"
    else
      echo "[$(date +%T)] ! data clone failed (see log above for cause)"
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
