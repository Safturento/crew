import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pino, type Logger } from 'pino';
import type { Kysely } from 'kysely';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { useTmpDir } from '../test/tmpdir.js';
import { EventBus, type SseEvent } from './EventBus.js';
import { PrPoller } from './PrPoller.js';
import { PrTransitionService } from './PrTransitionService.js';

vi.mock('./github/fetch-pr-state.js', () => ({
  fetchPrStateViaGh: vi.fn(),
}));
import { fetchPrStateViaGh } from './github/fetch-pr-state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmp = useTmpDir('crew-pr-poller-');
const silentLogger: Logger = pino({ level: 'silent' });
const mockedFetch = vi.mocked(fetchPrStateViaGh);

async function freshDb(): Promise<Kysely<DaemonDatabase>> {
  const dir = tmp();
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

/**
 * Build a poller wired to a real PrTransitionService over the same db + bus,
 * so the delegated `pr_open → pr_merged` transition (insert + emitted
 * `agent.state_changed`) is exercised end-to-end, not mocked.
 */
function makePoller(
  db: Kysely<DaemonDatabase>,
  bus: EventBus,
  logger: Logger = silentLogger,
  intervalMs?: number,
): PrPoller {
  const prTransitions = new PrTransitionService({ db, eventBus: bus, logger });
  return new PrPoller({ db, logger, prTransitions, intervalMs });
}

async function seedAgent(
  db: Kysely<DaemonDatabase>,
  opts: {
    key: string;
    pr_url: string | null;
    currentState?: 'init' | 'running' | 'pr_open' | 'pr_merged' | 'finished' | 'error';
  },
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
      created_at: '2026-05-23T12:00:00Z',
    })
    .execute();

  if (opts.currentState) {
    await db
      .insertInto('state_transitions')
      .values({ agent_key: opts.key, from_state: null, to_state: opts.currentState, ts: 1000 })
      .execute();
  }
}

interface BusFixture {
  bus: EventBus;
  events: SseEvent[];
}

function newBus(): BusFixture {
  const bus = new EventBus();
  const events: SseEvent[] = [];
  bus.subscribe({ onEvent: (e) => events.push(e) });
  return { bus, events };
}

afterEach(() => {
  mockedFetch.mockReset();
});

describe('PrPoller.checkAgent', () => {
  it('transitions pr_open → pr_merged when PR is MERGED', async () => {
    const db = await freshDb();
    try {
      await seedAgent(db, {
        key: 'AGENT',
        pr_url: 'https://github.com/o/r/pull/1',
        currentState: 'pr_open',
      });
      mockedFetch.mockResolvedValueOnce('MERGED');
      const { bus, events } = newBus();
      const poller = makePoller(db, bus);

      const result = await poller.checkAgent('AGENT');

      expect(result).toEqual({ stateChanged: true, newState: 'pr_merged' });
      const latest = await db
        .selectFrom('state_transitions')
        .selectAll()
        .where('agent_key', '=', 'AGENT')
        .orderBy('id', 'desc')
        .executeTakeFirst();
      expect(latest?.from_state).toBe('pr_open');
      expect(latest?.to_state).toBe('pr_merged');
      expect(latest?.source).toBe('poller'); // CREW-259 provenance, preserved through delegation
      expect(events.map((e) => e.type)).toContain('agent.state_changed');
      const stateChanged = events.find((e) => e.type === 'agent.state_changed');
      expect(stateChanged?.data).toMatchObject({ key: 'AGENT', from: 'pr_open', to: 'pr_merged' });
    } finally {
      await db.destroy();
    }
  });

  it('transitions pr_open → pr_merged when PR is CLOSED (single state covers both)', async () => {
    const db = await freshDb();
    try {
      await seedAgent(db, {
        key: 'AGENT',
        pr_url: 'https://github.com/o/r/pull/2',
        currentState: 'pr_open',
      });
      mockedFetch.mockResolvedValueOnce('CLOSED');
      const poller = makePoller(db, newBus().bus);

      const result = await poller.checkAgent('AGENT');

      expect(result).toEqual({ stateChanged: true, newState: 'pr_merged' });
    } finally {
      await db.destroy();
    }
  });

  it('no-op when PR is still OPEN', async () => {
    const db = await freshDb();
    try {
      await seedAgent(db, {
        key: 'AGENT',
        pr_url: 'https://github.com/o/r/pull/3',
        currentState: 'pr_open',
      });
      mockedFetch.mockResolvedValueOnce('OPEN');
      const { bus, events } = newBus();
      const poller = makePoller(db, bus);

      const result = await poller.checkAgent('AGENT');

      expect(result.stateChanged).toBe(false);
      expect(events.some((e) => e.type === 'agent.state_changed')).toBe(false);
    } finally {
      await db.destroy();
    }
  });

  it('no-op when agent has no pr_url', async () => {
    const db = await freshDb();
    try {
      await seedAgent(db, { key: 'AGENT', pr_url: null, currentState: 'pr_open' });
      const poller = makePoller(db, newBus().bus);

      const result = await poller.checkAgent('AGENT');

      expect(result.stateChanged).toBe(false);
      expect(mockedFetch).not.toHaveBeenCalled();
    } finally {
      await db.destroy();
    }
  });

  it('no-op when agent is not in pr_open state (manual Refresh safety)', async () => {
    const db = await freshDb();
    try {
      await seedAgent(db, {
        key: 'AGENT',
        pr_url: 'https://github.com/o/r/pull/4',
        currentState: 'pr_merged',
      });
      const poller = makePoller(db, newBus().bus);

      const result = await poller.checkAgent('AGENT');

      expect(result.stateChanged).toBe(false);
      expect(mockedFetch).not.toHaveBeenCalled();
    } finally {
      await db.destroy();
    }
  });

  it('no-op when agent has no state_transitions row at all', async () => {
    const db = await freshDb();
    try {
      await seedAgent(db, { key: 'AGENT', pr_url: 'https://github.com/o/r/pull/5' });
      const poller = makePoller(db, newBus().bus);

      const result = await poller.checkAgent('AGENT');

      expect(result.stateChanged).toBe(false);
      expect(mockedFetch).not.toHaveBeenCalled();
    } finally {
      await db.destroy();
    }
  });

  it('no-op when agent does not exist at all', async () => {
    const db = await freshDb();
    try {
      const poller = makePoller(db, newBus().bus);
      const result = await poller.checkAgent('NOPE');
      expect(result.stateChanged).toBe(false);
      expect(mockedFetch).not.toHaveBeenCalled();
    } finally {
      await db.destroy();
    }
  });

  it('logs and returns no-op when gh throws', async () => {
    const db = await freshDb();
    try {
      await seedAgent(db, {
        key: 'AGENT',
        pr_url: 'https://github.com/o/r/pull/6',
        currentState: 'pr_open',
      });
      mockedFetch.mockRejectedValueOnce(new Error('gh: command not found'));
      const logger = pino({ level: 'silent' });
      const warnSpy = vi.spyOn(logger, 'warn');
      const poller = makePoller(db, newBus().bus, logger);

      const result = await poller.checkAgent('AGENT');

      expect(result.stateChanged).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      await db.destroy();
    }
  });
});

