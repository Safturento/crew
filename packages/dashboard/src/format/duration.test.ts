import { describe, expect, it } from 'vitest';

import { formatDuration } from './duration.js';

describe('formatDuration', () => {
  it('formats sub-minute as "Ns"', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45_000)).toBe('45s');
  });

  it('formats minutes as "Nm SSs" with zero-padded seconds', () => {
    expect(formatDuration(60_000)).toBe('1m 00s');
    expect(formatDuration(60_000 + 4_000)).toBe('1m 04s');
    expect(formatDuration(33 * 60_000 + 4_000)).toBe('33m 04s');
  });

  it('formats hours as "Nh MMm SSs" with zero-padded fields', () => {
    expect(formatDuration(60 * 60_000)).toBe('1h 00m 00s');
    expect(formatDuration(60 * 60_000 + 2 * 60_000 + 14_000)).toBe('1h 02m 14s');
  });

  it('clamps negative durations to 0s', () => {
    expect(formatDuration(-500)).toBe('0s');
  });
});
