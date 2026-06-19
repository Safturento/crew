import { describe, expect, it } from 'vitest';

import { formatAgo } from './relativeTime.js';

describe('formatAgo', () => {
  const now = Date.parse('2026-06-19T12:00:00.000Z');
  const at = (msAgo: number) => new Date(now - msAgo).toISOString();

  it('reads sub-minute as "just now"', () => {
    expect(formatAgo(at(5_000), now)).toBe('just now');
  });

  it('reads minutes', () => {
    expect(formatAgo(at(2 * 60_000), now)).toBe('2m ago');
  });

  it('reads hours', () => {
    expect(formatAgo(at(3 * 3_600_000), now)).toBe('3h ago');
  });

  it('reads days', () => {
    expect(formatAgo(at(2 * 86_400_000), now)).toBe('2d ago');
  });
});
