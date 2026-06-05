import { describe, it, expect } from 'vitest';
import { ok, warn, fail } from './types.js';

describe('CheckResult builders', () => {
  it('ok() yields a passing result', () => {
    expect(ok('config valid')).toEqual({ status: 'ok', headline: 'config valid' });
  });

  it('fail() carries remediation + fixable flag', () => {
    expect(fail('missing config', { remediation: 'run crew init', fixable: true })).toEqual({
      status: 'fail',
      headline: 'missing config',
      remediation: 'run crew init',
      fixable: true,
    });
  });

  it('warn() defaults fixable to false', () => {
    expect(warn('baseline missing').fixable).toBeUndefined();
  });

  it('ok() forwards details', () => {
    expect(ok('all good', { details: { path: '/tmp/x' } })).toEqual({
      status: 'ok',
      headline: 'all good',
      details: { path: '/tmp/x' },
    });
  });
});
