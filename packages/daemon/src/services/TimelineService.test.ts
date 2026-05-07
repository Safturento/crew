import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { useTmpDir } from '../test/tmpdir.js';
import { TimelineService } from './TimelineService.js';

const tmp = useTmpDir('crew-timeline-');

describe('TimelineService', () => {
  it('returns parsed events for an existing transcript', async () => {
    const dir = tmp();
    const path = join(dir, 't.jsonl');
    writeFileSync(
      path,
      [
        JSON.stringify({ type: 'system', subtype: 'turn_duration', durationMs: 10 }),
        JSON.stringify({ type: 'pr-link', prNumber: 1, prUrl: 'https://github.com/x/y/pull/1' }),
      ].join('\n'),
    );
    const svc = new TimelineService({ resolveJsonlPath: async () => path });
    const out = await svc.getTimeline('KAN-1');
    expect(out.events).toHaveLength(2);
    expect(out.events[0].type).toBe('system');
    expect(out.events[1].type).toBe('pr-link');
    expect(out.warnings).toEqual([]);
  });

  it('returns empty + warning when resolver returns null', async () => {
    const svc = new TimelineService({ resolveJsonlPath: async () => null });
    const out = await svc.getTimeline('KAN-1');
    expect(out.events).toEqual([]);
    expect(out.warnings).toEqual(['transcript-missing']);
  });

  it('returns empty + warning when the resolved path does not exist (ENOENT)', async () => {
    const svc = new TimelineService({ resolveJsonlPath: async () => '/no/such/path.jsonl' });
    const out = await svc.getTimeline('KAN-1');
    expect(out.events).toEqual([]);
    expect(out.warnings).toEqual(['transcript-missing']);
  });

  it('skips malformed JSON lines silently', async () => {
    const dir = tmp();
    const path = join(dir, 't.jsonl');
    writeFileSync(
      path,
      [
        JSON.stringify({ type: 'system', subtype: 'turn_duration', durationMs: 10 }),
        'not-json',
        JSON.stringify({ type: 'pr-link', prNumber: 1, prUrl: 'https://github.com/x/y/pull/1' }),
        '',
      ].join('\n'),
    );
    const svc = new TimelineService({ resolveJsonlPath: async () => path });
    const out = await svc.getTimeline('KAN-1');
    expect(out.events).toHaveLength(2);
    expect(out.warnings).toEqual([]);
  });
});
