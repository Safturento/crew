import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useTmpDir } from '../test/tmpdir.js';
import { TimelineService } from './TimelineService.js';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import type { Kysely } from 'kysely';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmp = useTmpDir('crew-timeline-');

async function freshDb(): Promise<Kysely<DaemonDatabase>> {
  const dir = tmp();
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

describe('TimelineService', () => {
  it('returns parsed events for an existing transcript', async () => {
    const dir = tmp();
    const path = join(dir, 't.jsonl');
    writeFileSync(
      path,
      [
        JSON.stringify({ type: 'system', subtype: 'turn_duration', durationMs: 10 }),
        JSON.stringify({ type: 'pr-link', prNumber: 1, prUrl: 'https://github.com/x/y/pull/1' }),
      ].join('\n'),
    );
    const svc = new TimelineService({ resolveJsonlPath: async () => path });
    const out = await svc.getTimeline('KAN-1');
    expect(out.events).toHaveLength(2);
    expect(out.events[0].type).toBe('system');
    expect(out.events[1].type).toBe('pr-link');
    expect(out.warnings).toEqual([]);
  });

  it('returns empty + warning when resolver returns null', async () => {
    const svc = new TimelineService({ resolveJsonlPath: async () => null });
    const out = await svc.getTimeline('KAN-1');
    expect(out.events).toEqual([]);
    expect(out.warnings).toEqual(['transcript-missing']);
  });

  it('returns empty + warning when the resolved path does not exist (ENOENT)', async () => {
    const svc = new TimelineService({ resolveJsonlPath: async () => '/no/such/path.jsonl' });
    const out = await svc.getTimeline('KAN-1');
    expect(out.events).toEqual([]);
    expect(out.warnings).toEqual(['transcript-missing']);
  });

  it('skips malformed JSON lines silently', async () => {
    const dir = tmp();
    const path = join(dir, 't.jsonl');
    writeFileSync(
      path,
      [
        JSON.stringify({ type: 'system', subtype: 'turn_duration', durationMs: 10 }),
        'not-json',
        JSON.stringify({ type: 'pr-link', prNumber: 1, prUrl: 'https://github.com/x/y/pull/1' }),
        '',
      ].join('\n'),
    );
    const svc = new TimelineService({ resolveJsonlPath: async () => path });
    const out = await svc.getTimeline('KAN-1');
    expect(out.events).toHaveLength(2);
    expect(out.warnings).toEqual([]);
  });
});

describe('TimelineService — CREW-201 startup phase rows', () => {
  it('returns startup phase rows ahead of transcript events when both exist', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('startup_events')
        .values([
          {
            agent_key: 'KAN-1',
            subtype: 'crew_startup_npm_install',
            status: 'started',
            ts: 1000,
            summary: 'npm ci begun',
            duration_ms: null,
            log_path: null,
          },
          {
            agent_key: 'KAN-1',
            subtype: 'crew_startup_npm_install',
            status: 'completed',
            ts: 2000,
            summary: 'installed 152 packages',
            duration_ms: 1000,
            log_path: null,
          },
        ])
        .execute();

      const dir = tmp();
      const path = join(dir, 't.jsonl');
      writeFileSync(
        path,
        JSON.stringify({ type: 'system', subtype: 'turn_duration', durationMs: 10 }) + '\n',
      );

      const svc = new TimelineService({ resolveJsonlPath: async () => path, db });
      const out = await svc.getTimeline('KAN-1');
      expect(out.events).toHaveLength(2);
      expect(out.events[0]).toMatchObject({
        type: 'system',
        subtype: 'crew_startup_npm_install',
        status: 'completed',
        summary: 'installed 152 packages',
      });
      expect(out.events[1]).toMatchObject({ type: 'system', subtype: 'turn_duration' });
    } finally {
      await db.destroy();
    }
  });

  it('reports in_flight when only a started event has arrived', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('startup_events')
        .values({
          agent_key: 'KAN-1',
          subtype: 'crew_startup_docker',
          status: 'started',
          ts: 1000,
          summary: 'docker compose up begun',
          duration_ms: null,
          log_path: null,
        })
        .execute();

      const svc = new TimelineService({ resolveJsonlPath: async () => null, db });
      const out = await svc.getTimeline('KAN-1');
      expect(out.events).toHaveLength(1);
      expect(out.events[0]).toMatchObject({
        type: 'system',
        subtype: 'crew_startup_docker',
        status: 'in_flight',
        summary: 'docker compose up begun',
      });
      // Even though transcript is missing, startup rows suppress the warning.
      expect(out.warnings).toEqual([]);
    } finally {
      await db.destroy();
    }
  });

  it('returns transcript-missing warning when no startup events AND no transcript', async () => {
    const db = await freshDb();
    try {
      const svc = new TimelineService({ resolveJsonlPath: async () => null, db });
      const out = await svc.getTimeline('NOPE-99');
      expect(out.events).toEqual([]);
      expect(out.warnings).toEqual(['transcript-missing']);
    } finally {
      await db.destroy();
    }
  });

  it('returns transcript-only when no db is wired (old call sites stay working)', async () => {
    const dir = tmp();
    const path = join(dir, 't.jsonl');
    writeFileSync(
      path,
      JSON.stringify({ type: 'system', subtype: 'turn_duration', durationMs: 10 }) + '\n',
    );
    const svc = new TimelineService({ resolveJsonlPath: async () => path });
    const out = await svc.getTimeline('KAN-1');
    expect(out.events).toHaveLength(1);
    expect(out.events[0]).toMatchObject({ type: 'system', subtype: 'turn_duration' });
  });
});
