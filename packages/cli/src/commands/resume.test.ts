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

vi.mock('../lib/prompts/skills.js', () => ({
  discoverSkills: vi.fn(() => []),
  renderDiscoveredSkillsBlock: vi.fn(() => ''),
}));

import { existsSync } from 'node:fs';
import { discoverProjectConfig } from '../lib/discover-project-config.js';
import { findLatestSession } from '../lib/sessions/index.js';
import { spawnClaudeFresh, spawnClaudeResume } from '../lib/claude/spawn.js';
import { streamTranscript } from '../lib/run/stream-transcript.js';
import { runResume } from './resume.js';

const existsMock = vi.mocked(existsSync);
const discoverMock = vi.mocked(discoverProjectConfig);
const findSessionMock = vi.mocked(findLatestSession);
const spawnFreshMock = vi.mocked(spawnClaudeFresh);
const spawnResumeMock = vi.mocked(spawnClaudeResume);
const streamTranscriptMock = vi.mocked(streamTranscript);

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
});
