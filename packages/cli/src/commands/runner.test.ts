import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPidFile, runnerCommand } from './runner.js';

const tmpDirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'crew-runner-test-'));
  tmpDirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('readPidFile', () => {
  it('parses a positive integer pid', () => {
    const dir = tmp();
    const f = join(dir, 'runner.pid');
    writeFileSync(f, '4242\n');
    expect(readPidFile(f)).toBe(4242);
  });

  it('returns null when the file is absent', () => {
    expect(readPidFile(join(tmp(), 'nope.pid'))).toBeNull();
  });

  it('returns null for garbage contents', () => {
    const dir = tmp();
    const f = join(dir, 'runner.pid');
    writeFileSync(f, 'not-a-pid');
    expect(readPidFile(f)).toBeNull();
  });

  it('returns null for a non-positive pid', () => {
    const dir = tmp();
    const f = join(dir, 'runner.pid');
    writeFileSync(f, '0');
    expect(readPidFile(f)).toBeNull();
  });
});

describe('runnerCommand', () => {
  it('registers the public lifecycle subcommands and the internal entrypoints', () => {
    const names = runnerCommand.commands.map((c) => c.name());
    expect(names).toEqual(
      expect.arrayContaining([
        'start',
        'stop',
        'restart',
        'status',
        'logs',
        '__supervise',
        '__worker',
      ]),
    );
  });

  it('lists only the public subcommands in --help (internal ones are hidden)', () => {
    const help = runnerCommand.helpInformation();
    for (const name of ['start', 'stop', 'restart', 'status', 'logs']) {
      expect(help).toContain(name);
    }
    expect(help).not.toContain('__supervise');
    expect(help).not.toContain('__worker');
  });
});
