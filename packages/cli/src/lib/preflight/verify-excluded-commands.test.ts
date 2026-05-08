import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ProjectConfig } from 'crew-shared';
import { verifyExcludedCommandsCheck } from './verify-excluded-commands.js';
import { PreflightError } from './types.js';

describe('verifyExcludedCommandsCheck', () => {
  let worktree: string;

  beforeEach(async () => {
    worktree = await mkdtemp(path.join(tmpdir(), 'crew-preflight-'));
  });

  afterEach(async () => {
    await rm(worktree, { recursive: true, force: true });
  });

  async function writeSettings(json: unknown): Promise<void> {
    await mkdir(path.join(worktree, '.claude'), { recursive: true });
    await writeFile(path.join(worktree, '.claude', 'settings.json'), JSON.stringify(json));
  }

  const cfgWithBruno = {
    canonical_worktree: 'main',
    db_clone: {
      postgres_service: 'postgres',
      postgres_user: 'postgres',
      postgres_database: 'postgres',
      required_tables: [],
      exclude_tables: [],
    },
    bruno_smoke: {
      enabled: true as const,
      base_url: 'https://localhost:17253',
      collection_dir: 'bruno',
    },
  } as unknown as ProjectConfig;

  const cfgWithAuthoredPlaywright = {
    canonical_worktree: 'main',
    db_clone: {
      postgres_service: 'postgres',
      postgres_user: 'postgres',
      postgres_database: 'postgres',
      required_tables: [],
      exclude_tables: [],
    },
    playwright: {
      app_url: 'https://localhost:17253',
      authored: {
        enabled: true as const,
        tests_dir: 'tests/e2e',
        test_command: 'npm run test:e2e',
        verify_after_run: false,
        verify_max_attempts: 2,
      },
    },
  } as unknown as ProjectConfig;

  it('passes when all required entries are present', async () => {
    await writeSettings({
      sandbox: {
        excludedCommands: ['npm run bruno:smoke*', 'npm run test:e2e*'],
      },
    });

    const cfg = { ...cfgWithBruno, ...cfgWithAuthoredPlaywright } as ProjectConfig;
    const check = verifyExcludedCommandsCheck();
    await expect(check.run({ config: cfg, worktree })).resolves.toBeUndefined();
  });

  it('throws when settings.json is missing', async () => {
    const check = verifyExcludedCommandsCheck();
    try {
      await check.run({ config: cfgWithBruno, worktree });
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PreflightError);
      const pe = err as PreflightError;
      expect(pe.headline).toContain('missing required excludedCommands');
      expect(pe.details.path).toContain('(file not found)');
      // spec §4.2: hint pointing at the Option B Epic for context
      expect(pe.details.hint).toMatch(/Option B Epic|hand-authored/i);
      expect(pe.remediation).toMatch(/create \.claude\/settings\.json/);
    }
  });

  it('throws when bruno smoke entry is missing', async () => {
    await writeSettings({ sandbox: { excludedCommands: [] } });
    const check = verifyExcludedCommandsCheck();
    try {
      await check.run({ config: cfgWithBruno, worktree });
      expect.fail('expected throw');
    } catch (err) {
      const pe = err as PreflightError;
      expect(pe.details.missing).toBe('"npm run bruno:smoke*"');
    }
  });

  it('throws when authored playwright test_command is missing', async () => {
    await writeSettings({ sandbox: { excludedCommands: ['npm run bruno:smoke*'] } });
    const check = verifyExcludedCommandsCheck();
    const cfg = { ...cfgWithBruno, ...cfgWithAuthoredPlaywright } as ProjectConfig;
    try {
      await check.run({ config: cfg, worktree });
      expect.fail('expected throw');
    } catch (err) {
      const pe = err as PreflightError;
      expect(pe.details.missing).toBe('"npm run test:e2e*"');
    }
  });

  it('respects custom test_command from config', async () => {
    await writeSettings({
      sandbox: { excludedCommands: ['npm run bruno:smoke*', 'npm run e2e:custom*'] },
    });
    const cfg = {
      ...cfgWithAuthoredPlaywright,
      playwright: {
        app_url: 'https://localhost:17253',
        authored: {
          enabled: true as const,
          tests_dir: 'tests/e2e',
          test_command: 'npm run e2e:custom',
          verify_after_run: false,
          verify_max_attempts: 2,
        },
      },
    } as unknown as ProjectConfig;
    const check = verifyExcludedCommandsCheck();
    await expect(check.run({ config: cfg, worktree })).resolves.toBeUndefined();
  });

  it('skips when neither block is enabled', async () => {
    const cfg = {
      canonical_worktree: 'main',
      db_clone: {
        postgres_service: 'postgres',
        postgres_user: 'postgres',
        postgres_database: 'postgres',
        required_tables: [],
        exclude_tables: [],
      },
    } as unknown as ProjectConfig;
    const check = verifyExcludedCommandsCheck();
    await expect(check.run({ config: cfg, worktree })).resolves.toBeUndefined();
  });

  const cfgWithDocker = {
    canonical_worktree: 'main',
    db_clone: {
      postgres_service: 'postgres',
      postgres_user: 'postgres',
      postgres_database: 'postgres',
      required_tables: [],
      exclude_tables: [],
    },
    docker: {
      canonical_worktree: 'main',
    },
  } as unknown as ProjectConfig;

  it('throws when [docker] is present but "docker compose" is missing', async () => {
    await writeSettings({
      sandbox: { excludedCommands: ['npm run bruno:smoke*', 'npm run test:e2e*'] },
    });
    const check = verifyExcludedCommandsCheck();
    try {
      await check.run({ config: cfgWithDocker, worktree });
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PreflightError);
      const pe = err as PreflightError;
      expect(pe.details.missing).toBe('"docker compose*"');
      expect(String(pe.details.reason)).toContain('[docker] block present');
    }
  });

  it('passes when [docker] is present and "docker compose" is in excludedCommands', async () => {
    await writeSettings({
      sandbox: { excludedCommands: ['docker compose*'] },
    });
    const check = verifyExcludedCommandsCheck();
    await expect(check.run({ config: cfgWithDocker, worktree })).resolves.toBeUndefined();
  });

  it('rejects the legacy exact-match form for bruno:smoke', async () => {
    await writeSettings({
      sandbox: { excludedCommands: ['npm run bruno:smoke'] }, // legacy exact-match
    });
    const check = verifyExcludedCommandsCheck();
    try {
      await check.run({ config: cfgWithBruno, worktree });
      expect.fail('expected throw — legacy form should not satisfy the new requirement');
    } catch (err) {
      expect(err).toBeInstanceOf(PreflightError);
      const pe = err as PreflightError;
      expect(pe.details.missing).toBe('"npm run bruno:smoke*"');
      expect(String(pe.details.reason)).toContain('[bruno_smoke].enabled = true');
    }
  });

  it('does not require "docker compose" when no [docker] block is present', async () => {
    await writeSettings({ sandbox: { excludedCommands: [] } });
    const cfgNoDocker = {
      canonical_worktree: 'main',
      db_clone: {
        postgres_service: 'postgres',
        postgres_user: 'postgres',
        postgres_database: 'postgres',
        required_tables: [],
        exclude_tables: [],
      },
    } as unknown as ProjectConfig;
    const check = verifyExcludedCommandsCheck();
    await expect(check.run({ config: cfgNoDocker, worktree })).resolves.toBeUndefined();
  });
});
