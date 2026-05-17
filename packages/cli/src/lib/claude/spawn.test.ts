import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execa } from 'execa';
import {
  spawnClaudeFresh,
  spawnClaudeResume,
  claudeSpawnEnv,
  CLAUDE_PERMISSION_FLAG,
} from './spawn.js';

vi.mock('execa', () => ({ execa: vi.fn() }));

const mockedExeca = vi.mocked(execa);

beforeEach(() => mockedExeca.mockReset());

describe('spawnClaudeResume', () => {
  it('spawns claude with the resume + headless flags and the prompt', () => {
    const fakeSubprocess = {
      stdout: { pipe: vi.fn() },
      stderr: { pipe: vi.fn() },
    };
    mockedExeca.mockReturnValueOnce(fakeSubprocess as never);

    const result = spawnClaudeResume({
      sessionId: 'abc-123',
      prompt: 'do the thing',
      logFile: '/tmp/x.log',
      cwd: '/tmp/worktree',
    });

    expect(mockedExeca).toHaveBeenCalledWith(
      'claude',
      ['--dangerously-skip-permissions', '--resume', 'abc-123', '-p', 'do the thing'],
      expect.objectContaining({ env: expect.any(Object) }),
    );
    expect(result).toBe(fakeSubprocess);
  });

  it('passes cwd to execa so the resumed claude resolves the worktree project', () => {
    mockedExeca.mockReturnValueOnce({
      stdout: { pipe: vi.fn() },
      stderr: { pipe: vi.fn() },
    } as never);

    spawnClaudeResume({
      sessionId: 's',
      prompt: 'p',
      logFile: '/tmp/x.log',
      cwd: '/home/me/Repos/Recipes-KAN-13',
    });

    expect(mockedExeca).toHaveBeenCalledWith(
      'claude',
      expect.any(Array),
      expect.objectContaining({ cwd: '/home/me/Repos/Recipes-KAN-13' }),
    );
  });

  it('pipes both stdout and stderr to the log file', () => {
    const stdoutPipe = vi.fn();
    const stderrPipe = vi.fn();
    const fakeSubprocess = {
      stdout: { pipe: stdoutPipe },
      stderr: { pipe: stderrPipe },
    };
    mockedExeca.mockReturnValueOnce(fakeSubprocess as never);

    spawnClaudeResume({ sessionId: 's', prompt: 'p', logFile: '/tmp/x.log', cwd: '/tmp/wt' });

    expect(stdoutPipe).toHaveBeenCalledTimes(1);
    expect(stderrPipe).toHaveBeenCalledTimes(1);
  });

  it('prepends ~/.local/bin to PATH if missing', () => {
    const original = process.env.PATH;
    process.env.PATH = '/usr/bin:/bin';
    try {
      mockedExeca.mockReturnValueOnce({
        stdout: { pipe: vi.fn() },
        stderr: { pipe: vi.fn() },
      } as never);
      spawnClaudeResume({ sessionId: 's', prompt: 'p', logFile: '/tmp/x.log', cwd: '/tmp/wt' });
      expect(mockedExeca).toHaveBeenCalledWith(
        'claude',
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            PATH: expect.stringMatching(/^\/[^:]+\/\.local\/bin:\/usr\/bin:\/bin$/),
          }),
        }),
      );
    } finally {
      process.env.PATH = original;
    }
  });

  it('merges caller-supplied env vars on top of process.env (preserving PATH augmentation)', () => {
    mockedExeca.mockReturnValueOnce({
      stdout: { pipe: vi.fn() },
      stderr: { pipe: vi.fn() },
    } as never);

    spawnClaudeResume({
      sessionId: 's',
      prompt: 'p',
      logFile: '/tmp/x.log',
      cwd: '/tmp/wt',
      env: { CREW_APP_URL: 'https://localhost:8443' },
    });

    expect(mockedExeca).toHaveBeenCalledWith(
      'claude',
      expect.any(Array),
      expect.objectContaining({
        env: expect.objectContaining({
          CREW_APP_URL: 'https://localhost:8443',
          PATH: expect.any(String),
        }),
      }),
    );
  });

  it('leaves PATH alone if ~/.local/bin is already present', () => {
    const original = process.env.PATH;
    const home = process.env.HOME ?? '/home/x';
    const localBin = `${home}/.local/bin`;
    process.env.PATH = `${localBin}:/usr/bin:/bin`;
    try {
      mockedExeca.mockReturnValueOnce({
        stdout: { pipe: vi.fn() },
        stderr: { pipe: vi.fn() },
      } as never);
      spawnClaudeResume({ sessionId: 's', prompt: 'p', logFile: '/tmp/x.log', cwd: '/tmp/wt' });
      expect(mockedExeca).toHaveBeenCalledWith(
        'claude',
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({ PATH: `${localBin}:/usr/bin:/bin` }),
        }),
      );
    } finally {
      process.env.PATH = original;
    }
  });
});

