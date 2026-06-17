import { describe, it, expect, vi } from 'vitest';
import type { ReportFailedStartInput, ReportLaunchingInput } from '../daemon-client/index.js';
import { PreflightError } from '../preflight/index.js';
import { runTrackedPreflight } from './preflight-tracking.js';

function makeDeps() {
  const calls: string[] = [];
  const reportLaunching = vi.fn(async (input: ReportLaunchingInput) => {
    calls.push(`reportLaunching:${input.key}`);
    return { ok: true as const, runId: 1 };
  });
  const reportFailedStart = vi.fn(async (input: ReportFailedStartInput) => {
    calls.push(`reportFailedStart:${input.key}`);
    return { ok: true as const, runId: 1 };
  });
  const daemonClient = { reportLaunching, reportFailedStart };
  const deps = {
    daemonClient,
    key: 'CREW-9',
    projectName: 'crew',
    command: 'run' as const,
    worktreePath: '/tmp/crew-9',
    branch: 'CREW-9',
    startedAt: '2026-06-17T12:00:00Z',
  };
  return { deps, calls, reportLaunching, reportFailedStart };
}

describe('runTrackedPreflight', () => {
  it('registers launching before running the preflight phase', async () => {
    const { deps, calls } = makeDeps();
    const result = await runTrackedPreflight(deps, async () => {
      calls.push('prepare');
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(calls).toEqual(['reportLaunching:CREW-9', 'prepare']);
  });

  it('reports a structured failed-start when prepare throws a PreflightError', async () => {
    const { deps, reportFailedStart } = makeDeps();
    const err = new PreflightError(
      'git-remote',
      'No git remote configured',
      'Add an origin remote.',
      {
        detail: 'fatal',
      },
    );
    await expect(
      runTrackedPreflight(deps, async () => {
        throw err;
      }),
    ).rejects.toBe(err);
    expect(reportFailedStart).toHaveBeenCalledTimes(1);
    const arg = reportFailedStart.mock.calls[0][0];
    expect(arg.key).toBe('CREW-9');
    expect(arg.failure.check).toBe('git-remote');
    expect(arg.failure.headline).toBe('No git remote configured');
    expect(arg.failure.remediation).toBe('Add an origin remote.');
    // The rendered preflight error (which folds in `details`) is the output.
    expect(arg.failure.output).toContain('No git remote configured');
  });

  it('does not report a failed-start for a non-preflight error', async () => {
    const { deps, reportFailedStart } = makeDeps();
    const err = new Error('docker bringup failed');
    await expect(
      runTrackedPreflight(deps, async () => {
        throw err;
      }),
    ).rejects.toBe(err);
    expect(reportFailedStart).not.toHaveBeenCalled();
  });
});
