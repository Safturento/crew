import { describe, expect, it } from 'vitest';
import { enqueueActionSchema, finishStepSchema } from './schema.js';
import { ACTION_KINDS, ACTION_STATUSES, FINISH_STEP_STATUSES } from './types.js';

describe('enqueueActionSchema', () => {
  it('accepts a run action', () => {
    expect(
      enqueueActionSchema.parse({ kind: 'run', ticketKey: 'CREW-1', project: 'crew' }),
    ).toMatchObject({
      kind: 'run',
      ticketKey: 'CREW-1',
      project: 'crew',
    });
  });

  it('accepts a finish action', () => {
    expect(
      enqueueActionSchema.parse({ kind: 'finish', ticketKey: 'CREW-1', project: 'crew' }),
    ).toMatchObject({
      kind: 'finish',
    });
  });

  it('accepts a fix_pr action carrying a comment', () => {
    expect(
      enqueueActionSchema.parse({
        kind: 'fix_pr',
        ticketKey: 'CREW-1',
        project: 'crew',
        comment: 'please fix the lint error',
      }),
    ).toMatchObject({ kind: 'fix_pr', comment: 'please fix the lint error' });
  });

  it('requires a comment for fix_pr', () => {
    expect(() =>
      enqueueActionSchema.parse({ kind: 'fix_pr', ticketKey: 'CREW-1', project: 'crew' }),
    ).toThrow();
  });

  it('rejects an empty fix_pr comment', () => {
    expect(() =>
      enqueueActionSchema.parse({
        kind: 'fix_pr',
        ticketKey: 'CREW-1',
        project: 'crew',
        comment: '',
      }),
    ).toThrow();
  });

  it('rejects a missing ticketKey', () => {
    expect(() => enqueueActionSchema.parse({ kind: 'run', project: 'crew' })).toThrow();
  });

  it('rejects an unknown kind', () => {
    expect(() =>
      enqueueActionSchema.parse({ kind: 'deploy', ticketKey: 'CREW-1', project: 'crew' }),
    ).toThrow();
  });
});

describe('finishStepSchema', () => {
  it('accepts an ok step', () => {
    expect(finishStepSchema.parse({ index: 0, label: 'lint', status: 'ok', ts: 1 })).toMatchObject({
      status: 'ok',
    });
  });

  it('accepts skip and error statuses', () => {
    expect(finishStepSchema.parse({ index: 1, label: 'build', status: 'skip', ts: 2 }).status).toBe(
      'skip',
    );
    expect(
      finishStepSchema.parse({ index: 2, label: 'test', status: 'error', detail: 'boom', ts: 3 })
        .status,
    ).toBe('error');
  });

  it('rejects an unknown status', () => {
    expect(() =>
      finishStepSchema.parse({ index: 0, label: 'lint', status: 'pending', ts: 1 }),
    ).toThrow();
  });

  it('rejects a negative index', () => {
    expect(() =>
      finishStepSchema.parse({ index: -1, label: 'lint', status: 'ok', ts: 1 }),
    ).toThrow();
  });
});

describe('action constant tuples', () => {
  it('enumerate the contract values', () => {
    expect(ACTION_KINDS).toEqual(['run', 'fix_pr', 'finish']);
    expect(ACTION_STATUSES).toEqual(['pending', 'claimed', 'launching', 'launched', 'failed']);
    expect(FINISH_STEP_STATUSES).toEqual(['ok', 'skip', 'error']);
  });
});
