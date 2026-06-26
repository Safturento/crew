import { describe, it, expect } from 'vitest';
import { isProcessAlive } from './liveness.js';

describe('isProcessAlive', () => {
  it('returns true for the current process', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it('returns false for an obviously-dead pid', () => {
    expect(isProcessAlive(2 ** 22)).toBe(false);
  });
});
