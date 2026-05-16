import { execa } from 'execa';
import { createWriteStream, existsSync } from 'node:fs';
import pc from 'picocolors';
import type { ProjectConfig } from 'crew-shared';
import { spawnClaudeResume } from '../claude/spawn.js';
import { discoverProjectConfig } from '../discover-project-config.js';
import { findLatestSession } from '../sessions/index.js';
import { buildFixPrPrompt } from '../prompts/fix-pr.js';
import {
  brunoSmokeOptionsFor,
  needsDockerPorts,
  playwrightFixPrOptsFor,
  readDockerPortsFromEnvFile,
} from './agent-options.js';
import { streamTranscript } from './stream-transcript.js';
import type { BaselineCheckResult } from './baseline.js';

export type Distinguisher = 'assertions' | 'crash';

export interface GateSkipInput {
  verifyAfterRun: boolean;
  commitsAhead: number;
  skipDocker: boolean;
  dockerUnavailable: boolean;
  baseline: BaselineCheckResult;
}

export interface GateSkip {
  reason: string;
}

export function computeGateSkip(input: GateSkipInput): GateSkip | null {
  if (!input.verifyAfterRun) return { reason: 'gate disabled (verify_after_run = false)' };
  if (input.skipDocker) return { reason: 'gate skipped (--skip-docker passed)' };
  if (input.dockerUnavailable) return { reason: 'gate skipped (docker stack unavailable)' };
  if (input.commitsAhead === 0) return { reason: 'gate skipped (no commits on branch)' };
  if (!input.baseline.green) {
    const detail =
      input.baseline.reason === 'mismatch'
        ? `baseline at ${input.baseline.cachePath} records ${input.baseline.recordedSha?.slice(0, 7) ?? '?'} but origin is ${input.baseline.actualSha?.slice(0, 7) ?? '?'}`
        : input.baseline.reason === 'no-record'
          ? `no baseline record at ${input.baseline.cachePath}`
          : `no origin/<default_branch> ref to compare against`;
    return { reason: `gate skipped (baseline non-green: ${detail})` };
  }
  return null;
}

export interface RawTestResult {
  exitCode: number | undefined;
  stdout: string;
  stderr: string;
  signal?: string;
}

export type ClassifiedResult =
  | { pass: true; output: string }
  | { pass: false; distinguisher: Distinguisher; output: string }
  | { aborted: true; output: string };

export function classifyTestResult(r: RawTestResult): ClassifiedResult {
  const output = [r.stdout, r.stderr].filter((s) => s && s.trim().length > 0).join('\n');
  if (r.signal === 'SIGINT' || r.signal === 'SIGTERM') {
    return { aborted: true, output };
  }
  if (r.exitCode === 0) return { pass: true, output };
  const distinguisher: Distinguisher = r.exitCode === 1 ? 'assertions' : 'crash';
  return { pass: false, distinguisher, output };
}

export function formatFeedbackMessage(distinguisher: Distinguisher, output: string): string {
  const prefix =
    distinguisher === 'assertions' ? 'e2e test assertions failed:' : 'playwright runner crashed:';
  return `${prefix}\n\n${output}`;
}

export type GateRunner = () => Promise<ClassifiedResult>;
export interface AgentResumeOptions {
  message: string;
  attempt: number;
}
export type AgentResumer = (opts: AgentResumeOptions) => Promise<void>;

export type GateLoopResult =
  | { kind: 'pass'; attempts: number }
  | {
      kind: 'fail';
      attempts: number;
      lastDistinguisher: Distinguisher;
      lastOutput: string;
    }
  | { kind: 'aborted'; attempts: number };

export interface RunVerifyGateLoopOptions {
  verifyMaxAttempts: number;
  runGate: GateRunner;
  resumeAgent: AgentResumer;
}

/**
 * Pure orchestration of pass / fail / retry-cap behavior. Caller injects
 * `runGate` (executes the test command, returns classified result) and
 * `resumeAgent` (spawns claude with the feedback, awaits exit). The loop
 * counts the verifications; total agent runs equals `attempts` because the
 * first agent run already happened before the loop fires.
 *
 * When the gate runner reports an abort (Ctrl+C during the test command),
 * the loop returns immediately without dispatching a fix-pr resume — the
 * user wanted to stop, not retry.
 */
export async function runVerifyGateLoop(opts: RunVerifyGateLoopOptions): Promise<GateLoopResult> {
  let attempt = 1;
  while (true) {
    const result = await opts.runGate();
    if ('aborted' in result) return { kind: 'aborted', attempts: attempt };
    if (result.pass) return { kind: 'pass', attempts: attempt };
    if (attempt >= opts.verifyMaxAttempts) {
      return {
        kind: 'fail',
        attempts: attempt,
        lastDistinguisher: result.distinguisher,
        lastOutput: result.output,
      };
    }
    await opts.resumeAgent({
      message: formatFeedbackMessage(result.distinguisher, result.output),
      attempt: attempt + 1,
    });
    attempt += 1;
  }
}

export interface RunTestCommandOptions {
  testCommand: string;
  worktree: string;
  env: NodeJS.ProcessEnv;
  /** Mirror stdout/stderr to this stream so the user sees live output (a
   * Playwright run can take minutes; without streaming the terminal looks
   * frozen). The captured-string copy is still returned for classification. */
  out?: NodeJS.WritableStream;
}

/**
 * Execute the configured `test_command` from the worktree dir. Captures
 * stdout + stderr + exit code without throwing, and tees both streams to
 * `opts.out` so the user gets live progress. Caller wraps with
 * `classifyTestResult`.
 */
