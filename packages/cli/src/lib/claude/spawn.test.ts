import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execa } from 'execa';
import { spawnClaudeResume } from './spawn.js';

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
    });

    const [bin, args] = mockedExeca.mock.calls[0]!;
    expect(bin).toBe('claude');
    expect(args).toEqual([
      '--dangerously-skip-permissions',
      '--resume',
      'abc-123',
      '-p',
      'do the thing',
    ]);
    expect(result).toBe(fakeSubprocess);
  });

  it('pipes both stdout and stderr to the log file', () => {
    const stdoutPipe = vi.fn();
    const stderrPipe = vi.fn();
    const fakeSubprocess = {
      stdout: { pipe: stdoutPipe },
      stderr: { pipe: stderrPipe },
    };
    mockedExeca.mockReturnValueOnce(fakeSubprocess as never);

    spawnClaudeResume({ sessionId: 's', prompt: 'p', logFile: '/tmp/x.log' });

    expect(stdoutPipe).toHaveBeenCalledTimes(1);
    expect(stderrPipe).toHaveBeenCalledTimes(1);
  });
});
