import { describe, expect, it, vi } from 'vitest';
import {
  classifyTestResult,
  computeGateSkip,
  formatFeedbackMessage,
  runVerifyGateLoop,
  type GateRunner,
  type AgentResumer,
  type GateSkipInput,
} from './verify-authored-e2e.js';
import type { BaselineCheckResult } from './baseline.js';

function baseSkipInput(overrides: Partial<GateSkipInput> = {}): GateSkipInput {
  return {
    verifyAfterRun: true,
    commitsAhead: 1,
    skipDocker: false,
    dockerUnavailable: false,
    baseline: { green: true, sha: 'abc' } as BaselineCheckResult,
    ...overrides,
  };
}

describe('computeGateSkip', () => {
  it('returns null when all conditions allow gate to fire', () => {
    expect(computeGateSkip(baseSkipInput())).toBeNull();
  });

  it('skips when verify_after_run is false', () => {
    expect(computeGateSkip(baseSkipInput({ verifyAfterRun: false }))).toEqual({
      reason: 'gate disabled (verify_after_run = false)',
    });
  });

  it('skips when no commits ahead', () => {
    expect(computeGateSkip(baseSkipInput({ commitsAhead: 0 }))?.reason).toMatch(/no commits/i);
  });

  it('skips silently when --skip-docker passed', () => {
    expect(computeGateSkip(baseSkipInput({ skipDocker: true }))?.reason).toMatch(/--skip-docker/);
  });

  it('skips when docker bringup failed', () => {
    expect(computeGateSkip(baseSkipInput({ dockerUnavailable: true }))?.reason).toMatch(
      /docker.*unavailable/i,
    );
  });

  it('skips when baseline is not green (no-record)', () => {
    expect(
      computeGateSkip(
        baseSkipInput({
          baseline: {
            green: false,
            reason: 'no-record',
            actualSha: 'abc',
            cachePath: '/tmp/cache',
          } as BaselineCheckResult,
        }),
      )?.reason,
    ).toMatch(/baseline/);
  });

  it('skips when baseline is not green (mismatch)', () => {
    expect(
      computeGateSkip(
        baseSkipInput({
          baseline: {
            green: false,
            reason: 'mismatch',
            actualSha: 'abc',
            recordedSha: 'def',
            cachePath: '/tmp/cache',
          } as BaselineCheckResult,
        }),
      )?.reason,
    ).toMatch(/baseline/);
  });
});

describe('classifyTestResult', () => {
  it('treats exit code 0 as pass', () => {
    expect(classifyTestResult({ exitCode: 0, stdout: 'ok', stderr: '' })).toEqual({
      pass: true,
      output: 'ok',
    });
  });

  it('treats exit code 1 as assertions failure', () => {
    const r = classifyTestResult({ exitCode: 1, stdout: 'expected x got y', stderr: '' });
    expect('pass' in r && r.pass === false).toBe(true);
    if ('pass' in r && !r.pass) {
      expect(r.distinguisher).toBe('assertions');
      expect(r.output).toContain('expected x got y');
    }
  });

  it('treats other non-zero exit codes as crashes', () => {
    const r = classifyTestResult({ exitCode: 2, stdout: '', stderr: 'no chromium found' });
    expect('pass' in r && r.pass === false).toBe(true);
    if ('pass' in r && !r.pass) {
      expect(r.distinguisher).toBe('crash');
      expect(r.output).toContain('no chromium found');
    }
  });

  it('treats signal kills (other than SIGINT/SIGTERM) as crashes', () => {
    const r = classifyTestResult({
      exitCode: undefined,
      stdout: '',
      stderr: '',
      signal: 'SIGKILL',
    });
    expect('pass' in r && r.pass === false).toBe(true);
    if ('pass' in r && !r.pass) {
      expect(r.distinguisher).toBe('crash');
    }
  });

  it('treats SIGINT as an abort (so the loop can stop without firing fix-pr)', () => {
    const r = classifyTestResult({
      exitCode: undefined,
      stdout: 'partial',
      stderr: '',
      signal: 'SIGINT',
    });
    expect('aborted' in r).toBe(true);
    if ('aborted' in r) {
      expect(r.aborted).toBe(true);
      expect(r.output).toContain('partial');
    }
  });

  it('treats SIGTERM as an abort', () => {
    const r = classifyTestResult({
      exitCode: undefined,
      stdout: '',
      stderr: '',
      signal: 'SIGTERM',
    });
    expect('aborted' in r).toBe(true);
  });
});

