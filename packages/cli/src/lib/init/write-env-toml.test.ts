import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnvSpec } from '../env-spec/index.js';
import { writeEnvToml } from './write-env-toml.js';
import type { InitAnswers } from './types.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crew-init-env-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const base: InitAnswers = {
  name: 'demo',
  repoPath: '/x/demo',
  jira: { projectKey: 'DEMO', site: 'https://demo.atlassian.net' },
  github: { repo: 'me/demo' },
};

describe('writeEnvToml', () => {
  it('writes env.toml into the worktree', () => {
    const written = writeEnvToml(base, dir);
    expect(written).toBe(join(dir, 'env.toml'));
    expect(existsSync(written)).toBe(true);
  });

  it('emits a spec that parses through parseEnvSpec', () => {
    const written = writeEnvToml(base, dir);
    const spec = parseEnvSpec(readFileSync(written, 'utf8'));
    expect(spec.schema).toBe(1);
  });

  it('seeds the chosen daemon/dashboard ports', () => {
    const written = writeEnvToml({ ...base, ports: { daemon: 8123, dashboard: 8456 } }, dir);
    const spec = parseEnvSpec(readFileSync(written, 'utf8'));
    expect(spec.orchestration.DAEMON_PORT).toEqual({ kind: 'port', default: 8123 });
    expect(spec.orchestration.DASHBOARD_PORT).toEqual({ kind: 'port', default: 8456 });
  });

  it('defaults ports when answers omit them', () => {
    const written = writeEnvToml(base, dir);
    const spec = parseEnvSpec(readFileSync(written, 'utf8'));
    expect(spec.orchestration.DAEMON_PORT).toEqual({ kind: 'port', default: 7773 });
    expect(spec.orchestration.DASHBOARD_PORT).toEqual({ kind: 'port', default: 5173 });
  });

  it('templates APP_URL/DAEMON_URL off the port vars', () => {
    const written = writeEnvToml(base, dir);
    const spec = parseEnvSpec(readFileSync(written, 'utf8'));
    expect(spec.orchestration.APP_URL).toEqual({
      kind: 'template',
      value: 'http://localhost:${DASHBOARD_PORT}',
    });
    expect(spec.orchestration.DAEMON_URL).toEqual({
      kind: 'template',
      value: 'http://localhost:${DAEMON_PORT}',
    });
  });
});
