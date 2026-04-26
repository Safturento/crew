import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execa } from 'execa';
import { PassThrough } from 'node:stream';
import { runDbClone, type DbCloneSettings } from './clone.js';

vi.mock('execa', () => ({ execa: vi.fn() }));
const mockedExeca = vi.mocked(execa);

const settings: DbCloneSettings = {
  postgres_service: 'postgres',
  postgres_user: 'app',
  postgres_database: 'app',
  required_tables: ['user', 'user_macro_goal'],
  exclude_tables: ['kysely_migration*'],
};

interface CallArgs {
  cmd: string;
  args: string[];
  options?: Record<string, unknown>;
}

function lastNCalls(n: number): CallArgs[] {
  return mockedExeca.mock.calls.slice(-n).map((c) => {
    const tuple = c as readonly unknown[];
    return {
      cmd: tuple[0] as string,
      args: (tuple[1] ?? []) as string[],
      options: tuple[2] as Record<string, unknown> | undefined,
    };
  });
}

function mockDockerPs(canonicalId: string | null, targetId: string | null) {
  // Two findComposeContainer calls — canonical first, then target.
  mockedExeca.mockResolvedValueOnce({ stdout: canonicalId ?? '' } as never);
  mockedExeca.mockResolvedValueOnce({ stdout: targetId ?? '' } as never);
}

function mockMigrationCount(count: number) {
  mockedExeca.mockResolvedValueOnce({ stdout: `${count}` } as never);
}

function mockListTables(tables: string[]) {
  mockedExeca.mockResolvedValueOnce({ stdout: tables.join('\n') } as never);
}

function mockTruncate() {
  mockedExeca.mockResolvedValueOnce({ stdout: '' } as never);
}

function mockPipe() {
  // pg_dump returns a thenable with a Readable stdout; psql resolves normally.
  const pgDumpStdout = new PassThrough();
  const pgDump = Object.assign(Promise.resolve({ stdout: '', exitCode: 0 }), {
    stdout: pgDumpStdout,
  });
  mockedExeca.mockReturnValueOnce(pgDump as never);
  mockedExeca.mockReturnValueOnce(Promise.resolve({ stdout: '', exitCode: 0 }) as never);
  return { pgDumpStdout };
}

beforeEach(() => {
  mockedExeca.mockReset();
});

