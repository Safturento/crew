import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LiveProcess } from 'crew-shared';
import { readPidFile, renderLiveProcesses, runnerCommand } from './runner.js';

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

describe('renderLiveProcesses', () => {
  function proc(over: Partial<LiveProcess> = {}): LiveProcess {
    return {
      agentKey: 'CREW-231',
      command: 'run',
      pid: 4242,
      pgid: 4242,
      actionRequestId: 1,
      spawnedAt: '2026-06-16T00:00:00.000Z',
      state: 'running',
      project: 'crew',
      ...over,
    };
  }

  it('renders one line per live process with key, command, pid, state and duration', () => {
    const now = new Date('2026-06-16T00:02:30.000Z');
    const lines = renderLiveProcesses([proc()], now);
    const joined = lines.join('\n');
    expect(joined).toContain('CREW-231');
    expect(joined).toContain('run');
    expect(joined).toContain('4242');
    expect(joined).toContain('running');
    expect(joined).toContain('2m 30s');
  });

  it('renders a line per process when several are live', () => {
    const lines = renderLiveProcesses(
      [proc({ agentKey: 'CREW-1' }), proc({ agentKey: 'CREW-2', command: 'fix-pr' })],
      new Date('2026-06-16T00:00:05.000Z'),
    );
    const joined = lines.join('\n');
    expect(joined).toContain('CREW-1');
    expect(joined).toContain('CREW-2');
    expect(joined).toContain('fix-pr');
  });

  it('reports an empty registry rather than a bare header', () => {
    const lines = renderLiveProcesses([], new Date());
    expect(lines.join('\n')).toMatch(/no live processes/i);
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
