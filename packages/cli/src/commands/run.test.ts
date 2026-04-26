import { describe, it, expect } from 'vitest';
import { resolveExitCode, runCommand } from './run.js';

describe('runCommand', () => {
  it('is named "run"', () => {
    expect(runCommand.name()).toBe('run');
  });

  it('takes a single required <key> argument', () => {
    const args = runCommand.registeredArguments;
    expect(args).toHaveLength(1);
    expect(args[0]?.name()).toBe('key');
    expect(args[0]?.required).toBe(true);
  });

  it('exposes a --skip-docker option', () => {
    const opts = runCommand.options;
    const skip = opts.find((o) => o.long === '--skip-docker');
    expect(skip).toBeDefined();
  });

  it('has a non-empty description', () => {
    expect(runCommand.description().length).toBeGreaterThan(0);
  });
});

describe('resolveExitCode', () => {
  it('returns the natural exit code when the process exited normally', () => {
    expect(resolveExitCode({ exitCode: 0 }, false)).toBe(0);
    expect(resolveExitCode({ exitCode: 7 }, false)).toBe(7);
  });

  it('returns 130 when the user signaled an abort, regardless of exit code', () => {
    expect(resolveExitCode({ exitCode: 0 }, true)).toBe(130);
    expect(resolveExitCode({ exitCode: undefined, signal: 'SIGTERM' }, true)).toBe(130);
  });

  it('returns 130 when the child died from SIGINT/SIGTERM even without a local handler firing', () => {
    expect(resolveExitCode({ signal: 'SIGINT' }, false)).toBe(130);
    expect(resolveExitCode({ signal: 'SIGTERM' }, false)).toBe(130);
  });

  it('falls back to 1 when neither exit code nor signal is known', () => {
    expect(resolveExitCode({}, false)).toBe(1);
  });
});
