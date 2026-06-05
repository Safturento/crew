import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Kysely } from 'kysely';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { EventBus, type SseEvent } from './EventBus.js';
import { ActionService } from './ActionService.js';
import { NotFoundError } from '../errors.js';

type ActionChanged = Extract<SseEvent, { type: 'action.changed' }>;
const isActionChanged = (e: SseEvent): e is ActionChanged => e.type === 'action.changed';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

interface Harness {
  db: Kysely<DaemonDatabase>;
  eventBus: EventBus;
  service: ActionService;
  events: SseEvent[];
}

async function setup(): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), 'crew-action-svc-'));
  tmpdirs.push(dir);
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  const eventBus = new EventBus();
  const events: SseEvent[] = [];
  eventBus.subscribe({ onEvent: (e) => events.push(e) });
  const service = new ActionService({ db, eventBus });
  return { db, eventBus, service, events };
}

describe('ActionService.enqueue', () => {
  it('stores a pending run request and emits action.changed', async () => {
    const { service, events, db } = await setup();
    try {
      const action = await service.enqueue({ kind: 'run', ticketKey: 'CREW-1', project: 'crew' });
      expect(action).toMatchObject({
        kind: 'run',
        ticketKey: 'CREW-1',
        project: 'crew',
        status: 'pending',
        error: null,
        payload: { kind: 'run' },
      });
      expect(action.id).toBeGreaterThan(0);

      const row = await db
        .selectFrom('action_requests')
        .selectAll()
        .where('id', '=', action.id)
        .executeTakeFirstOrThrow();
      expect(row.status).toBe('pending');

      const changed = events.filter(isActionChanged);
      expect(changed).toHaveLength(1);
      expect(changed[0].data).toMatchObject({
        id: action.id,
        kind: 'run',
        key: 'CREW-1',
        status: 'pending',
      });
    } finally {
      await db.destroy();
    }
  });

  it('persists the fix_pr review comment in the payload', async () => {
    const { service, db } = await setup();
    try {
      const action = await service.enqueue({
        kind: 'fix_pr',
        ticketKey: 'CREW-2',
        project: 'crew',
        comment: 'please address the failing test',
      });
      expect(action.payload).toEqual({
        kind: 'fix_pr',
        comment: 'please address the failing test',
      });
      const row = await db
        .selectFrom('action_requests')
        .select('payload')
        .where('id', '=', action.id)
        .executeTakeFirstOrThrow();
      expect(JSON.parse(row.payload)).toEqual({
        kind: 'fix_pr',
        comment: 'please address the failing test',
      });
    } finally {
      await db.destroy();
    }
  });
});

describe('ActionService.claimNextPending', () => {
  it('returns null when nothing is pending', async () => {
    const { service, db } = await setup();
    try {
      expect(await service.claimNextPending()).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  it('claims the oldest pending row, flips it to claimed, and emits', async () => {
    const { service, events, db } = await setup();
    try {
      const first = await service.enqueue({ kind: 'run', ticketKey: 'CREW-1', project: 'crew' });
      await service.enqueue({ kind: 'run', ticketKey: 'CREW-2', project: 'crew' });

      const claimed = await service.claimNextPending();
      expect(claimed?.id).toBe(first.id);
      expect(claimed?.status).toBe('claimed');

      const row = await db
        .selectFrom('action_requests')
        .select('status')
        .where('id', '=', first.id)
        .executeTakeFirstOrThrow();
      expect(row.status).toBe('claimed');

      const claimEvents = events.filter(isActionChanged).filter((e) => e.data.status === 'claimed');
      expect(claimEvents).toHaveLength(1);
      expect(claimEvents[0].data).toMatchObject({ id: first.id, status: 'claimed' });
    } finally {
      await db.destroy();
    }
  });

  it('never hands the same row to two concurrent claims', async () => {
    const { service, db } = await setup();
    try {
      const only = await service.enqueue({ kind: 'run', ticketKey: 'CREW-1', project: 'crew' });
      const [a, b] = await Promise.all([service.claimNextPending(), service.claimNextPending()]);
      const claimedIds = [a, b].filter((x) => x !== null).map((x) => x!.id);
      expect(claimedIds).toEqual([only.id]);
    } finally {
      await db.destroy();
    }
  });
});

describe('ActionService.report', () => {
  it('updates the status and emits action.changed', async () => {
    const { service, events, db } = await setup();
    try {
      const action = await service.enqueue({ kind: 'run', ticketKey: 'CREW-1', project: 'crew' });
      await service.claimNextPending();
      await service.report(action.id, 'launching');
      await service.report(action.id, 'launched');

      const row = await db
        .selectFrom('action_requests')
        .selectAll()
        .where('id', '=', action.id)
        .executeTakeFirstOrThrow();
      expect(row.status).toBe('launched');
      expect(row.error).toBeNull();

      const statuses = events.filter(isActionChanged).map((e) => e.data.status);
      expect(statuses).toEqual(['pending', 'claimed', 'launching', 'launched']);
    } finally {
      await db.destroy();
    }
  });

  it('records the error message on a failed report', async () => {
    const { service, db } = await setup();
    try {
      const action = await service.enqueue({ kind: 'run', ticketKey: 'CREW-1', project: 'crew' });
      await service.report(action.id, 'failed', 'spawn ENOENT: crew');
      const row = await db
        .selectFrom('action_requests')
        .selectAll()
        .where('id', '=', action.id)
        .executeTakeFirstOrThrow();
      expect(row.status).toBe('failed');
      expect(row.error).toBe('spawn ENOENT: crew');
    } finally {
      await db.destroy();
    }
  });

  it('throws NotFoundError for an unknown action id', async () => {
    const { service, db } = await setup();
    try {
      await expect(service.report(9999, 'launched')).rejects.toBeInstanceOf(NotFoundError);
    } finally {
      await db.destroy();
    }
  });
});
