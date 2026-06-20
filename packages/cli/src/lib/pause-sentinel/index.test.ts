import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { pauseSentinelPath, writePauseSentinel, consumePauseSentinel } from './index.js';

describe('pause sentinel (CREW-273)', () => {
  it('pauseSentinelPath is under ~/.crew/pause-sentinels/<key>', () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-ps-'));
    expect(pauseSentinelPath('CREW-273', { home })).toBe(
      join(home, '.crew', 'pause-sentinels', 'CREW-273'),
    );
  });

  it('writePauseSentinel then consumePauseSentinel returns true and deletes the file', () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-ps-'));
    writePauseSentinel('CREW-273', { home });
    expect(existsSync(pauseSentinelPath('CREW-273', { home }))).toBe(true);

    const consumed = consumePauseSentinel('CREW-273', { home });
    expect(consumed).toBe(true);
    // Consume-on-read: a later cancel for the same key must not be misread.
    expect(existsSync(pauseSentinelPath('CREW-273', { home }))).toBe(false);
  });

  it('consumePauseSentinel returns false when no sentinel was written', () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-ps-'));
    expect(consumePauseSentinel('CREW-999', { home })).toBe(false);
  });

  it('a second consume after the first returns false (idempotent)', () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-ps-'));
    writePauseSentinel('CREW-273', { home });
    expect(consumePauseSentinel('CREW-273', { home })).toBe(true);
    expect(consumePauseSentinel('CREW-273', { home })).toBe(false);
  });

  it('sentinels are keyed per agent — consuming one leaves another intact', () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-ps-'));
    writePauseSentinel('CREW-1', { home });
    writePauseSentinel('CREW-2', { home });
    expect(consumePauseSentinel('CREW-1', { home })).toBe(true);
    expect(existsSync(pauseSentinelPath('CREW-2', { home }))).toBe(true);
  });
});
