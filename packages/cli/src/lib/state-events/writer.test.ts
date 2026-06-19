import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { emitStateEvent, emitStateEventSync, stateEventsFilePath } from './index.js';

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
    await emitStateEvent('CREW-2', { event: 'run_exited', source: 'runner-exit', exitCode: 0 }, { home });
    const line = readFileSync(stateEventsFilePath('CREW-2', home), 'utf8').trim();
    const parsed = JSON.parse(line);
    expect(parsed.exitCode).toBe(0);
  });

  it('never throws on an unwritable home (best-effort)', async () => {
    await expect(
      emitStateEvent('CREW-1', { event: 'run_exited', source: 'runner-exit', exitCode: 0 }, { home: '/dev/null/nope' }),
    ).resolves.toBeUndefined();
  });
});

describe('emitStateEventSync', () => {
  it('appends a well-formed JSONL line synchronously', () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-se-'));
    emitStateEventSync('CREW-3', { event: 'run_exited', source: 'runner-exit', exitCode: 1 }, { home });
    const line = readFileSync(stateEventsFilePath('CREW-3', home), 'utf8').trim();
    const parsed = JSON.parse(line);
    expect(parsed.event).toBe('run_exited');
    expect(parsed.exitCode).toBe(1);
    expect(typeof parsed.eventId).toBe('string');
  });

  it('never throws on an unwritable home (best-effort)', () => {
    expect(() =>
      emitStateEventSync('CREW-1', { event: 'finish_completed', source: 'cli-finish' }, { home: '/dev/null/nope' }),
    ).not.toThrow();
  });
});
