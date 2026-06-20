import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pino, type Logger } from 'pino';
import type { Kysely } from 'kysely';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { useTmpDir } from '../test/tmpdir.js';
import { EventBus, type SseEvent } from './EventBus.js';
import { normalizePrUrl, PrTransitionService } from './PrTransitionService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmp = useTmpDir('crew-pr-transition-');
const silentLogger: Logger = pino({ level: 'silent' });

async function freshDb(): Promise<Kysely<DaemonDatabase>> {
  const dir = tmp();
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

async function seedAgent(
  db: Kysely<DaemonDatabase>,
  opts: { key: string; pr_url: string | null },
): Promise<void> {
  await db
    .insertInto('agents')
    .values({
      key: opts.key,
      project_name: 'demo',
      ticket_title: `${opts.key} title`,
      worktree_path: `/x/${opts.key}`,
      branch: opts.key,
      pr_url: opts.pr_url,
      created_at: '2026-06-19T12:00:00Z',
    })
    .execute();
}

describe('normalizePrUrl', () => {
  it('canonicalizes host casing and trailing slash', () => {
    expect(normalizePrUrl('HTTPS://GitHub.com/Owner/Repo/pull/12/')).toBe(
      'https://github.com/Owner/Repo/pull/12',
    );
  });

  it('preserves the path verbatim (repo names are case-sensitive)', () => {
    expect(normalizePrUrl('https://github.com/Owner/Repo/pull/3')).toBe(
      'https://github.com/Owner/Repo/pull/3',
    );
  });

  it('returns a non-URL string trimmed of surrounding space + trailing slashes', () => {
    expect(normalizePrUrl('  not-a-url/  ')).toBe('not-a-url');
  });
});

describe('PrTransitionService', () => {
  let db: Kysely<DaemonDatabase>;
  let bus: EventBus;
  let events: SseEvent[];
  let svc: PrTransitionService;

  beforeEach(async () => {
    db = await freshDb();
    bus = new EventBus();
    events = [];
    bus.subscribe({ onEvent: (e) => events.push(e) });
    svc = new PrTransitionService({ db, eventBus: bus, logger: silentLogger });
    await seedAgent(db, { key: 'CREW-1', pr_url: 'https://github.com/o/r/pull/1' });
  });

  afterEach(async () => {
    await db.destroy();
  });

  const setState = (key: string, to: string) =>
    db
      .insertInto('state_transitions')
      .values({ agent_key: key, from_state: null, to_state: to, ts: Date.now() })
      .execute();

  it('transitions and emits when latest is pr_open', async () => {
    await setState('CREW-1', 'pr_open');
    const r = await svc.markMerged('CREW-1');
    expect(r.changed).toBe(true);

    const latest = await db
      .selectFrom('state_transitions')
      .selectAll()
      .where('agent_key', '=', 'CREW-1')
      .orderBy('id', 'desc')
      .executeTakeFirst();
    expect(latest?.from_state).toBe('pr_open');
    expect(latest?.to_state).toBe('pr_merged');
    expect(events.at(-1)).toMatchObject({
      type: 'agent.state_changed',
      data: { key: 'CREW-1', from: 'pr_open', to: 'pr_merged' },
    });
  });

  it('records the provenance source on the transition when given', async () => {
    await setState('CREW-1', 'pr_open');
    await svc.markMerged('CREW-1', { source: 'poller' });
    const latest = await db
      .selectFrom('state_transitions')
      .select('source')
      .where('agent_key', '=', 'CREW-1')
      .orderBy('id', 'desc')
      .executeTakeFirst();
    expect(latest?.source).toBe('poller');
  });

  it('no-ops when latest is not pr_open (idempotent / wrong state)', async () => {
    await setState('CREW-1', 'pr_open');
    await svc.markMerged('CREW-1'); // first → pr_merged
    events.length = 0;
    const r = await svc.markMerged('CREW-1'); // second → no-op
    expect(r.changed).toBe(false);
    expect(events).toHaveLength(0);
  });

  it('resolves a pr_open agent by URL ignoring host casing / trailing slash', async () => {
    await setState('CREW-1', 'pr_open');
    expect(await svc.resolveOpenPrAgentByUrl('https://GITHUB.com/o/r/pull/1/')).toBe('CREW-1');
  });

  it('returns null when the matching agent is not pr_open', async () => {
    await setState('CREW-1', 'running');
    expect(await svc.resolveOpenPrAgentByUrl('https://github.com/o/r/pull/1')).toBeNull();
  });

  it('returns null when no agent has the URL', async () => {
    await setState('CREW-1', 'pr_open');
    expect(await svc.resolveOpenPrAgentByUrl('https://github.com/o/r/pull/999')).toBeNull();
  });
});
