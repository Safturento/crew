import { describe, expect, it } from 'vitest';

import { formatTokens } from './tokens.js';

describe('formatTokens', () => {
  it('renders sub-thousand counts as raw integers', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(999)).toBe('999');
  });

  it('renders thousands with one decimal and "k" suffix', () => {
    expect(formatTokens(1_000)).toBe('1.0k');
    expect(formatTokens(48_240)).toBe('48.2k');
    expect(formatTokens(999_499)).toBe('999.5k');
  });

  it('renders millions with one decimal and "M" suffix', () => {
    expect(formatTokens(1_000_000)).toBe('1.0M');
    expect(formatTokens(2_345_000)).toBe('2.3M');
  });

  it('clamps negative values to 0', () => {
    expect(formatTokens(-500)).toBe('0');
  });
});
