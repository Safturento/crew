import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  emitRunStarted,
  emitFixprStarted,
  emitFinishCompleted,
  emitDispatchExited,
  emitDispatchExitedSync,
  stateEventsFilePath,
} from './index.js';

function readEvent(home: string, key: string): Record<string, unknown> {
  const line = readFileSync(stateEventsFilePath(key, home), 'utf8').trim();
  return JSON.parse(line) as Record<string, unknown>;
}

describe('crew run path', () => {
  it('emitRunStarted lands a run_started/cli-run event', async () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-se-'));
    await emitRunStarted('CREW-1', { home });
    const e = readEvent(home, 'CREW-1');
    expect(e.event).toBe('run_started');
    expect(e.source).toBe('cli-run');
  });

  it('emitDispatchExitedSync(run) lands a run_exited carrying the exit code', () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-se-'));
    emitDispatchExitedSync('CREW-1', 'run', 0, { home });
    const e = readEvent(home, 'CREW-1');
    expect(e.event).toBe('run_exited');
    expect(e.source).toBe('runner-exit');
    expect(e.exitCode).toBe(0);
  });
});

describe('crew fix-pr path', () => {
  it('emitFixprStarted lands a fixpr_started/cli-fixpr event', async () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-se-'));
    await emitFixprStarted('CREW-2', { home });
    const e = readEvent(home, 'CREW-2');
    expect(e.event).toBe('fixpr_started');
    expect(e.source).toBe('cli-fixpr');
  });

  it('emitDispatchExited(fix-pr) lands a fixpr_exited carrying a non-zero exit code', async () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-se-'));
    await emitDispatchExited('CREW-2', 'fix-pr', 1, { home });
    const e = readEvent(home, 'CREW-2');
    expect(e.event).toBe('fixpr_exited');
    expect(e.source).toBe('runner-exit');
    expect(e.exitCode).toBe(1);
  });
});

describe('crew finish path', () => {
  it('emitFinishCompleted lands a finish_completed/cli-finish event', async () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-se-'));
    await emitFinishCompleted('CREW-3', { home });
    const e = readEvent(home, 'CREW-3');
    expect(e.event).toBe('finish_completed');
    expect(e.source).toBe('cli-finish');
  });
});
