import { describe, expect, it, vi } from 'vitest';

import { MODEL_PRICING, ratesForModel, weightedTokenCost, formatCost } from './pricing.js';

describe('MODEL_PRICING', () => {
  it('contains the three current Anthropic models', () => {
    expect(MODEL_PRICING['claude-sonnet-4-6']).toBeDefined();
    expect(MODEL_PRICING['claude-opus-4-7']).toBeDefined();
    expect(MODEL_PRICING['claude-haiku-4-5']).toBeDefined();
  });
});

describe('ratesForModel', () => {
  it('returns exact-match rates', () => {
    expect(ratesForModel('claude-sonnet-4-6').output).toBe(15);
  });
  it('matches dated model IDs via prefix', () => {
    expect(ratesForModel('claude-opus-4-7-20260603').output).toBe(75);
  });
  it('falls back to Sonnet for unknown models with a one-time warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    ratesForModel('claude-unknown-9-0');
    ratesForModel('claude-unknown-9-0');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
  it('returns Sonnet pricing for undefined model', () => {
    expect(ratesForModel(undefined).output).toBe(15);
  });
});

describe('weightedTokenCost', () => {
  it('sums per-category tokens × per-million rate', () => {
    // 1M output tokens on Sonnet = $15
    expect(weightedTokenCost('claude-sonnet-4-6', { output: 1_000_000 })).toBe(15);
    // 100k cache_read tokens on Sonnet = $0.03
    expect(weightedTokenCost('claude-sonnet-4-6', { cacheRead: 100_000 })).toBeCloseTo(0.03);
    // Combined: 1k input + 500 output on Haiku = 0.001 + 0.0025 = 0.0035
    expect(weightedTokenCost('claude-haiku-4-5', { input: 1000, output: 500 })).toBeCloseTo(0.0035);
  });

  it('treats missing fields as 0', () => {
    expect(weightedTokenCost('claude-sonnet-4-6', {})).toBe(0);
  });
});

describe('formatCost', () => {
  it('uses 4 decimals for sub-cent', () => {
    expect(formatCost(0.0024)).toBe('$0.0024');
  });
  it('uses 2 decimals for sub-dollar', () => {
    expect(formatCost(0.12)).toBe('$0.12');
  });
  it('uses 2 decimals for dollar+', () => {
    expect(formatCost(12.34)).toBe('$12.34');
  });
  it('uses integer for hundreds+', () => {
    expect(formatCost(123.45)).toBe('$123');
  });
  it('handles zero', () => {
    expect(formatCost(0)).toBe('$0.0000');
  });
});
