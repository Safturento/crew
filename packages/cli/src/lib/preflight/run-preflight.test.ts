import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ProjectConfig } from 'crew-shared';
import { runPreflight } from './run-preflight.js';
import { PreflightError } from './types.js';
import { ok, warn, fail, type HealthCheck } from '../health/types.js';

const validConfig = {
  name: 'demo',
  repo_path: '/repo',
  jira: { project_key: 'X', site: 'https://x.atlassian.net' },
  github: { repo: 'owner/repo' },
} as unknown as ProjectConfig;

describe('runPreflight (fail-fast adapter over lib/health)', () => {
  let worktree: string;

  beforeEach(async () => {
    worktree = await mkdtemp(path.join(tmpdir(), 'crew-run-preflight-'));
  });

  afterEach(async () => {
    await rm(worktree, { recursive: true, force: true });
  });

  it('resolves when every project check passes', async () => {
    const checks: HealthCheck[] = [
      { name: 'a', scope: 'project', detect: async () => ok('fine') },
      { name: 'b', scope: 'project', detect: async () => ok('also fine') },
    ];
    await expect(
      runPreflight({ config: validConfig, worktree, checks }),
    ).resolves.toBeUndefined();
  });

  it('throws PreflightError carrying the first failing check’s fields', async () => {
    const checks: HealthCheck[] = [
      { name: 'a', scope: 'project', detect: async () => ok('fine') },
      {
        name: 'excluded-commands',
        scope: 'project',
        detect: async () =>
          fail('missing required excludedCommands', {
            remediation: 'add the entry',
            details: { missing: '"npm run bruno:smoke*"' },
          }),
      },
      {
        name: 'later',
        scope: 'project',
        detect: async () => fail('a different failure', { remediation: 'do something else' }),
      },
    ];

    try {
      await runPreflight({ config: validConfig, worktree, checks });
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PreflightError);
      const pe = err as PreflightError;
      expect(pe.checkName).toBe('excluded-commands');
      expect(pe.headline).toBe('missing required excludedCommands');
      expect(pe.remediation).toBe('add the entry');
      expect(pe.details.missing).toBe('"npm run bruno:smoke*"');
    }
  });

  it('does not gate on warn results', async () => {
    const checks: HealthCheck[] = [
      { name: 'baseline', scope: 'project', detect: async () => warn('baseline missing') },
    ];
    await expect(
      runPreflight({ config: validConfig, worktree, checks }),
    ).resolves.toBeUndefined();
  });

  it('drives the real registry by default: a missing settings.json fails excluded-commands', async () => {
    const config = {
      ...validConfig,
      bruno_smoke: { enabled: true, base_url: 'https://localhost:17253', collection_dir: 'bruno' },
    } as unknown as ProjectConfig;

    // No .env (env-materialized ok), no .claude/settings.json (excluded-commands fail).
    await expect(runPreflight({ config, worktree })).rejects.toMatchObject({
      name: 'PreflightError',
      checkName: 'excluded-commands',
    });
  });
});