export async function runTestCommand(opts: RunTestCommandOptions): Promise<RawTestResult> {
  const out = opts.out ?? process.stderr;
  const proc = execa(opts.testCommand, {
    cwd: opts.worktree,
    env: opts.env,
    reject: false,
    shell: true,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  let stdout = '';
  let stderr = '';
  proc.stdout?.on('data', (chunk: Buffer) => {
    const s = chunk.toString();
    stdout += s;
    out.write(s);
  });
  proc.stderr?.on('data', (chunk: Buffer) => {
    const s = chunk.toString();
    stderr += s;
    out.write(s);
  });
  const result = await proc;
  return {
    exitCode: typeof result.exitCode === 'number' ? result.exitCode : undefined,
    stdout,
    stderr,
    signal: typeof result.signal === 'string' ? result.signal : undefined,
  };
}

export interface RunVerifyGateOptions {
  config: ProjectConfig;
  worktree: string;
  key: string;
  env: NodeJS.ProcessEnv;
  resolvedAppUrl?: string;
  /** Where to log the resume agent's stdout/stderr. */
  resumeLogFile: string;
  /** Out stream for status lines. Default: process.stderr. */
  out?: NodeJS.WritableStream;
}

/**
 * Top-level wrapper that wires `runTestCommand` + a real claude resume into
 * `runVerifyGateLoop`. Caller is responsible for upstream skip decisions
 * (use `computeGateSkip` first); this function assumes the gate should fire.
 */
export async function runVerifyGate(opts: RunVerifyGateOptions): Promise<GateLoopResult> {
  const authored = opts.config.playwright?.authored;
  if (!authored) throw new Error('runVerifyGate: playwright.authored is required');
  const out = opts.out ?? process.stderr;

  const runGate: GateRunner = async () => {
    out.write(pc.dim(`→ verifying e2e: ${authored.test_command} (cwd ${opts.worktree})\n`));
    const raw = await runTestCommand({
      testCommand: authored.test_command,
      worktree: opts.worktree,
      env: opts.resolvedAppUrl ? { ...opts.env, CREW_APP_URL: opts.resolvedAppUrl } : opts.env,
      out,
    });
    return classifyTestResult(raw);
  };

  const resumeAgent: AgentResumer = async ({ message, attempt }) => {
    out.write(
      pc.yellow(`\n→ e2e gate failed; resuming agent (attempt ${attempt}) with feedback\n`),
    );
    await spawnAndStreamFixPr({
      key: opts.key,
      worktree: opts.worktree,
      message,
      logFile: opts.resumeLogFile,
      env: opts.env,
      resolvedAppUrl: opts.resolvedAppUrl,
      out,
    });
  };

  return runVerifyGateLoop({
    verifyMaxAttempts: authored.verify_max_attempts,
    runGate,
    resumeAgent,
  });
}

interface SpawnAndStreamFixPrOptions {
  key: string;
  worktree: string;
  message: string;
  logFile: string;
  env: NodeJS.ProcessEnv;
  resolvedAppUrl?: string;
  out: NodeJS.WritableStream;
}

async function spawnAndStreamFixPr(opts: SpawnAndStreamFixPrOptions): Promise<void> {
  const session = findLatestSession({ worktree: opts.worktree });
  if (!session) {
    throw new Error(
      `verify gate: no claude session found at ${opts.worktree}; cannot resume agent`,
    );
  }

  const repoPath = deriveRepoPath(opts.worktree, opts.key);
  const projectConfig = await discoverProjectConfig(repoPath);
  if (!projectConfig) {
    throw new Error(`verify gate: no crew project config found from ${repoPath}`);
  }

  const dockerPorts = needsDockerPorts(projectConfig)
    ? readDockerPortsFromEnvFile(opts.worktree)
    : undefined;

  const prompt = buildFixPrPrompt({
    key: opts.key,
    feedback: opts.message,
    feedbackSource: 'crew e2e gate',
    playwright: playwrightFixPrOptsFor(projectConfig, opts.resolvedAppUrl),
    brunoSmoke: brunoSmokeOptionsFor(projectConfig, opts.worktree, dockerPorts),
  });

  const sub = spawnClaudeResume({
    sessionId: session.sessionId,
    prompt,
    logFile: opts.logFile,
    cwd: opts.worktree,
    env: opts.resolvedAppUrl ? { CREW_APP_URL: opts.resolvedAppUrl } : undefined,
  });

  let signaled = false;
  const onSignal = (): void => {
    signaled = true;
    opts.out.write(pc.yellow('\n→ aborting e2e gate resume…\n'));
    sub.kill('SIGTERM');
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  const abort = new AbortController();
  void Promise.resolve(sub)
    .catch(() => {})
    .finally(() => abort.abort());

  try {
    await streamTranscript({
      transcriptPath: session.transcriptPath,
      signal: abort.signal,
      startAtEnd: true,
    });
    try {
      await sub;
    } catch {
      /* ignore — agent rc is captured separately by the gate's next pass */
    }
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }

  if (signaled) {
    throw new Error('e2e gate resume aborted by user');
  }

  // Touch the resume log so callers can confirm it was written even if the
  // agent produced no stderr/stdout (empty transcripts happen on instant exits).
  if (!existsSync(opts.logFile)) {
    createWriteStream(opts.logFile, { flags: 'a' }).end();
  }
}

function deriveRepoPath(worktree: string, key: string): string {
  const suffix = `-${key}`;
  if (worktree.endsWith(suffix)) {
    return worktree.slice(0, -suffix.length);
  }
  return worktree;
}
