import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Kysely } from 'kysely';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { EventBus, type SseEvent } from './EventBus.js';
import { FinishStepsService } from './FinishStepsService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function freshDb(): Promise<Kysely<DaemonDatabase>> {
  const dir = mkdtempSync(join(tmpdir(), 'crew-finish-steps-'));
  tmpdirs.push(dir);
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

describe('FinishStepsService', () => {
  it('records a step and emits finish_step.changed for the agent', async () => {
    const db = await freshDb();
    const bus = new EventBus();
    const pings: string[] = [];
    bus.subscribe({
      onEvent: (e: SseEvent) => {
        if (e.type === 'finish_step.changed') pings.push(e.data.key);
      },
    });
    const svc = new FinishStepsService({ db, eventBus: bus });
    try {
      const row = await svc.record('CREW-1', {
        index: 0,
        label: 'lint',
        status: 'ok',
        ts: 1_700_000_000_000,
      });
      expect(row).toMatchObject({ key: 'CREW-1', index: 0, label: 'lint', status: 'ok' });
      expect(pings).toEqual(['CREW-1']);
    } finally {
      await db.destroy();
    }
  });

  it('lists steps in emission order with a null detail when omitted', async () => {
    const db = await freshDb();
    const svc = new FinishStepsService({ db, eventBus: new EventBus() });
    try {
      await svc.record('CREW-1', { index: 0, label: 'lint', status: 'ok', ts: 1 });
      await svc.record('CREW-1', { index: 1, label: 'typecheck', status: 'skip', detail: 'n/a', ts: 2 });
      await svc.record('CREW-1', { index: 2, label: 'test', status: 'error', ts: 3 });
      // a different agent's step must not leak into the list
      await svc.record('CREW-2', { index: 0, label: 'lint', status: 'ok', ts: 9 });

      const steps = await svc.list('CREW-1');
      expect(steps.map((s) => s.label)).toEqual(['lint', 'typecheck', 'test']);
      expect(steps.map((s) => s.status)).toEqual(['ok', 'skip', 'error']);
      expect(steps[0].detail).toBeNull();
      expect(steps[1].detail).toBe('n/a');
      expect(steps.every((s) => s.key === 'CREW-1')).toBe(true);
    } finally {
      await db.destroy();
    }
  });

  it('returns an empty list for an agent with no steps', async () => {
    const db = await freshDb();
    const svc = new FinishStepsService({ db, eventBus: new EventBus() });
    try {
      expect(await svc.list('NOPE-1')).toEqual([]);
    } finally {
      await db.destroy();
    }
  });
});
