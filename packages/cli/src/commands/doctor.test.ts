import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDoctor } from './doctor.js';
import { ok, fail, type HealthCheck } from '../lib/health/types.js';
import type { ProjectConfig } from '../lib/index.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crew-doctor-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const stubConfig = (name: string): ProjectConfig =>
  ({
    name,
    repo_path: join(dir, name),
    default_branch: 'main',
    jira: { project_key: 'X', site: 'https://x.atlassian.net' },
    github: { repo: `acme/${name}` },
  }) as ProjectConfig;

const minimalToml = (name: string): string =>
  [
    `name = "${name}"`,
    `repo_path = "${join(dir, name)}"`,
    '[jira]',
    `project_key = "${name.toUpperCase()}"`,
    `site = "https://${name}.atlassian.net"`,
    '[github]',
    `repo = "acme/${name}"`,
  ].join('\n');

describe('runDoctor', () => {
  it('returns exitCode 1 on a fixable fail and does not mutate without --fix', async () => {
    let broken = true;
    const flaky: HealthCheck = {
      name: 'flaky',
      scope: 'project',
      detect: async () => (broken ? fail('broken', { fixable: true }) : ok('fixed')),
      fix: async () => {
        broken = false;
      },
    };

    const result = await runDoctor({
      cwd: dir,
      checks: [flaky],
      discover: async () => stubConfig('alpha'),
      log: () => {},
    });

    expect(result).toEqual({ exitCode: 1, fixed: 0 });
    expect(broken).toBe(true); // fix() never ran
  });

  it('with --fix applies fix(), re-detects, and reports the count of gaps closed', async () => {
    let broken = true;
    const flaky: HealthCheck = {
      name: 'flaky',
      scope: 'project',
      detect: async () => (broken ? fail('broken', { fixable: true }) : ok('fixed')),
      fix: async () => {
        broken = false;
      },
    };

    const result = await runDoctor({
      cwd: dir,
      fix: true,
      checks: [flaky],
      discover: async () => stubConfig('alpha'),
      log: () => {},
    });

    expect(result).toEqual({ exitCode: 0, fixed: 1 });
    expect(broken).toBe(false);
  });

  it('--all iterates every configured project but runs machine checks once', async () => {
    writeFileSync(join(dir, 'alpha.toml'), minimalToml('alpha'));
    writeFileSync(join(dir, 'beta.toml'), minimalToml('beta'));
    writeFileSync(join(dir, 'notes.txt'), 'ignored'); // non-toml is skipped

    const projectSeen: string[] = [];
    const machineSeen: string[] = [];
    const projectCheck: HealthCheck = {
      name: 'pc',
      scope: 'project',
      detect: async ({ config }) => {
        projectSeen.push(config.name);
        return ok('p');
      },
    };
    const machineCheck: HealthCheck = {
      name: 'mc',
      scope: 'machine',
      detect: async () => {
        machineSeen.push('ran');
        return ok('m');
      },
    };

    const result = await runDoctor({
      cwd: dir,
      all: true,
      configDir: dir,
      checks: [projectCheck, machineCheck],
      log: () => {},
    });

    expect(projectSeen.sort()).toEqual(['alpha', 'beta']);
    expect(machineSeen).toHaveLength(1);
    expect(result.exitCode).toBe(0);
  });

  it('returns exitCode 1 when no project config matches the cwd', async () => {
    const result = await runDoctor({
      cwd: dir,
      checks: [],
      discover: async () => null,
      log: () => {},
    });

    expect(result.exitCode).toBe(1);
  });
});
