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
});