describe('PrPoller.pollOnce', () => {
  it('iterates only pr_open agents with non-null pr_url', async () => {
    const db = await freshDb();
    try {
      await seedAgent(db, {
        key: 'OPEN1',
        pr_url: 'https://github.com/o/r/pull/1',
        currentState: 'pr_open',
      });
      await seedAgent(db, {
        key: 'OPEN2',
        pr_url: 'https://github.com/o/r/pull/2',
        currentState: 'pr_open',
      });
      // Skipped — running state
      await seedAgent(db, {
        key: 'RUNNING',
        pr_url: 'https://github.com/o/r/pull/3',
        currentState: 'running',
      });
      // Skipped — already pr_merged
      await seedAgent(db, {
        key: 'MERGED',
        pr_url: 'https://github.com/o/r/pull/4',
        currentState: 'pr_merged',
      });
      // Skipped — null pr_url
      await seedAgent(db, { key: 'NOPR', pr_url: null, currentState: 'pr_open' });

      mockedFetch.mockResolvedValue('OPEN');
      const poller = makePoller(db, newBus().bus);

      await poller.pollOnceForTest();

      const checkedUrls = mockedFetch.mock.calls.map((c) => c[0]);
      expect(checkedUrls.sort()).toEqual([
        'https://github.com/o/r/pull/1',
        'https://github.com/o/r/pull/2',
      ]);
    } finally {
      await db.destroy();
    }
  });

  it('uses the LATEST transition row per agent to determine current state', async () => {
    const db = await freshDb();
    try {
      // Agent that flipped pr_open → pr_merged → (manual refresh would write
      // pr_open again in some re-open story, but we only have pr_merged as
      // a terminal here). The latest row is pr_merged, so pollOnce skips it.
      await seedAgent(db, { key: 'AGENT', pr_url: 'https://github.com/o/r/pull/9' });
      await db
        .insertInto('state_transitions')
        .values([
          { agent_key: 'AGENT', from_state: null, to_state: 'init', ts: 1 },
          { agent_key: 'AGENT', from_state: 'init', to_state: 'pr_open', ts: 2 },
          { agent_key: 'AGENT', from_state: 'pr_open', to_state: 'pr_merged', ts: 3 },
        ])
        .execute();

      const poller = makePoller(db, newBus().bus);
      await poller.pollOnceForTest();

      expect(mockedFetch).not.toHaveBeenCalled();
    } finally {
      await db.destroy();
    }
  });
});

describe('PrPoller.start/stop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('kicks an immediate poll on start; subsequent intervals fire pollOnce', async () => {
    const db = await freshDb();
    try {
      await seedAgent(db, {
        key: 'AGENT',
        pr_url: 'https://github.com/o/r/pull/1',
        currentState: 'pr_open',
      });
      mockedFetch.mockResolvedValue('OPEN');

      const poller = makePoller(db, newBus().bus, silentLogger, 60_000);
      poller.start();
      // Let the immediate poll's microtasks settle.
      await vi.advanceTimersByTimeAsync(0);
      expect(mockedFetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockedFetch).toHaveBeenCalledTimes(2);

      poller.stop();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockedFetch).toHaveBeenCalledTimes(2);
    } finally {
      await db.destroy();
    }
  });

  it('defaults to a 30-minute backstop interval (webhook is the fast path)', async () => {
    const db = await freshDb();
    try {
      await seedAgent(db, {
        key: 'AGENT',
        pr_url: 'https://github.com/o/r/pull/1',
        currentState: 'pr_open',
      });
      mockedFetch.mockResolvedValue('OPEN');

      // No intervalMs → the default backstop cadence.
      const poller = makePoller(db, newBus().bus);
      poller.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(mockedFetch).toHaveBeenCalledTimes(1); // immediate poll

      // The old 5-minute cadence would have fired a second poll by now.
      await vi.advanceTimersByTimeAsync(5 * 60_000);
      expect(mockedFetch).toHaveBeenCalledTimes(1);

      // ...the backstop only fires at 30 minutes.
      await vi.advanceTimersByTimeAsync(25 * 60_000);
      expect(mockedFetch).toHaveBeenCalledTimes(2);

      poller.stop();
    } finally {
      await db.destroy();
    }
  });
});
