import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StartupEvent } from 'crew-shared';
import { reapReason } from './reap-reason.js';

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Write a `<key>.jsonl` under a temp home's `.crew/startup/` and return home. */
function seedStartupLog(key: string, events: StartupEvent[]): string {
  const home = mkdtempSync(join(tmpdir(), 'crew-reap-reason-'));
  tmpdirs.push(home);
  const dir = join(home, '.crew', 'startup');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${key}.jsonl`), events.map((e) => JSON.stringify(e)).join('\n') + '\n');
  return home;
}

const started: StartupEvent = {
  type: 'system',
  subtype: 'crew_startup_preflight',
  status: 'started',
  timestamp: '2026-06-30T00:00:00.000Z',
  summary: 'discovering project config + checking tools',
};

describe('reapReason (CREW-308)', () => {
  it('returns the summary of the last failed startup phase', () => {
    const home = seedStartupLog('HAI-12', [
      started,
      {
        type: 'system',
        subtype: 'crew_startup_preflight',
        status: 'failed',
        timestamp: '2026-06-30T00:00:01.000Z',
        summary: 'worktree already exists at /w/home-assistant-HAI-12',
        durationMs: 12,
      },
    ]);
    expect(reapReason('HAI-12', home)).toBe('worktree already exists at /w/home-assistant-HAI-12');
  });

  it('returns the most recent failed phase when several failed', () => {
    const home = seedStartupLog('HAI-15', [
      started,
      {
        type: 'system',
        subtype: 'crew_startup_preflight',
        status: 'failed',
        timestamp: '2026-06-30T00:00:01.000Z',
        summary: 'missing required tool(s) on PATH: bwrap',
        durationMs: 3,
      },
      {
        type: 'system',
        subtype: 'crew_startup_worktree',
        status: 'failed',
        timestamp: '2026-06-30T00:00:02.000Z',
        summary: 'worktree already exists',
        durationMs: 4,
      },
    ]);
    expect(reapReason('HAI-15', home)).toBe('worktree already exists');
  });

  it('returns null when the log has no failed phase', () => {
    const home = seedStartupLog('HAI-13', [
      started,
      {
        type: 'system',
        subtype: 'crew_startup_preflight',
        status: 'completed',
        timestamp: '2026-06-30T00:00:01.000Z',
        summary: 'project ok; tools ok',
        durationMs: 5,
      },
    ]);
    expect(reapReason('HAI-13', home)).toBeNull();
  });

  it('returns null when no startup log exists for the key', () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-reap-reason-'));
    tmpdirs.push(home);
    expect(reapReason('HAI-99', home)).toBeNull();
  });

  it('ignores malformed jsonl lines and still finds the failed summary', () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-reap-reason-'));
    tmpdirs.push(home);
    const dir = join(home, '.crew', 'startup');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'HAI-14.jsonl'),
      [
        JSON.stringify(started),
        '{ this is not valid json',
        JSON.stringify({
          type: 'system',
          subtype: 'crew_startup_preflight',
          status: 'failed',
          timestamp: '2026-06-30T00:00:02.000Z',
          summary: 'missing required tool(s) on PATH: bwrap',
          durationMs: 3,
        }),
      ].join('\n') + '\n',
    );
    expect(reapReason('HAI-14', home)).toBe('missing required tool(s) on PATH: bwrap');
  });
});
