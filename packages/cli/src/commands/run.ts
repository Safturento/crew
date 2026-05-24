import {
  chmodSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { execa } from 'execa';
import pc from 'picocolors';
import type { ProjectConfig } from 'crew-shared';
import {
  claudeProjectDirFor,
  discoverProjectConfig,
  fetchTicketSummaryFromEnv,
} from '../lib/index.js';
import {
  dockerDaemonReachable,
  writeDockerEnv,
  type WriteDockerEnvResult,
} from '../lib/docker/index.js';
import { emit, loadEnvSpec, materialize, parseEnvFile } from '../lib/env-spec/index.js';
import { crewDaemonClientFromEnv } from '../lib/daemon-client/index.js';
import { buildTicketPrompt } from '../lib/prompts/index.js';
import {
  authoredEnabled,
  playwrightEnabled,
  resolveAppUrl,
  resolveSuperpowersChrome,
  smokeEnabled,
  verifyAfterRunEnabled,
  writeMcpDiagnosticLog,
  writeMcpFile,
} from '../lib/mcp-config/index.js';
import {
  bracketStartupPhase,
  emitStartupEvent,
  emitStartupEventSync,
} from '../lib/startup-events/index.js';
import {
  resolveBrunoEnvName,
  writeEnvFile as writeBrunoEnvFile,
} from '../lib/bruno-smoke/index.js';
import {
  checkE2eBaseline,
  computeGateSkip,
  dockerLogPathFor,
  findNewestTranscript,
  hasBinary,
  mcpLogPathFor,
  prepareAgentEnvironment,
  preflightTools,
  readWorktreeState,
  requireGhToken,
  requireWorktreeAvailable,
  runLogPathFor,
  runSkillInjection,
  runVerifyGate,
  streamTranscript,
  verifyGateLogPathFor,
  worktreePathFor,
  type BaselineCheckResult,
} from '../lib/run/index.js';
import { PreflightError, renderPreflightError } from '../lib/preflight/index.js';

interface RunOptions {
  skipDocker?: boolean;
  message?: string;
}

export interface BringUpWorktreeEnvOpts {
  worktree: string;
  canonicalWorktreeName: string;
  projectName: string;
}

export type BringUpWorktreeEnvResult =
  | { kind: 'env-spec'; base: Record<string, string> }
  | { kind: 'legacy'; legacy: WriteDockerEnvResult };

/**
 * Materialize per-worktree env files. Uses env.toml when present at the
 * worktree root, else falls back to the legacy fixed-shape writeDockerEnv.
 *
 * Lives here (rather than under lib/) because the legacy-vs-new branching is
 * a `crew run` concern, not a generic library responsibility.
 */
export async function bringUpWorktreeEnv(
  opts: BringUpWorktreeEnvOpts,
): Promise<BringUpWorktreeEnvResult> {
  const specPath = join(opts.worktree, 'env.toml');
  if (existsSync(specPath)) {
    const spec = loadEnvSpec(specPath);
    const wtBasename = basename(opts.worktree);
    const isCanonical = wtBasename === opts.canonicalWorktreeName;
    const cacheEnv = existsSync(join(opts.worktree, '.env'))
      ? parseEnvFile(readFileSync(join(opts.worktree, '.env'), 'utf8'))
      : {};
    const result = materialize(spec, {
      baseName: opts.projectName,
      worktreeId: isCanonical ? 'main' : wtBasename.replace(`${opts.canonicalWorktreeName}-`, ''),
      worktreeBasename: wtBasename,
      isCanonical,
      cacheEnv,
      canonicalEnv: undefined,
    });
    emit({ worktreeRoot: opts.worktree, base: result.base, contexts: result.contexts });
    return { kind: 'env-spec', base: result.base };
  }

  const legacy = writeDockerEnv(opts.worktree, {
    canonicalWorktree: opts.canonicalWorktreeName,
  });
  return { kind: 'legacy', legacy };
}

export const runCommand = new Command('run')
  .description(
    'create a worktree for <key>, generate the docker .env, and launch a sandboxed claude agent on the ticket — equivalent of run-ticket.sh',
  )
  .argument('<key>', 'Jira ticket key (e.g. KAN-23)', (v) => v.toUpperCase())
  .option('--skip-docker', 'skip the per-worktree docker bringup')
  .option(
    '-m, --message <message>',
    'additional context to include in the ticket prompt (e.g. -m "focus on lib/x")',
  )
  .action(async (key: string, options: RunOptions) => {
    await runRun(key, options);
  });

export async function runRun(key: string, opts: RunOptions): Promise<never> {
  if (opts.message !== undefined && opts.message.trim().length === 0) {
    fail('empty message provided to -m');
  }

  // Preflight phase (CREW-201): emit `started` immediately so the
  // dashboard's drawer Timeline shows "Preflight in flight" while the
  // CLI walks the precondition checks below. `failPreflight()` (used
  // by every early-exit path in this block) emits the failed event
  // synchronously before calling `fail()`, so the dashboard sees the
  // failed phase row before the process tears down.
  await emitStartupEvent(key, {
    type: 'system',
    subtype: 'crew_startup_preflight',
    status: 'started',
    timestamp: new Date().toISOString(),
    summary: 'discovering project config + checking tools',
  });
  const preflightStartedAt = Date.now();

  const config = await discoverProjectConfig(process.cwd());
  if (!config) {
    failStartupPhase(
      key,
      'crew_startup_preflight',
      preflightStartedAt,
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

  // Pre-flight docker daemon probe: when docker is configured but the daemon
  // doesn't answer, we won't be able to bring up the stack. Surface that to
  // the agent up front via the prompt's docker_unavailable disclosure rather
  // than letting the agent rediscover it mid-run.
  let dockerUnavailable = false;
  if (!skipDocker && config.docker) {
    const reachable = await dockerDaemonReachable({ env: { ...process.env, PATH: childPath } });
    if (!reachable) {
      dockerUnavailable = true;
      console.warn(
        pc.yellow(
          '  ! docker daemon unreachable — the agent prompt will declare docker_unavailable',
        ),
      );
    }
  }

  // Pre-flight baseline check: the gate's "we'll run e2e externally" promise
  // in the prompt only holds when the project's default branch is known-green
  // (otherwise the gate gets disabled at fire time). Compute this BEFORE
  // building the prompt so the agent's prompt reflects whether the gate will
  // actually fire.
  let baseline: BaselineCheckResult | undefined;
  let gateWillRun = false;
  if (verifyAfterRunEnabled(config)) {
    baseline = await checkE2eBaseline({
      projectName: config.name,
      repoPath: config.repo_path,
      defaultBranch: config.default_branch,
    });
    if (baseline.green && !skipDocker && !dockerUnavailable) {
      gateWillRun = true;
    } else if (!baseline.green) {
      console.warn(
        pc.yellow(
          `  ! e2e baseline non-green (${baselineSkipDetail(baseline)}); gate disabled for this run`,
        ),
      );
      console.warn(
        pc.dim(
          `    update once main is green:  echo $(git -C ${config.repo_path} rev-parse origin/${config.default_branch}) > ${baseline.cachePath}`,
        ),
      );
    }
  }

  const required = ['claude', 'gh', 'jq', 'bwrap'];
  const missing = preflightTools(required, childPath);
  if (missing.length > 0) {
    failStartupPhase(
      key,
      'crew_startup_preflight',
      preflightStartedAt,
      `missing required tool(s) on PATH: ${missing.join(', ')}`,
    );
  }

  const ghTokenSource = join(config.repo_path, '.claude', 'secrets', 'gh-token');
  try {
    requireGhToken(ghTokenSource);
  } catch (err) {
    failStartupPhase(
      key,
      'crew_startup_preflight',
      preflightStartedAt,
      err instanceof Error ? err.message : String(err),
    );
  }

  const worktree = worktreePathFor(config.repo_path, key);
  try {
    requireWorktreeAvailable(worktree);
  } catch (err) {
    failStartupPhase(
      key,
      'crew_startup_preflight',
      preflightStartedAt,
      err instanceof Error ? err.message : String(err),
    );
  }

  await emitStartupEvent(key, {
    type: 'system',
    subtype: 'crew_startup_preflight',
    status: 'completed',
    timestamp: new Date().toISOString(),
    summary: `project=${config.name}; tools ok; gh token present`,
    durationMs: Date.now() - preflightStartedAt,
  });

  const childEnv = { ...process.env, PATH: childPath };

  await bracketStartupPhase(
    key,
    {
      subtype: 'crew_startup_worktree',
      startedSummary: `creating worktree at ${worktree}`,
      completedSummary: () => `worktree at ${worktree} (branch ${key})`,
    },
    async () => {
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
    },
  );

  const ghTokenDest = join(worktree, '.claude', 'secrets', 'gh-token');

  let dockerPorts: { httpPort: number; httpsPort: number; postgresPort: number } | undefined;
  let envVars: Record<string, string> | undefined;
  if (config.docker) {
    const result = await bracketStartupPhase(
      key,
      {
        subtype: 'crew_startup_env_spec',
        startedSummary: 'materializing env.toml for worktree',
        completedSummary: (r: BringUpWorktreeEnvResult) =>
          r.kind === 'env-spec'
            ? `materialized .env from env.toml${r.base.APP_URL ? ` (APP_URL=${r.base.APP_URL})` : ''}`
            : `wrote ${r.legacy.envPath} (legacy)`,
      },
      () => {
        // TS doesn't narrow `config.docker` across the closure boundary
        // even though the surrounding `if (config.docker)` is in scope.
        const dockerCfg = config.docker;
        if (!dockerCfg) throw new Error('unreachable: config.docker checked above');
        return bringUpWorktreeEnv({
          worktree,
          canonicalWorktreeName: dockerCfg.canonical_worktree,
          projectName: config.name,
        });
      },
    );
    if (result.kind === 'legacy') {
      const env = result.legacy;
      dockerPorts = {
        httpPort: env.caddyHttpPort,
        httpsPort: env.caddyHttpsPort,
        postgresPort: env.postgresPort,
      };
      console.log(pc.dim(`→ wrote ${env.envPath}`));
      console.log(pc.dim(`    project: ${env.composeProjectName}`));
      console.log(pc.dim(`    http:    ${env.caddyHttpPort}`));
      console.log(pc.dim(`    https:   ${env.caddyHttpsPort}`));
      console.log(pc.dim(`    pg:      ${env.postgresPort}`));
      console.log(pc.dim(`    url:     ${env.appUrl}`));
    } else {
      envVars = result.base;
      console.log(pc.dim(`→ materialized ${join(worktree, '.env')} from env.toml`));
      if (envVars.APP_URL) {
        console.log(pc.dim(`    url:     ${envVars.APP_URL}`));
      }
    }
  }

  let brunoEnvName: string | undefined;
  let resolvedBrunoBaseUrl: string | undefined;
  if (config.bruno_smoke?.enabled) {
    resolvedBrunoBaseUrl = resolveAppUrl(config.bruno_smoke.base_url, dockerPorts, envVars).raw;
    brunoEnvName = resolveBrunoEnvName(worktree);
    const writeResult = writeBrunoEnvFile(worktree, {
      collectionDir: config.bruno_smoke.collection_dir,
      envName: brunoEnvName,
      baseUrl: resolvedBrunoBaseUrl,
      smokeUser: config.bruno_smoke.smoke_user,
    });
    console.log(
      pc.dim(
        `→ wrote ${writeResult.envFilePath} (CREW_BRUNO_ENV=${brunoEnvName}, baseUrl=${resolvedBrunoBaseUrl})`,
      ),
    );
    if (writeResult.existed) {
      console.warn(pc.yellow(`  ! ${writeResult.envFilePath} already existed — overwritten`));
    }
  }

  const { dockerProcess, resolvedAppUrl } = await prepareAgentEnvironment({
    config,
    worktree,
    key,
    env: childEnv,
    dockerPorts,
    envVars,
    mode: 'fresh',
    skipDocker,
  }).catch((err: unknown): never => {
    if (err instanceof PreflightError) {
      process.stderr.write(renderPreflightError(err) + '\n');
      process.exit(1);
    }
    fail(err instanceof Error ? err.message : String(err));
  });

  // .mcp.json is written AFTER prepareAgentEnvironment so the chromium binary
  // exists on disk when writeMcpFile resolves --executable-path. Resolving
  // before install would emit a stale path that points at a not-yet-extracted
  // binary, and the existsSync guard would fall back to MCP's system-chrome
  // default (the bug CREW-70 fixed).
  const wantsPlaywright =
    playwrightEnabled(config) && config.playwright != null && smokeEnabled(config);
  const wantsChrome = Boolean(config.visual_fidelity);
  if (wantsPlaywright || wantsChrome) {
    await bracketStartupPhase(
      key,
      {
        subtype: 'crew_startup_mcp',
        startedSummary: 'writing .mcp.json',
        completedSummary: (parts: string[]) =>
          parts.length > 0 ? `wrote .mcp.json (${parts.join(', ')})` : 'wrote .mcp.json',
        completedLogPath: mcpLogPathFor(key),
        failedLogPath: mcpLogPathFor(key),
      },
      async () => {
        const playwrightOpts =
          wantsPlaywright && config.playwright
            ? {
                appUrl: resolveAppUrl(config.playwright.app_url, dockerPorts, envVars).raw,
                resolverCwd: config.repo_path,
              }
            : undefined;
        const mcpWarnings: string[] = [];
        const writeResult = await writeMcpFile(worktree, {
          playwright: playwrightOpts,
          chrome: wantsChrome ? {} : undefined,
          warn: (msg) => {
            mcpWarnings.push(msg);
            console.warn(pc.yellow(`  ! ${msg}`));
          },
        });
        console.log(pc.dim(`→ wrote ${join(worktree, '.mcp.json')}`));
        if (playwrightOpts) {
          console.log(pc.dim(`    CREW_APP_URL=${playwrightOpts.appUrl}`));
          console.log(
            pc.dim(
              writeResult.chromiumPath
                ? `    chromium: ${writeResult.chromiumPath}`
                : `    chromium: <unresolved> — MCP will fall back to system chrome channel`,
            ),
          );
        }
        if (wantsChrome) {
          console.log(
            pc.dim(
              writeResult.chromeMcpPath
                ? `    chrome MCP: ${writeResult.chromeMcpPath}`
                : `    chrome MCP: <unresolved> — superpowers-chrome not installed`,
            ),
          );
        }
        if (writeResult.existed) {
          console.warn(pc.yellow('  ! .mcp.json already existed in worktree — overwritten'));
        }
        // Diagnostic log of resolved MCP wiring + warnings. Lets a debugger
        // working from the host explain "chrome MCP tool was missing from the
        // agent's session" without re-running the dispatch. CREW-184.
        const mcpLogPath = mcpLogPathFor(key);
        writeMcpDiagnosticLog({
          logPath: mcpLogPath,
          mcpJsonPath: join(worktree, '.mcp.json'),
          chromiumPath: writeResult.chromiumPath,
          chromeMcpPath: writeResult.chromeMcpPath,
          wantsPlaywright,
          wantsChrome,
          warnings: mcpWarnings,
        });
        console.log(pc.dim(`    mcp log: ${mcpLogPath}`));
        const parts: string[] = [];
        if (wantsPlaywright) parts.push('playwright');
        if (wantsChrome) parts.push('chrome');
        return parts;
      },
    );
  }

  console.log(pc.dim('→ injecting dispatcher-managed skills into the worktree…'));
  // browsing is plugin-sourced, not crew-owned: inject it from the
  // superpowers-chrome plugin cache, but only for [visual_fidelity] projects
  // (the chrome MCP it drives is only wired for those). Plugin-absent is
  // already warned about by writeMcpFile above — stay silent here.
  const browsingSkillSource = config.visual_fidelity
    ? resolveSuperpowersChrome()?.skillsRoot
    : undefined;
  await runSkillInjection({
    worktree,
    sourceRoot: skillsSourceRoot(),
    browsingSkillSource,
    log: (msg) => console.log(pc.dim(`    ${msg}`)),
    warn: (msg) => console.warn(pc.yellow(`  ! ${msg}`)),
  });

  const ghToken = readFileSync(ghTokenDest, 'utf8').trim();
  const prompt = buildTicketPrompt({
    key,
    githubRepo: config.github.repo,
    jiraSite: config.jira.site,
    userMessage: opts.message,
    playwright:
      playwrightEnabled(config) && resolvedAppUrl
        ? {
            appUrl: resolvedAppUrl,
            startCommand: config.playwright?.start_command,
            smoke: smokeEnabled(config) || undefined,
            authored:
              authoredEnabled(config) && config.playwright?.authored
                ? {
                    testsDir: config.playwright.authored.tests_dir,
                    testCommand: config.playwright.authored.test_command,
                    verifyAfterRun: gateWillRun,
                  }
                : undefined,
          }
        : undefined,
    dockerUnavailable,
    brunoSmoke:
      config.bruno_smoke?.enabled && brunoEnvName && resolvedBrunoBaseUrl
        ? {
            baseUrl: resolvedBrunoBaseUrl,
            envName: brunoEnvName,
            collectionDir: config.bruno_smoke.collection_dir,
            hasSmokeUser: Boolean(config.bruno_smoke.smoke_user),
          }
        : undefined,
    visualFidelity: config.visual_fidelity
      ? {
          snapshotPath: config.visual_fidelity.snapshot_path,
          componentDir: config.visual_fidelity.component_dir,
        }
      : undefined,
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
  const claudeSpawnStartedAt = Date.now();
  await emitStartupEvent(key, {
    type: 'system',
    subtype: 'crew_startup_claude_spawn',
    status: 'started',
    timestamp: new Date().toISOString(),
    summary: 'spawning claude --dangerously-skip-permissions',
  });
  const claudeProcess = execa('claude', ['--dangerously-skip-permissions', '-p', prompt], {
    cwd: worktree,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...childEnv,
      GH_TOKEN: ghToken,
      ...(resolvedAppUrl ? { CREW_APP_URL: resolvedAppUrl } : {}),
      ...(resolvedAppUrl ? { PLAYWRIGHT_BASE_URL: resolvedAppUrl } : {}),
      ...(brunoEnvName ? { CREW_BRUNO_ENV: brunoEnvName } : {}),
    },
    reject: false,
  });
  claudeProcess.stdout?.pipe(logStream);
  claudeProcess.stderr?.pipe(logStream);
  await emitStartupEvent(key, {
    type: 'system',
    subtype: 'crew_startup_claude_spawn',
    status: 'completed',
    timestamp: new Date().toISOString(),
    summary: `claude pid=${claudeProcess.pid ?? '?'}`,
    durationMs: Date.now() - claudeSpawnStartedAt,
    logPath,
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

  const sessionId = basename(transcriptPath, '.jsonl');
  const daemonClient = crewDaemonClientFromEnv(process.env);
  const startedAt = new Date().toISOString();
  // Best-effort Jira title for the dashboard's agent rows. Returns '' on any
  // failure (missing creds, network, malformed payload); the daemon upserts
  // with COALESCE so an empty value preserves any title already on the row.
  const ticketTitle = await fetchTicketSummaryFromEnv(key, config.jira.site, process.env, (msg) =>
    console.log(pc.yellow('!'), msg),
  );
  const registration = await daemonClient.registerRun({
    key,
    projectName: config.name,
    ticketTitle,
    worktreePath: worktree,
    branch: key,
    sessionId,
    command: 'run',
    startedAt,
  });
  const runId = registration.ok ? registration.run.id : null;

  await streamTranscript({ transcriptPath, signal: abort.signal });

  const result = await claudeProcess;
  logStream.end();
  process.off('SIGINT', sigintHandler);
  process.off('SIGTERM', sigintHandler);

  if (runId !== null) {
    await daemonClient.completeRun(runId, {
      exitCode: result.exitCode ?? 1,
      completedAt: new Date().toISOString(),
    });
  }

  // Wait up to 120s for the docker bringup to finish so the summary can include
  // its outcome; if it's still going, treat it as failed for gate purposes
  // (we can't verify against a stack that didn't come up in 2 minutes).
  let dockerFailed = dockerUnavailable;
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
          `  ! docker bringup still running after 120s — treating as unavailable for the gate (${dockerLogPathFor(key)})`,
        ),
      );
      dockerFailed = true;
    } else {
      const rc = await dockerProcess.then((r) => r.exitCode);
      if (typeof rc === 'number' && rc !== 0) dockerFailed = true;
    }
  }

  await maybeRunE2eGate({
    config,
    key,
    worktree,
    env: childEnv,
    skipDocker,
    dockerUnavailable: dockerFailed,
    resolvedAppUrl,
    repoPath: config.repo_path,
    defaultBranch: config.default_branch,
    baseline,
  });

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

function fail(message: string): never {
  console.error(pc.red(`error: ${message}`));
  process.exit(1);
}

/**
 * Emit a `failed` startup phase event synchronously, then call `fail()`.
 * Sync so callers retain `fail()`'s control-flow narrowing — `await`ing
 * an async helper that returns `Promise<never>` does not narrow `null`
 * checks in TypeScript.
 */
function failStartupPhase(
  key: string,
  subtype:
    | 'crew_startup_preflight'
    | 'crew_startup_worktree'
    | 'crew_startup_env_spec'
    | 'crew_startup_npm_install'
    | 'crew_startup_docker'
    | 'crew_startup_mcp'
    | 'crew_startup_claude_spawn',
  startedAt: number,
  message: string,
): never {
  emitStartupEventSync(key, {
    type: 'system',
    subtype,
    status: 'failed',
    timestamp: new Date().toISOString(),
    summary: message,
    durationMs: Date.now() - startedAt,
  });
  fail(message);
}

/**
 * Filesystem root where crew's owned skills live — committed in-repo at
 * `<repo>/.claude/skills/`. The crew CLI runs via tsx against the source tree
 * (no compiled `dist/`), so we resolve relative to this module's source
 * location: run.ts sits at `packages/cli/src/commands/`, four levels below the
 * repo root.
 */
function skillsSourceRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '.claude', 'skills');
}

interface MaybeRunE2eGateOptions {
  config: ProjectConfig;
  key: string;
  worktree: string;
  env: NodeJS.ProcessEnv;
  skipDocker: boolean;
  dockerUnavailable: boolean;
  resolvedAppUrl: string | undefined;
  repoPath: string;
  defaultBranch: string;
  /** Pre-computed baseline result. Hoisted from caller so the agent's prompt
   * was built with the same baseline state the gate sees. Optional only so
   * resume's no-config path stays simple; when undefined, the gate computes
   * it lazily. */
  baseline?: BaselineCheckResult;
}

export function baselineSkipDetail(baseline: BaselineCheckResult): string {
  if (baseline.green) return 'green';
  if (baseline.reason === 'mismatch') {
    return `recorded ${baseline.recordedSha?.slice(0, 7) ?? '?'} ≠ origin ${baseline.actualSha?.slice(0, 7) ?? '?'}`;
  }
  if (baseline.reason === 'no-record') return 'no record';
  return 'no remote ref';
}

/**
 * Shared end-of-run gate: invoke the authored e2e suite from the host, and on
 * failure resume the agent with the captured output (up to
 * `verify_max_attempts`). Skips silently when any precondition fails.
 *
 * Used by `crew run` (post-stream) and `crew resume` (post-stream). Errors
 * inside the gate are caught and logged but do not crash the surrounding
 * command — the agent's PR has already been opened.
 */
export async function maybeRunE2eGate(opts: MaybeRunE2eGateOptions): Promise<void> {
  if (!verifyAfterRunEnabled(opts.config)) return;

  const state = await readWorktreeState(opts.worktree, { defaultBranch: opts.defaultBranch });
  const baseline =
    opts.baseline ??
    (await checkE2eBaseline({
      projectName: opts.config.name,
      repoPath: opts.repoPath,
      defaultBranch: opts.defaultBranch,
    }));

  const skip = computeGateSkip({
    verifyAfterRun: true,
    commitsAhead: state.commitsAhead,
    skipDocker: opts.skipDocker,
    dockerUnavailable: opts.dockerUnavailable,
    baseline,
  });
  if (skip) {
    console.log(pc.dim(`→ e2e gate: ${skip.reason}`));
    if (!baseline.green) {
      console.log(
        pc.dim(
          `    update the baseline once main is green:  echo $(git -C ${opts.repoPath} rev-parse origin/${opts.defaultBranch}) > ${baseline.cachePath}`,
        ),
      );
    }
    return;
  }

  console.log();
  console.log(pc.dim('─────────────────────────────────────────────────────────────'));
  console.log(pc.bold('→ post-agent e2e verify gate'));
  console.log(pc.dim('─────────────────────────────────────────────────────────────'));

  try {
    const result = await runVerifyGate({
      config: opts.config,
      worktree: opts.worktree,
      key: opts.key,
      env: opts.env,
      resolvedAppUrl: opts.resolvedAppUrl,
      resumeLogFile: verifyGateLogPathFor(opts.key),
    });
    if (result.kind === 'pass') {
      console.log(pc.green(`  ✓ e2e gate passed (attempts: ${result.attempts})`));
    } else if (result.kind === 'aborted') {
      console.warn(pc.yellow(`  ! e2e gate aborted by user after ${result.attempts} attempt(s)`));
    } else {
      console.error(
        pc.red(
          `  ✗ e2e gate failed after ${result.attempts} attempt(s); last distinguisher: ${result.lastDistinguisher}`,
        ),
      );
      console.error(pc.dim(`    log: ${verifyGateLogPathFor(opts.key)}`));
      console.error(pc.dim('    last captured output:'));
      for (const line of result.lastOutput.split('\n').slice(0, 80)) {
        console.error(pc.dim(`    ${line}`));
      }
    }
  } catch (err) {
    console.error(
      pc.red(
        `  ! e2e gate orchestration error — manual verification required: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }
}