describe('formatFeedbackMessage', () => {
  it('prefixes with the assertions distinguisher', () => {
    const msg = formatFeedbackMessage('assertions', 'fail at line 12');
    expect(msg).toMatch(/^e2e test assertions failed:/);
    expect(msg).toContain('fail at line 12');
  });

  it('prefixes with the crash distinguisher', () => {
    const msg = formatFeedbackMessage('crash', 'browser launch failed');
    expect(msg).toMatch(/^playwright runner crashed:/);
    expect(msg).toContain('browser launch failed');
  });
});

describe('runVerifyGateLoop', () => {
  it('returns pass when first attempt passes', async () => {
    const runner: GateRunner = vi.fn().mockResolvedValue({ pass: true, output: 'ok' });
    const resumer: AgentResumer = vi.fn();
    const result = await runVerifyGateLoop({
      verifyMaxAttempts: 2,
      runGate: runner,
      resumeAgent: resumer,
    });
    expect(result).toEqual({ kind: 'pass', attempts: 1 });
    expect(runner).toHaveBeenCalledTimes(1);
    expect(resumer).not.toHaveBeenCalled();
  });

  it('resumes once on fail, then passes on second attempt', async () => {
    const runner: GateRunner = vi
      .fn()
      .mockResolvedValueOnce({
        pass: false,
        distinguisher: 'assertions',
        output: 'fail',
      })
      .mockResolvedValueOnce({ pass: true, output: 'ok' });
    const resumer: AgentResumer = vi.fn().mockResolvedValue(undefined);
    const result = await runVerifyGateLoop({
      verifyMaxAttempts: 2,
      runGate: runner,
      resumeAgent: resumer,
    });
    expect(result.kind).toBe('pass');
    if (result.kind === 'pass') expect(result.attempts).toBe(2);
    expect(runner).toHaveBeenCalledTimes(2);
    expect(resumer).toHaveBeenCalledTimes(1);
    expect((resumer as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0].message).toMatch(
      /^e2e test assertions failed:/,
    );
  });

  it('returns fail with attempt count after retry cap is exhausted', async () => {
    const runner: GateRunner = vi.fn().mockResolvedValue({
      pass: false,
      distinguisher: 'crash',
      output: 'still broken',
    });
    const resumer: AgentResumer = vi.fn().mockResolvedValue(undefined);
    const result = await runVerifyGateLoop({
      verifyMaxAttempts: 2,
      runGate: runner,
      resumeAgent: resumer,
    });
    expect(result.kind).toBe('fail');
    if (result.kind === 'fail') {
      expect(result.attempts).toBe(2);
      expect(result.lastDistinguisher).toBe('crash');
      expect(result.lastOutput).toContain('still broken');
    }
    expect(runner).toHaveBeenCalledTimes(2);
    expect(resumer).toHaveBeenCalledTimes(1);
  });

  it('returns kind=aborted without dispatching a resume when the runner reports aborted', async () => {
    const runner: GateRunner = vi.fn().mockResolvedValue({ aborted: true, output: 'cancel' });
    const resumer: AgentResumer = vi.fn();
    const result = await runVerifyGateLoop({
      verifyMaxAttempts: 4,
      runGate: runner,
      resumeAgent: resumer,
    });
    expect(result.kind).toBe('aborted');
    expect(runner).toHaveBeenCalledTimes(1);
    expect(resumer).not.toHaveBeenCalled();
  });

  it('honors a higher verify_max_attempts', async () => {
    const runner: GateRunner = vi.fn().mockResolvedValue({
      pass: false,
      distinguisher: 'assertions',
      output: 'nope',
    });
    const resumer: AgentResumer = vi.fn().mockResolvedValue(undefined);
    const result = await runVerifyGateLoop({
      verifyMaxAttempts: 4,
      runGate: runner,
      resumeAgent: resumer,
    });
    expect(result.kind).toBe('fail');
    if (result.kind === 'fail') expect(result.attempts).toBe(4);
    expect(runner).toHaveBeenCalledTimes(4);
    expect(resumer).toHaveBeenCalledTimes(3);
  });
});
