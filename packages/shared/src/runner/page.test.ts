import { describe, expect, it } from 'vitest';
import {
  endedRunViewSchema,
  failedStartViewSchema,
  queuedActionViewSchema,
  reconcileRollupSchema,
  runRefSchema,
  runnerPageSchema,
  type EndedRunView,
  type FailedStartView,
  type QueuedActionView,
  type ReconcileRollup,
  type RunRef,
  type RunnerPage,
} from './page.js';

const failure = {
  check: 'git-remote',
  headline: 'No git remote configured',
  remediation: 'Add an origin remote and retry.',
  output: '✗ preflight: No git remote configured',
};

describe('runner page-data schemas', () => {
  it('validates a FailedStartView carrying its diagnosis', () => {
    const view: FailedStartView = {
      key: 'CREW-A',
      command: 'run',
      project: 'crew',
      failedAt: '2026-06-25T00:00:00.000Z',
      failure,
    };
    expect(failedStartViewSchema.parse(view)).toEqual(view);
  });

  it('validates a QueuedActionView', () => {
    const view: QueuedActionView = {
      key: 'CREW-B',
      command: 'fix-pr',
      project: 'crew',
      queuedAt: '2026-06-25T00:00:00.000Z',
    };
    expect(queuedActionViewSchema.parse(view)).toEqual(view);
  });

  it('validates an EndedRunView with optional PR + failure fields omitted', () => {
    const view: EndedRunView = {
      key: 'CREW-C',
      command: 'finish',
      project: 'crew',
      endedAt: '2026-06-25T00:00:00.000Z',
      kind: 'finished',
      prUrl: 'https://github.com/Safturento/crew/pull/340',
      prNumber: 340,
    };
    expect(endedRunViewSchema.parse(view)).toEqual(view);
  });

  it('rejects an EndedRunView with an unknown kind', () => {
    expect(() =>
      endedRunViewSchema.parse({
        key: 'CREW-C',
        command: 'run',
        project: 'crew',
        endedAt: '2026-06-25T00:00:00.000Z',
        kind: 'exploded',
      }),
    ).toThrow();
  });

  it('validates the full RunnerPage envelope', () => {
    const page: RunnerPage = { failedToStart: [], queued: [], recentlyEnded: [] };
    expect(runnerPageSchema.parse(page)).toEqual(page);
  });

  it('validates a RunRef', () => {
    const ref: RunRef = {
      key: 'CREW-Q',
      projectName: 'crew',
      state: 'queued',
      since: '2026-06-30T00:00:00.000Z',
    };
    expect(runRefSchema.parse(ref)).toEqual(ref);
  });

  it('rejects a RunRef whose state is neither queued nor orphaned', () => {
    expect(() =>
      runRefSchema.parse({
        key: 'CREW-R',
        projectName: 'crew',
        state: 'running',
        since: '2026-06-30T00:00:00.000Z',
      }),
    ).toThrow();
  });

  it('validates the ReconcileRollup envelope', () => {
    const rollup: ReconcileRollup = {
      queued: [{ key: 'CREW-Q', projectName: 'crew', state: 'queued', since: '2026-06-30T00:00:00.000Z' }],
      orphaned: [{ key: 'CREW-O', projectName: 'crew', state: 'orphaned', since: '2026-06-30T00:01:00.000Z' }],
    };
    expect(reconcileRollupSchema.parse(rollup)).toEqual(rollup);
  });
});
