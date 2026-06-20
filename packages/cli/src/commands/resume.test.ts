import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as nodeFs from 'node:fs';
import type { ProjectConfig } from 'crew-shared';

vi.mock('node:fs', async () => {
  const actual = (await vi.importActual('node:fs')) as typeof nodeFs;
  return {
    ...actual,
    existsSync: vi.fn(() => true),
  };
});

vi.mock('execa', () => ({ execa: vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })) }));

vi.mock('../lib/discover-project-config.js', () => ({
  discoverProjectConfig: vi.fn(),
}));

vi.mock('../lib/sessions/index.js', () => ({
  findLatestSession: vi.fn(),
}));

vi.mock('../lib/run/agent-environment.js', () => ({
  prepareAgentEnvironment: vi.fn(async () => ({ resolvedAppUrl: undefined })),
}));

vi.mock('../lib/run/worktree-state.js', () => ({
  readWorktreeState: vi.fn(async () => ({
    branch: 'KAN-1',
    commitsAhead: 0,
    uncommittedCount: 0,
    defaultBranch: 'main',
  })),
}));

vi.mock('../lib/run/agent-options.js', () => ({
  needsDockerPorts: vi.fn(() => false),
  readDockerPortsFromEnvFile: vi.fn(),
  readEnvBaseMap: vi.fn(() => undefined),
  brunoSmokeOptionsFor: vi.fn(() => undefined),
  playwrightFixPrOptsFor: vi.fn(() => undefined),
  playwrightTicketOptsFor: vi.fn(() => undefined),
}));

vi.mock('../lib/claude/spawn.js', () => {
  const fakeKillable = (): {
    exitCode: number;
    kill: () => boolean;
    then: PromiseLike<unknown>['then'];
    catch: Promise<unknown>['catch'];
    finally: Promise<unknown>['finally'];
  } => {
    const promise = Promise.resolve({ exitCode: 0 });
    return {
      exitCode: 0,
      kill: () => true,
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
      finally: promise.finally.bind(promise),
    } as never;
  };
  return {
    spawnClaudeResume: vi.fn(() => fakeKillable()),
    spawnClaudeFresh: vi.fn(() => fakeKillable()),
  };
});

vi.mock('../lib/run/stream-transcript.js', () => ({
  streamTranscript: vi.fn(async (opts: { transcriptPath?: string; projectDir?: string }) => ({
    transcriptPath: opts.transcriptPath ?? opts.projectDir ?? null,
  })),
}));

vi.mock('../lib/pause-sentinel/index.js', () => ({
  consumePauseSentinel: vi.fn(() => false),
}));

// Keep run.ts's own lifecycle emitters real (resume's flow never triggers
// them), but stub the three resume drives so they can be asserted without
// touching ~/.crew.
vi.mock('../lib/state-events/index.js', async () => {
  const actual = await vi.importActual('../lib/state-events/index.js');
  return {
    ...actual,
    emitRunStarted: vi.fn(async () => {}),
    emitDispatchExited: vi.fn(async () => {}),
    emitRunPausedSync: vi.fn(() => {}),
  };
});

import { existsSync } from 'node:fs';
import { discoverProjectConfig } from '../lib/discover-project-config.js';
import { findLatestSession } from '../lib/sessions/index.js';
import { spawnClaudeFresh, spawnClaudeResume } from '../lib/claude/spawn.js';
import { streamTranscript } from '../lib/run/stream-transcript.js';
import { consumePauseSentinel } from '../lib/pause-sentinel/index.js';
import { emitRunStarted, emitDispatchExited, emitRunPausedSync } from '../lib/state-events/index.js';
import { runResume } from './resume.js';

const existsMock = vi.mocked(existsSync);
const discoverMock = vi.mocked(discoverProjectConfig);
const findSessionMock = vi.mocked(findLatestSession);
const spawnFreshMock = vi.mocked(spawnClaudeFresh);
const spawnResumeMock = vi.mocked(spawnClaudeResume);
const streamTranscriptMock = vi.mocked(streamTranscript);
const consumePauseMock = vi.mocked(consumePauseSentinel);
const emitRunStartedMock = vi.mocked(emitRunStarted);
const emitDispatchExitedMock = vi.mocked(emitDispatchExited);
const emitRunPausedMock = vi.mocked(emitRunPausedSync);

const baseConfig: ProjectConfig = {
  name: 'test',
  repo_path: '/repo',
  default_branch: 'main',
  jira: { project_key: 'X', site: 'https://x.atlassian.net' },
  github: { repo: 'a/b' },
  db_clone: {
    postgres_service: 'postgres',
    postgres_user: 'postgres',
    postgres_database: 'postgres',
    required_tables: [],
    exclude_tables: ['kysely_migration*'],
  },
} as ProjectConfig;

