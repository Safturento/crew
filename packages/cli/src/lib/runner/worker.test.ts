import { describe, it, expect } from 'vitest';
import { formatLogLine } from './worker.js';

describe('formatLogLine', () => {
  it('prefixes an ISO timestamp and terminates with a newline', () => {
    const line = formatLogLine('claimed action 5', new Date('2026-06-04T19:00:00.000Z'));
    expect(line).toBe('[2026-06-04T19:00:00.000Z] claimed action 5\n');
  });
});
