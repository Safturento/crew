import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Kysely } from 'kysely';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { EventBus, type SseEvent } from './EventBus.js';
import { RunnerCommandsService } from './RunnerCommandsService.js';

type CommandChanged = Extract<SseEvent, { type: 'runner.command_changed' }>;
const isCommandChanged = (e: SseEvent): e is CommandChanged => e.type === 'runner.command_changed';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

interface Harness {
  db: Kysely<DaemonDatabase>;
  service: RunnerCommandsService;
  events: SseEvent[];
}

async function setup(): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), 'crew-runner-cmd-svc-'));
  tmpdirs.push(dir);
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  const eventBus = new EventBus();
  const events: SseEvent[] = [];
  eventBus.subscribe({ onEvent: (e) => events.push(e) });
  const service = new RunnerCommandsService({ db, eventBus });
  return { db, service, events };
}

describe('RunnerCommandsService.enqueue', () => {
  it('stores a pending command, serializes the payload, and emits', async () => {
    const { service, events, db } = await setup();
    try {
      const cmd = await service.enqueue({
        agentKey: 'CREW-231',
        kind: 'message',
        payload: { message: 'wrap up' },
      });
      expect(cmd).toMatchObject({
        agentKey: 'CREW-231',
        kind: 'message',
        payload: { message: 'wrap up' },
        status: 'pending',
        error: null,
      });
      expect(cmd.id).toBeGreaterThan(0);

      const row = await db
        .selectFrom('runner_commands')
        .selectAll()
        .where('id', '=', cmd.id)
        .executeTakeFirstOrThrow();
      expect(row.status).toBe('pending');
      expect(JSON.parse(row.payload!)).toEqual({ message: 'wrap up' });

      const changed = events.filter(isCommandChanged);
      expect(changed).toHaveLength(1);
      expect(changed[0].data).toMatchObject({ id: cmd.id, status: 'pending' });
    } finally {
      await db.destroy();
    }
  });

  it('stores a null payload for a queue-level command', async () => {
    const { service, db } = await setup();
    try {
      const cmd = await service.enqueue({ agentKey: null, kind: 'dequeue', payload: null });
      expect(cmd.agentKey).toBeNull();
      expect(cmd.payload).toBeNull();
      const row = await db
        .selectFrom('runner_commands')
        .select('payload')
        .where('id', '=', cmd.id)
        .executeTakeFirstOrThrow();
      expect(row.payload).toBeNull();
    } finally {
      await db.destroy();
    }
  });
});

describe('RunnerCommandsService.claimPending', () => {
  it('returns null when nothing is pending', async () => {
    const { service, db } = await setup();
    try {
      expect(await service.claimPending()).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  it('claims the oldest pending command, flips it to claimed, and emits', async () => {
    const { service, events, db } = await setup();
    try {
      const first = await service.enqueue({
        agentKey: 'CREW-231',
        kind: 'cancel_soft',
        payload: null,
      });
      await service.enqueue({ agentKey: 'CREW-232', kind: 'cancel_soft', payload: null });

      const claimed = await service.claimPending();
      expect(claimed?.id).toBe(first.id);
      expect(claimed?.status).toBe('claimed');

      const row = await db
        .selectFrom('runner_commands')
        .select('status')
        .where('id', '=', first.id)
        .executeTakeFirstOrThrow();
      expect(row.status).toBe('claimed');

      const claimEvents = events
        .filter(isCommandChanged)
        .filter((e) => e.data.status === 'claimed');
      expect(claimEvents).toHaveLength(1);
      expect(claimEvents[0].data).toMatchObject({ id: first.id, status: 'claimed' });
    } finally {
      await db.destroy();
    }
  });

  it('does not re-claim an already-claimed command', async () => {
    const { service, db } = await setup();
    try {
      await service.enqueue({ agentKey: 'CREW-231', kind: 'cancel_soft', payload: null });
      await service.claimPending();
      expect(await service.claimPending()).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  it('never hands the same row to two concurrent claims', async () => {
    const { service, db } = await setup();
    try {
      const only = await service.enqueue({
        agentKey: 'CREW-231',
        kind: 'cancel_hard',
        payload: null,
      });
      const [a, b] = await Promise.all([service.claimPending(), service.claimPending()]);
      const claimedIds = [a, b].filter((x) => x !== null).map((x) => x!.id);
      expect(claimedIds).toEqual([only.id]);
    } finally {
      await db.destroy();
    }
  });
});

describe('RunnerCommandsService.reportResult', () => {
  it('moves a claimed command to applied and emits', async () => {
    const { service, events, db } = await setup();
    try {
      const cmd = await service.enqueue({
        agentKey: 'CREW-231',
        kind: 'cancel_hard',
        payload: null,
      });
      await service.claimPending();
      await service.reportResult(cmd.id, 'applied');

      const row = await db
        .selectFrom('runner_commands')
        .selectAll()
        .where('id', '=', cmd.id)
        .executeTakeFirstOrThrow();
      expect(row.status).toBe('applied');
      expect(row.error).toBeNull();

      const statuses = events.filter(isCommandChanged).map((e) => e.data.status);
      expect(statuses).toEqual(['pending', 'claimed', 'applied']);
    } finally {
      await db.destroy();
    }
  });

  it('records the error message on a failed result', async () => {
    const { service, db } = await setup();
    try {
      const cmd = await service.enqueue({ agentKey: 'CREW-231', kind: 'pause', payload: null });
      await service.claimPending();
      await service.reportResult(cmd.id, 'failed', 'pause not yet supported');

      const row = await db
        .selectFrom('runner_commands')
        .selectAll()
        .where('id', '=', cmd.id)
        .executeTakeFirstOrThrow();
      expect(row.status).toBe('failed');
      expect(row.error).toBe('pause not yet supported');
    } finally {
      await db.destroy();
    }
  });
});