describe('runDbClone', () => {
  it('throws when the canonical postgres container is not running', async () => {
    mockDockerPs(null, 'target123');
    await expect(
      runDbClone({
        canonicalProject: 'recipes-app',
        targetProject: 'recipes-app-kan-23',
        settings,
      }),
    ).rejects.toThrow(/canonical.*not running/i);
  });

  it('throws when the target postgres container is not running', async () => {
    mockDockerPs('main123', null);
    await expect(
      runDbClone({
        canonicalProject: 'recipes-app',
        targetProject: 'recipes-app-kan-23',
        settings,
      }),
    ).rejects.toThrow(/target.*not running/i);
  });

  it('polls until all required tables exist, then truncates and pipes', async () => {
    mockDockerPs('main123', 'tgt456');
    mockMigrationCount(0); // not yet
    mockMigrationCount(1); // partial
    mockMigrationCount(2); // ready
    mockListTables(['user', 'user_macro_goal', 'kysely_migration', 'kysely_migration_lock']);
    mockTruncate();
    mockPipe();

    const logs: string[] = [];
    await runDbClone({
      canonicalProject: 'recipes-app',
      targetProject: 'recipes-app-kan-23',
      settings,
      pollIntervalMs: 1,
      timeoutMs: 1000,
      log: (m) => logs.push(m),
    });

    // Truncate was called with the non-excluded tables only.
    const truncateCall = mockedExeca.mock.calls.find(
      (c) =>
        Array.isArray(c[1]) &&
        c[1].some((arg) => typeof arg === 'string' && arg.startsWith('TRUNCATE TABLE')),
    );
    expect(truncateCall, 'expected a TRUNCATE call').toBeDefined();
    const truncateSql = (truncateCall![1] as string[]).find((arg) => arg.startsWith('TRUNCATE'))!;
    expect(truncateSql).toContain('public."user"');
    expect(truncateSql).toContain('public."user_macro_goal"');
    expect(truncateSql).not.toContain('kysely_migration');

    // The two pipe calls (pg_dump then psql) sit at the tail.
    const tail = lastNCalls(2);
    expect(tail[0].cmd).toBe('docker');
    expect(tail[0].args).toContain('exec');
    expect(tail[0].args).toContain('main123');
    expect(tail[0].args).toContain('pg_dump');
    expect(tail[0].args).toContain('--data-only');
    expect(tail[0].args).toContain('--disable-triggers');
    expect(tail[0].args).toContain('--exclude-table=kysely_migration*');

    expect(tail[1].cmd).toBe('docker');
    expect(tail[1].args).toContain('exec');
    expect(tail[1].args).toContain('tgt456');
    expect(tail[1].args).toContain('psql');
    expect(tail[1].args).toContain('-v');
    expect(tail[1].args).toContain('ON_ERROR_STOP=1');
    expect(tail[1].options?.stdin).toBeDefined();
  });

  it('skips the migration wait entirely when required_tables is empty', async () => {
    mockDockerPs('main123', 'tgt456');
    // No mockMigrationCount call: jump straight to listing tables.
    mockListTables(['user']);
    mockTruncate();
    mockPipe();

    await runDbClone({
      canonicalProject: 'a',
      targetProject: 'b',
      settings: { ...settings, required_tables: [] },
      pollIntervalMs: 1,
      timeoutMs: 1000,
    });

    // Verify no count(*) query was issued.
    const countCalls = mockedExeca.mock.calls.filter(
      (c) =>
        Array.isArray(c[1]) &&
        c[1].some((arg) => typeof arg === 'string' && /count\(\*\)/.test(arg)),
    );
    expect(countCalls).toHaveLength(0);
  });

  it('skips the TRUNCATE call when every table is excluded', async () => {
    mockDockerPs('main123', 'tgt456');
    // required_tables empty; no migration polling.
    mockListTables(['kysely_migration', 'kysely_migration_lock']);
    mockPipe();

    await runDbClone({
      canonicalProject: 'a',
      targetProject: 'b',
      settings: { ...settings, required_tables: [] },
      pollIntervalMs: 1,
      timeoutMs: 1000,
    });

    const truncateCalls = mockedExeca.mock.calls.filter(
      (c) =>
        Array.isArray(c[1]) &&
        c[1].some((arg) => typeof arg === 'string' && arg.startsWith('TRUNCATE')),
    );
    expect(truncateCalls).toHaveLength(0);
  });

  it('throws after timeoutMs when migration tables never appear', async () => {
    mockDockerPs('main123', 'tgt456');
    // Always return 0 — never ready.
    mockedExeca.mockResolvedValue({ stdout: '0' } as never);

    await expect(
      runDbClone({
        canonicalProject: 'a',
        targetProject: 'b',
        settings,
        pollIntervalMs: 1,
        timeoutMs: 30,
      }),
    ).rejects.toThrow(/timed out.*migration/i);
  });

  it('throws when pg_dump exits non-zero', async () => {
    mockDockerPs('main123', 'tgt456');
    mockMigrationCount(2);
    mockListTables(['user']);
    mockTruncate();

    const pgDumpStdout = new PassThrough();
    mockedExeca.mockReturnValueOnce(
      Object.assign(Promise.resolve({ stdout: '', exitCode: 2, stderr: 'pg_dump: oh no' }), {
        stdout: pgDumpStdout,
      }) as never,
    );
    mockedExeca.mockReturnValueOnce(Promise.resolve({ stdout: '', exitCode: 0 }) as never);

    await expect(
      runDbClone({
        canonicalProject: 'a',
        targetProject: 'b',
        settings,
        pollIntervalMs: 1,
        timeoutMs: 1000,
      }),
    ).rejects.toThrow(/pg_dump.*exit/i);
  });
});