describe('claudeSpawnEnv', () => {
  it('CLAUDE_PERMISSION_FLAG is the headless permission flag', () => {
    expect(CLAUDE_PERMISSION_FLAG).toBe('--dangerously-skip-permissions');
  });

  it('prepends ~/.local/bin to PATH if missing', () => {
    const original = process.env.PATH;
    process.env.PATH = '/usr/bin:/bin';
    try {
      expect(claudeSpawnEnv().PATH).toMatch(/^\/[^:]+\/\.local\/bin:\/usr\/bin:\/bin$/);
    } finally {
      process.env.PATH = original;
    }
  });

  it('leaves PATH alone if ~/.local/bin is already present', () => {
    const original = process.env.PATH;
    const home = process.env.HOME ?? '/home/x';
    const localBin = `${home}/.local/bin`;
    process.env.PATH = `${localBin}:/usr/bin:/bin`;
    try {
      expect(claudeSpawnEnv().PATH).toBe(`${localBin}:/usr/bin:/bin`);
    } finally {
      process.env.PATH = original;
    }
  });

  it('merges caller-supplied env vars on top of process.env', () => {
    const merged = claudeSpawnEnv({ CREW_APP_URL: 'https://localhost:8443' });
    expect(merged.CREW_APP_URL).toBe('https://localhost:8443');
    expect(merged.PATH).toEqual(expect.any(String));
  });
});

describe('spawnClaudeFresh', () => {
  it('spawns claude without --resume so a fresh conversation starts', () => {
    mockedExeca.mockReturnValueOnce({
      stdout: { pipe: vi.fn() },
      stderr: { pipe: vi.fn() },
    } as never);

    spawnClaudeFresh({
      prompt: 'do the thing',
      logFile: '/tmp/x.log',
      cwd: '/tmp/worktree',
    });

    expect(mockedExeca).toHaveBeenCalledWith(
      'claude',
      ['--dangerously-skip-permissions', '-p', 'do the thing'],
      expect.objectContaining({ env: expect.any(Object) }),
    );
  });

  it('passes cwd to execa so claude resolves the worktree project', () => {
    mockedExeca.mockReturnValueOnce({
      stdout: { pipe: vi.fn() },
      stderr: { pipe: vi.fn() },
    } as never);

    spawnClaudeFresh({
      prompt: 'p',
      logFile: '/tmp/x.log',
      cwd: '/home/me/Repos/Recipes-KAN-13',
    });

    expect(mockedExeca).toHaveBeenCalledWith(
      'claude',
      expect.any(Array),
      expect.objectContaining({ cwd: '/home/me/Repos/Recipes-KAN-13' }),
    );
  });

  it('merges caller-supplied env vars (preserving PATH augmentation)', () => {
    mockedExeca.mockReturnValueOnce({
      stdout: { pipe: vi.fn() },
      stderr: { pipe: vi.fn() },
    } as never);

    spawnClaudeFresh({
      prompt: 'p',
      logFile: '/tmp/x.log',
      cwd: '/tmp/wt',
      env: { CREW_APP_URL: 'https://localhost:8443' },
    });

    expect(mockedExeca).toHaveBeenCalledWith(
      'claude',
      expect.any(Array),
      expect.objectContaining({
        env: expect.objectContaining({
          CREW_APP_URL: 'https://localhost:8443',
          PATH: expect.any(String),
        }),
      }),
    );
  });
});
