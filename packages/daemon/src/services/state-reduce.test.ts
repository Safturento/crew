import { describe, it, expect } from 'vitest';
import { reduceState } from './state-reduce.js';

describe('reduceState', () => {
  it('run_started → running', () => {
    expect(reduceState('init', 'run_started')).toBe('running');
  });
  it('pr_created → pr_open', () => {
    expect(reduceState('running', 'pr_created')).toBe('pr_open');
  });
  it('fixpr_started moves pr_open → running', () => {
    expect(reduceState('pr_open', 'fixpr_started')).toBe('running');
  });
  it('fixpr_exited → pr_open', () => {
    expect(reduceState('running', 'fixpr_exited')).toBe('pr_open');
  });
  it('run_exited from running → idle', () => {
    expect(reduceState('running', 'run_exited')).toBe('idle');
  });
  it('run_exited while pr_open is a no-op (null)', () => {
    expect(reduceState('pr_open', 'run_exited')).toBeNull();
  });
  it('finish_completed → finished', () => {
    expect(reduceState('pr_open', 'finish_completed')).toBe('finished');
  });
  it('finished is sticky against lifecycle events', () => {
    expect(reduceState('finished', 'run_started')).toBeNull();
    expect(reduceState('finished', 'pr_created')).toBeNull();
  });
  it('pr_merged is sticky against lifecycle events', () => {
    expect(reduceState('pr_merged', 'fixpr_started')).toBeNull();
  });
  it('returns null when the event would not change state', () => {
    expect(reduceState('pr_open', 'pr_created')).toBeNull();
  });

  describe('non-zero exit routes to error', () => {
    it('run_exited with a non-zero exitCode → error (overrides the idle case)', () => {
      expect(reduceState('running', 'run_exited', 1)).toBe('error');
    });
    it('fixpr_exited with a non-zero exitCode → error (overrides the pr_open case)', () => {
      expect(reduceState('running', 'fixpr_exited', 2)).toBe('error');
      expect(reduceState('pr_open', 'fixpr_exited', 2)).toBe('error');
    });
    it('a clean (exitCode 0) run_exited still activates idle', () => {
      expect(reduceState('running', 'run_exited', 0)).toBe('idle');
    });
    it('a clean (exitCode 0) fixpr_exited still returns to pr_open', () => {
      expect(reduceState('running', 'fixpr_exited', 0)).toBe('pr_open');
    });
    it('an omitted exitCode is treated as clean (no error routing)', () => {
      expect(reduceState('running', 'run_exited', null)).toBe('idle');
      expect(reduceState('running', 'run_exited', undefined)).toBe('idle');
    });
    it('terminal states stay sticky even on a non-zero exit', () => {
      expect(reduceState('finished', 'run_exited', 1)).toBeNull();
      expect(reduceState('pr_merged', 'fixpr_exited', 1)).toBeNull();
    });
    it('already-error agent does not re-emit an error transition', () => {
      expect(reduceState('error', 'run_exited', 1)).toBeNull();
    });
  });
});
