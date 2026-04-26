import { describe, it, expect } from 'vitest';
import { runCommand } from './run.js';

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