describe('runResume', () => {
  let logs: string[];
  let logSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logs = [];
    logSpy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string) => {
      logs.push(String(chunk));
      return true;
    }) as never);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
    existsMock.mockReset();
    existsMock.mockReturnValue(true);
    discoverMock.mockReset();
    discoverMock.mockResolvedValue(baseConfig);
    findSessionMock.mockReset();
    spawnFreshMock.mockReset();
    spawnResumeMock.mockReset();
    streamTranscriptMock.mockReset();
    streamTranscriptMock.mockImplementation(async (opts) => ({
      transcriptPath: opts.transcriptPath ?? opts.projectDir ?? null,
    }));
    const makeFakeSub = (): never => {
      const promise = Promise.resolve({ exitCode: 0 });
      return {
        kill: () => true,
        then: promise.then.bind(promise),
        catch: promise.catch.bind(promise),
        finally: promise.finally.bind(promise),
      } as never;
    };
    spawnFreshMock.mockImplementation(makeFakeSub);
    spawnResumeMock.mockImplementation(makeFakeSub);
    consumePauseMock.mockReset();
    consumePauseMock.mockReturnValue(false);
    emitRunStartedMock.mockReset();
    emitRunStartedMock.mockResolvedValue(undefined);
    emitDispatchExitedMock.mockReset();
    emitDispatchExitedMock.mockResolvedValue(undefined);
    emitRunPausedMock.mockReset();
  });

  afterEach(() => {
    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('errors when worktree does not exist', async () => {
    existsMock.mockReturnValue(false);

    await expect(runResume('KAN-1', {})).rejects.toThrow('process.exit(1)');
    expect(logs.join('')).toMatch(/no worktree at/);
    expect(logs.join('')).toMatch(/did you mean 'crew run KAN-1'/);
  });

  it('happy path with session: spawns claude --resume with resume prompt', async () => {
    findSessionMock.mockReturnValue({
      sessionId: 'abc-123',
      transcriptPath: '/tmp/x.jsonl',
    });

    await runResume('KAN-1', {});

    expect(spawnResumeMock).toHaveBeenCalledTimes(1);
    expect(spawnFreshMock).not.toHaveBeenCalled();
    const call = spawnResumeMock.mock.calls[0]?.[0];
    expect(call?.sessionId).toBe('abc-123');
    expect(call?.prompt).toContain("You're being resumed on KAN-1");
    expect(logs.join('')).toMatch(/Resuming session for KAN-1/);
  });

  it('happy path with no session: spawns fresh claude with ticket prompt', async () => {
    findSessionMock.mockReturnValue(null);

    await runResume('KAN-1', {});

    expect(spawnFreshMock).toHaveBeenCalledTimes(1);
    expect(spawnResumeMock).not.toHaveBeenCalled();
    const call = spawnFreshMock.mock.calls[0]?.[0];
    expect(call?.prompt).toContain('Jira ticket KAN-1');
    expect(logs.join('')).toMatch(/no prior session found/);
  });

  it('passes -m message to the resume prompt builder', async () => {
    findSessionMock.mockReturnValue({
      sessionId: 'abc-123',
      transcriptPath: '/tmp/x.jsonl',
    });

    await runResume('KAN-1', { message: 'try doing Y instead' });

    const call = spawnResumeMock.mock.calls[0]?.[0];
    expect(call?.prompt).toContain('Additional context from the user');
    expect(call?.prompt).toContain('try doing Y instead');
  });

  it('passes -m message to the ticket prompt builder when no session', async () => {
    findSessionMock.mockReturnValue(null);

    await runResume('KAN-1', { message: 'focus on lib/x' });

    const call = spawnFreshMock.mock.calls[0]?.[0];
    expect(call?.prompt).toContain('Additional context from the user');
    expect(call?.prompt).toContain('focus on lib/x');
  });

  it('threads envVars from readEnvBaseMap through to prepareAgentEnvironment + brunoSmokeOptionsFor', async () => {
    findSessionMock.mockReturnValue(null);
    const fakeEnvVars = { APP_URL: 'https://localhost:28905', POSTGRES_PORT: '15432' };
    const { readEnvBaseMap, brunoSmokeOptionsFor } = await import('../lib/run/agent-options.js');
    const readEnvMock = vi.mocked(readEnvBaseMap);
    const brunoMock = vi.mocked(brunoSmokeOptionsFor);
    readEnvMock.mockReturnValueOnce(fakeEnvVars);
    const { prepareAgentEnvironment } = await import('../lib/run/agent-environment.js');
    const prepMock = vi.mocked(prepareAgentEnvironment);

    await runResume('KAN-1', {});

    expect(prepMock).toHaveBeenCalledWith(expect.objectContaining({ envVars: fakeEnvVars }));
    expect(brunoMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
      fakeEnvVars,
    );
  });

  it('threads --skip-docker through to prepareAgentEnvironment', async () => {
    findSessionMock.mockReturnValue(null);
    const { prepareAgentEnvironment } = await import('../lib/run/agent-environment.js');
    const prepMock = vi.mocked(prepareAgentEnvironment);

    await runResume('KAN-1', { skipDocker: true });

    expect(prepMock).toHaveBeenCalledWith(expect.objectContaining({ skipDocker: true }));
  });

  it('rejects whitespace-only -m so users notice typos', async () => {
    await expect(runResume('KAN-1', { message: '   \n  ' })).rejects.toThrow('process.exit(1)');
    expect(logs.join('')).toMatch(/empty message provided to -m/);
  });

  it('streams the transcript via streamTranscript when resuming an existing session', async () => {
    findSessionMock.mockReturnValue({
      sessionId: 'abc-123',
      transcriptPath: '/known/transcripts/abc.jsonl',
    });

    await runResume('KAN-1', {});

    expect(streamTranscriptMock).toHaveBeenCalledTimes(1);
    const opts = streamTranscriptMock.mock.calls[0]?.[0];
    expect(opts?.transcriptPath).toBe('/known/transcripts/abc.jsonl');
    expect(opts?.projectDir).toBeUndefined();
    expect(opts?.startAtEnd).toBe(true);
    expect(opts?.signal).toBeInstanceOf(AbortSignal);
  });

  it('streams the transcript via streamTranscript by polling projectDir when no prior session', async () => {
    findSessionMock.mockReturnValue(null);

    await runResume('KAN-1', {});

    expect(streamTranscriptMock).toHaveBeenCalledTimes(1);
    const opts = streamTranscriptMock.mock.calls[0]?.[0];
    expect(opts?.transcriptPath).toBeUndefined();
    // projectDir is derived from the worktree (~/.claude/projects/<encoded>),
    // so just assert it's a non-empty string under .claude/projects.
    expect(opts?.projectDir).toMatch(/\.claude\/projects\//);
    expect(opts?.startAtEnd).toBeFalsy();
    expect(opts?.signal).toBeInstanceOf(AbortSignal);
  });

  // Regression guard: the original bug was that resume's SIGINT handler
  // called process.exit(130) inline, which short-circuited streamTranscript's
  // final drain. The handler must now only flag + kill; abort/exit happens
  // after streamTranscript returns.
  it('SIGINT kills the subprocess and sets exitCode=130 without calling process.exit inline', async () => {
    findSessionMock.mockReturnValue({
      sessionId: 'abc-123',
      transcriptPath: '/tmp/x.jsonl',
    });

    // Track the order of kill / streamTranscript-exit / process.exit so the
    // assertion can prove the handler did not short-circuit the drain.
    const events: string[] = [];

    let resolveStream: (() => void) | null = null;
    streamTranscriptMock.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        resolveStream = (): void => {
          events.push('stream-resolved');
          resolve();
        };
      });
      return { transcriptPath: '/tmp/x.jsonl' };
    });

    let resolveSub: (() => void) | null = null;
    spawnResumeMock.mockImplementation(() => {
      const promise = new Promise<{ exitCode: number }>((resolve) => {
        resolveSub = (): void => {
          events.push('sub-resolved');
          resolve({ exitCode: 0 });
        };
      });
      return {
        kill: vi.fn(() => {
          events.push('sub-killed');
          return true;
        }),
        then: promise.then.bind(promise),
        catch: promise.catch.bind(promise),
        finally: promise.finally.bind(promise),
      } as never;
    });

    const prevExitCode = process.exitCode;
    process.exitCode = undefined;
    const run = runResume('KAN-1', {});

    // Wait one microtask for streamUntilExit to register its SIGINT handler.
    await new Promise<void>((resolve) => setImmediate(resolve));

    // Fire the SIGINT handler manually. Using process.emit would invoke every
    // SIGINT listener (including vitest's own), and exitSpy would throw if
    // process.exit got called. Calling the registered handler directly proves
    // the handler under test does not call process.exit.
    const sigintListeners = process.listeners('SIGINT');
    const handler = sigintListeners[sigintListeners.length - 1];
    expect(handler).toBeTypeOf('function');
    expect(exitSpy).not.toHaveBeenCalled();
    handler!('SIGINT');
    // Critical assertion: handler must not have called process.exit inline.
    expect(exitSpy).not.toHaveBeenCalled();
    expect(events).toContain('sub-killed');

    // Now resolve the subprocess (which triggers abort.abort() via finally),
    // then resolve the streamTranscript promise so the helper unwinds in the
    // expected order: stream returns → sub awaits → exit code set.
    expect(resolveSub).toBeTypeOf('function');
    expect(resolveStream).toBeTypeOf('function');
    resolveSub!();
    // Tail's read-then-check-abort guarantees one final pass — simulate that
    // by resolving the stream after the sub.
    resolveStream!();

    await run;
    expect(process.exitCode).toBe(130);
    expect(exitSpy).not.toHaveBeenCalled();
    // Drain order: kill first, then sub resolved, then stream drained.
    expect(events).toEqual(['sub-killed', 'sub-resolved', 'stream-resolved']);
    process.exitCode = prevExitCode;
  });

  // CREW-275 follow-on: resume must drive the run-state lifecycle the same way
  // `crew run` does, else an error-state row stays stuck in `error` (no
  // run_started) and a resumed run never settles (no run_exited). These guard
  // the full start → exit/pause lifecycle.
  describe('run-state lifecycle events', () => {
    it('emits run_started before spawning (session path) so error → running', async () => {
      findSessionMock.mockReturnValue({ sessionId: 'abc-123', transcriptPath: '/tmp/x.jsonl' });

      await runResume('KAN-1', {});

      expect(emitRunStartedMock).toHaveBeenCalledWith('KAN-1');
      // Must fire before the spawn so the daemon flips state as the run goes live.
      const startOrder = emitRunStartedMock.mock.invocationCallOrder[0]!;
      const spawnOrder = spawnResumeMock.mock.invocationCallOrder[0]!;
      expect(startOrder).toBeLessThan(spawnOrder);
    });

    it('emits run_started before spawning (fresh path)', async () => {
      findSessionMock.mockReturnValue(null);

      await runResume('KAN-1', {});

      expect(emitRunStartedMock).toHaveBeenCalledWith('KAN-1');
      const startOrder = emitRunStartedMock.mock.invocationCallOrder[0]!;
      const spawnOrder = spawnFreshMock.mock.invocationCallOrder[0]!;
      expect(startOrder).toBeLessThan(spawnOrder);
    });

    it('emits run_exited(0) after a clean resume so the run settles instead of staying running', async () => {
      findSessionMock.mockReturnValue({ sessionId: 'abc-123', transcriptPath: '/tmp/x.jsonl' });

      await runResume('KAN-1', {});

      expect(emitDispatchExitedMock).toHaveBeenCalledWith('KAN-1', 'run', 0);
      expect(emitRunPausedMock).not.toHaveBeenCalled();
    });

    it('emits run_exited with the non-zero code when the resumed agent re-crashes → daemon routes back to error', async () => {
      findSessionMock.mockReturnValue({ sessionId: 'abc-123', transcriptPath: '/tmp/x.jsonl' });
      spawnResumeMock.mockImplementation(() => {
        const promise = Promise.resolve({ exitCode: 2 });
        return {
          kill: () => true,
          then: promise.then.bind(promise),
          catch: promise.catch.bind(promise),
          finally: promise.finally.bind(promise),
        } as never;
      });

      await runResume('KAN-1', {});

      expect(emitDispatchExitedMock).toHaveBeenCalledWith('KAN-1', 'run', 2);
    });

    it('on a pause-interrupt emits run_paused (resumable) and NOT run_exited', async () => {
      findSessionMock.mockReturnValue({ sessionId: 'abc-123', transcriptPath: '/tmp/x.jsonl' });
      consumePauseMock.mockReturnValue(true);

      let resolveStream: (() => void) | null = null;
      streamTranscriptMock.mockImplementation(async () => {
        await new Promise<void>((resolve) => {
          resolveStream = resolve;
        });
        return { transcriptPath: '/tmp/x.jsonl' };
      });
      let resolveSub: (() => void) | null = null;
      spawnResumeMock.mockImplementation(() => {
        const promise = new Promise<{ exitCode: number }>((resolve) => {
          resolveSub = (): void => resolve({ exitCode: 130 });
        });
        return {
          kill: vi.fn(() => true),
          then: promise.then.bind(promise),
          catch: promise.catch.bind(promise),
          finally: promise.finally.bind(promise),
        } as never;
      });

      const prevExitCode = process.exitCode;
      process.exitCode = undefined;
      const run = runResume('KAN-1', {});
      await new Promise<void>((resolve) => setImmediate(resolve));

      const sigintListeners = process.listeners('SIGINT');
      const handler = sigintListeners[sigintListeners.length - 1];
      handler!('SIGINT');
      resolveSub!();
      resolveStream!();
      await run;

      expect(consumePauseMock).toHaveBeenCalledWith('KAN-1');
      expect(emitRunPausedMock).toHaveBeenCalledWith('KAN-1');
      expect(emitDispatchExitedMock).not.toHaveBeenCalled();
      process.exitCode = prevExitCode;
    });
  });
});
