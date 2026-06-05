import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ProjectConfig } from 'crew-shared';
import { excludedCommands } from './excluded-commands.js';

const baseConfig = {
  name: 'demo',
  repo_path: '/repo',
  jira: { project_key: 'X', site: 'https://x.atlassian.net' },
  github: { repo: 'owner/repo' },
  db_clone: {
    postgres_service: 'postgres',
    postgres_user: 'postgres',
    postgres_database: 'postgres',
    required_tables: [],
    exclude_tables: [],
  },
} as unknown as ProjectConfig;

const cfgWithBruno = {
  ...baseConfig,
  bruno_smoke: { enabled: true, base_url: 'https://localhost:17253', collection_dir: 'bruno' },
} as unknown as ProjectConfig;

const cfgWithAuthoredPlaywright = {
  ...baseConfig,
  playwright: {
    app_url: 'https://localhost:17253',
    authored: {
      enabled: true,
      tests_dir: 'tests/e2e',
      test_command: 'npm run test:e2e',
      verify_after_run: false,
      verify_max_attempts: 2,
    },
  },
} as unknown as ProjectConfig;

const cfgWithDocker = {
  ...baseConfig,
  docker: { canonical_worktree: 'main' },
} as unknown as ProjectConfig;

describe('excluded-commands check', () => {
  let worktree: string;

  beforeEach(async () => {
    worktree = await mkdtemp(path.join(tmpdir(), 'crew-health-excluded-'));
  });

  afterEach(async () => {
    await rm(worktree, { recursive: true, force: true });
  });

  async function writeSettings(json: unknown): Promise<void> {
    await mkdir(path.join(worktree, '.claude'), { recursive: true });
    await writeFile(path.join(worktree, '.claude', 'settings.json'), JSON.stringify(json));
  }

  describe('detect', () => {
    it('is ok when no commands are required (no bruno/playwright/docker)', async () => {
      const r = await excludedCommands.detect({ config: baseConfig, worktree });
      expect(r.status).toBe('ok');
    });

    it('is ok when all required entries are present', async () => {
      await writeSettings({
        sandbox: { excludedCommands: ['npm run bruno:smoke*', 'npm run test:e2e*'] },
      });
      const cfg = { ...cfgWithBruno, ...cfgWithAuthoredPlaywright } as ProjectConfig;
      const r = await excludedCommands.detect({ config: cfg, worktree });
      expect(r.status).toBe('ok');
    });

    it('fails (fixable) when settings.json is missing entirely', async () => {
      const r = await excludedCommands.detect({ config: cfgWithBruno, worktree });
      expect(r.status).toBe('fail');
      expect(r.fixable).toBe(true);
      expect(r.headline).toContain('missing required excludedCommands');
      expect(r.details?.path).toContain('(file not found)');
    });

    it('fails (fixable) when the bruno smoke entry is missing', async () => {
      await writeSettings({ sandbox: { excludedCommands: [] } });
      const r = await excludedCommands.detect({ config: cfgWithBruno, worktree });
      expect(r.status).toBe('fail');
      expect(r.fixable).toBe(true);
      expect(r.details?.missing).toBe('"npm run bruno:smoke*"');
    });

    it('requires "docker compose*" when a [docker] block is present', async () => {
      await writeSettings({ sandbox: { excludedCommands: [] } });
      const r = await excludedCommands.detect({ config: cfgWithDocker, worktree });
      expect(r.status).toBe('fail');
      expect(r.details?.missing).toBe('"docker compose*"');
      expect(String(r.details?.reason)).toContain('[docker] block present');
    });

    it('respects a custom test_command from config', async () => {
      await writeSettings({
        sandbox: { excludedCommands: ['npm run e2e:custom*'] },
      });
      const cfg = {
        ...cfgWithAuthoredPlaywright,
        playwright: {
          app_url: 'https://localhost:17253',
          authored: {
            enabled: true,
            tests_dir: 'tests/e2e',
            test_command: 'npm run e2e:custom',
            verify_after_run: false,
            verify_max_attempts: 2,
          },
        },
      } as unknown as ProjectConfig;
      const r = await excludedCommands.detect({ config: cfg, worktree });
      expect(r.status).toBe('ok');
    });

    it('rejects the legacy exact-match form', async () => {
      await writeSettings({ sandbox: { excludedCommands: ['npm run bruno:smoke'] } });
      const r = await excludedCommands.detect({ config: cfgWithBruno, worktree });
      expect(r.status).toBe('fail');
      expect(r.details?.missing).toBe('"npm run bruno:smoke*"');
    });
  });

  describe('fix', () => {
    it('creates settings.json with the required entries when absent', async () => {
      await excludedCommands.fix!({ config: cfgWithBruno, worktree });

      const dest = path.join(worktree, '.claude', 'settings.json');
      expect(existsSync(dest)).toBe(true);
      const parsed = JSON.parse(await readFile(dest, 'utf8'));
      expect(parsed.sandbox.excludedCommands).toContain('npm run bruno:smoke*');

      // After fix, detect is healthy.
      const r = await excludedCommands.detect({ config: cfgWithBruno, worktree });
      expect(r.status).toBe('ok');
    });

    it('writes a set detect() accepts across all feature types (read/write parity)', async () => {
      // Locks the single-command-set invariant between requiredEntries (read) and
      // writeSettingsJson's excludedCommandsFor (write): if either side drifts, the
      // round-trip fix → detect would leave a residual fail.
      const cfg = {
        ...cfgWithBruno,
        ...cfgWithAuthoredPlaywright,
        docker: { canonical_worktree: 'main' },
      } as ProjectConfig;

      await excludedCommands.fix!({ config: cfg, worktree });

      const r = await excludedCommands.detect({ config: cfg, worktree });
      expect(r.status).toBe('ok');
    });

    it('array-merges without clobbering existing keys, and is idempotent', async () => {
      await writeSettings({
        sandbox: { excludedCommands: ['existing*'], extraField: true },
        permissions: { allow: ['x'] },
      });

      await excludedCommands.fix!({ config: cfgWithBruno, worktree });
      await excludedCommands.fix!({ config: cfgWithBruno, worktree }); // second run = no-op

      const parsed = JSON.parse(
        await readFile(path.join(worktree, '.claude', 'settings.json'), 'utf8'),
      );
      expect(parsed.sandbox.excludedCommands).toEqual(['existing*', 'npm run bruno:smoke*']);
      expect(parsed.sandbox.extraField).toBe(true);
      expect(parsed.permissions).toEqual({ allow: ['x'] });
    });
  });
});
