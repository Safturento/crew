import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  emitStateEvent,
  emitStateEventSync,
  stateEventsFilePath,
  stateEventsRootForHome,
  ensureStateEventsDir,
  stateEventsChownRemediation,
  emitFailureLine,
  type EnsureStateEventsDirDeps,
} from './index.js';

describe('emitStateEvent', () => {
  it('appends a well-formed JSONL line with a generated eventId + ts', async () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-se-'));
    await emitStateEvent('CREW-1', { event: 'run_started', source: 'cli-run' }, { home });
    const line = readFileSync(stateEventsFilePath('CREW-1', home), 'utf8').trim();
    const parsed = JSON.parse(line);
    expect(parsed.event).toBe('run_started');
    expect(parsed.key).toBe('CREW-1');
    expect(parsed.source).toBe('cli-run');
    expect(typeof parsed.eventId).toBe('string');
    expect(parsed.eventId.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(parsed.ts))).toBe(false);
  });

  it('carries optional fields (exitCode) through', async () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-se-'));
    await emitStateEvent(
      'CREW-2',
      { event: 'run_exited', source: 'runner-exit', exitCode: 0 },
      { home },
    );
    const line = readFileSync(stateEventsFilePath('CREW-2', home), 'utf8').trim();
    const parsed = JSON.parse(line);
    expect(parsed.exitCode).toBe(0);
  });

  it('never throws on an unwritable home (best-effort)', async () => {
    await expect(
      emitStateEvent(
        'CREW-1',
        { event: 'run_exited', source: 'runner-exit', exitCode: 0 },
        { home: '/dev/null/nope' },
      ),
    ).resolves.toBeUndefined();
  });
});

describe('emitStateEventSync', () => {
  it('appends a well-formed JSONL line synchronously', () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-se-'));
    emitStateEventSync(
      'CREW-3',
      { event: 'run_exited', source: 'runner-exit', exitCode: 1 },
      { home },
    );
    const line = readFileSync(stateEventsFilePath('CREW-3', home), 'utf8').trim();
    const parsed = JSON.parse(line);
    expect(parsed.event).toBe('run_exited');
    expect(parsed.exitCode).toBe(1);
    expect(typeof parsed.eventId).toBe('string');
  });

  it('never throws on an unwritable home (best-effort)', () => {
    expect(() =>
      emitStateEventSync(
        'CREW-1',
        { event: 'finish_completed', source: 'cli-finish' },
        { home: '/dev/null/nope' },
      ),
    ).not.toThrow();
  });
});

describe('ensureStateEventsDir', () => {
  function deps(over: Partial<EnsureStateEventsDirDeps> = {}): EnsureStateEventsDirDeps {
    return { mkdir: vi.fn(), isWritable: () => true, ...over };
  }

  it('creates the resolved state-events dir and reports it writable', () => {
    const mkdir = vi.fn();
    const result = ensureStateEventsDir({ home: '/home/u' }, deps({ mkdir }));
    expect(mkdir).toHaveBeenCalledWith(stateEventsRootForHome('/home/u'));
    expect(result).toEqual({ dir: stateEventsRootForHome('/home/u'), writable: true });
  });

  it('reports the dir non-writable when the writability probe fails', () => {
    const result = ensureStateEventsDir({ home: '/home/u' }, deps({ isWritable: () => false }));
    expect(result).toEqual({ dir: stateEventsRootForHome('/home/u'), writable: false });
  });

  it('swallows a mkdir failure and falls back to the writability probe', () => {
    const result = ensureStateEventsDir(
      { home: '/home/u' },
      deps({
        mkdir: () => {
          throw new Error('EACCES');
        },
        isWritable: () => false,
      }),
    );
    expect(result).toEqual({ dir: stateEventsRootForHome('/home/u'), writable: false });
  });

  it('actually creates a real dir and reports it writable (no deps injected)', () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-se-ensure-'));
    const result = ensureStateEventsDir({ home });
    expect(result.dir).toBe(stateEventsRootForHome(home));
    expect(result.writable).toBe(true);
    // emitting now succeeds against the pre-created dir
    emitStateEventSync('CREW-9', { event: 'run_started', source: 'cli-run' }, { home });
    expect(readFileSync(stateEventsFilePath('CREW-9', home), 'utf8')).toContain('run_started');
  });
});

describe('stateEventsChownRemediation', () => {
  it('names the dir and the chown command', () => {
    const msg = stateEventsChownRemediation('/home/u/.crew/state-events');
    expect(msg).toContain('/home/u/.crew/state-events');
    expect(msg).toContain('sudo chown -R "$(id -u):$(id -g)" /home/u/.crew/state-events');
  });
});

describe('emitFailureLine', () => {
  it('appends the chown remediation for a permission error (EACCES)', () => {
    const err = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const line = emitFailureLine('/dir', 'CREW-1', 'run_started', err);
    expect(line).toContain('failed to emit state event CREW-1/run_started');
    expect(line).toContain('sudo chown -R');
    expect(line).toContain('/dir');
  });

  it('appends the chown remediation for EPERM too', () => {
    const err = Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
    expect(emitFailureLine('/dir', 'CREW-1', 'run_started', err)).toContain('sudo chown -R');
  });

  it('does not append remediation for a non-permission error', () => {
    const err = Object.assign(new Error('no such dir'), { code: 'ENOENT' });
    const line = emitFailureLine('/dir', 'CREW-1', 'run_started', err);
    expect(line).toContain('failed to emit state event');
    expect(line).not.toContain('sudo chown');
  });
});
