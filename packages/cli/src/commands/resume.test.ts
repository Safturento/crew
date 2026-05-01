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

vi.mock('../lib/sessions/discovery.js', () => ({
  findLatestSession: vi.fn(),
  encodeWorktreeProjectPath: vi.fn(),
}));

vi.mock('../lib/run/agent-environment.js', () => ({
  prepareAgentEnvironment: vi.fn(async () => ({ resolvedAppUrl: undefined })),
}));

vi.mock('../lib/run/worktree-state.js', () => ({
  readWorktreeState: vi.fn(async () => ({
    branch: 'KAN-1',
    commitsAhead: 0,
    uncommittedCount: 0,
  })),
}));

vi.mock('../lib/run/agent-options.js', () => ({
  needsDockerPorts: vi.fn(() => false),
  readDockerPortsFromEnvFile: vi.fn(),
  brunoSmokeOptionsFor: vi.fn(() => undefined),
  playwrightFixPrOptsFor: vi.fn(() => undefined),
  playwrightTicketOptsFor: vi.fn(() => undefined),
}));

vi.mock('../lib/claude/spawn.js', () => ({
  spawnClaudeResume: vi.fn(() => Promise.resolve({ exitCode: 0 })),
  spawnClaudeFresh: vi.fn(() => Promise.resolve({ exitCode: 0 })),
}));

vi.mock('../lib/prompts/skills.js', () => ({
  discoverSkills: vi.fn(() => []),
  renderDiscoveredSkillsBlock: vi.fn(() => ''),
}));

import { existsSync } from 'node:fs';
import { discoverProjectConfig } from '../lib/discover-project-config.js';
import { findLatestSession } from '../lib/sessions/discovery.js';
import { spawnClaudeFresh, spawnClaudeResume } from '../lib/claude/spawn.js';
import { runResume } from './resume.js';

const existsMock = vi.mocked(existsSync);
const discoverMock = vi.mocked(discoverProjectConfig);
const findSessionMock = vi.mocked(findLatestSession);
const spawnFreshMock = vi.mocked(spawnClaudeFresh);
const spawnResumeMock = vi.mocked(spawnClaudeResume);

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
    spawnFreshMock.mockReturnValue(Promise.resolve({ exitCode: 0 }) as never);
    spawnResumeMock.mockReturnValue(Promise.resolve({ exitCode: 0 }) as never);
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
});
