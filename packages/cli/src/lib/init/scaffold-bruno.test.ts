import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffoldBruno } from './scaffold-bruno.js';
import type { InitAnswers } from './types.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crew-init-bruno-'));
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

describe('scaffoldBruno', () => {
  it('writes the collection skeleton under bruno/ by default', () => {
    const written = scaffoldBruno(base, dir);
    expect(written).toEqual([
      join(dir, 'bruno', 'bruno.json'),
      join(dir, 'bruno', 'environments', 'local.bru'),
      join(dir, 'bruno', 'endpoints', 'health', 'get.bru'),
      join(dir, 'bruno', 'flows', 'smoke.bru'),
    ]);
    for (const p of written) expect(existsSync(p)).toBe(true);
  });

  it('honours a custom collection_dir', () => {
    const [collectionFile] = scaffoldBruno(
      { ...base, brunoSmoke: { collectionDir: 'api-tests' } },
      dir,
    );
    expect(collectionFile).toBe(join(dir, 'api-tests', 'bruno.json'));
  });

  it('bruno.json is a valid collection manifest naming the project', () => {
    const [manifest] = scaffoldBruno(base, dir);
    const json = JSON.parse(readFileSync(manifest, 'utf8'));
    expect(json.type).toBe('collection');
    expect(json.name).toBe('demo');
  });

  it('health endpoint asserts a 200 against {{baseUrl}}', () => {
    const written = scaffoldBruno(base, dir);
    const health = readFileSync(written[2], 'utf8');
    expect(health).toContain('{{baseUrl}}/health');
    expect(health).toContain('res.status: eq 200');
  });

  it('environment file declares a baseUrl var', () => {
    const written = scaffoldBruno(base, dir);
    const env = readFileSync(written[1], 'utf8');
    expect(env).toMatch(/baseUrl:\s*http/);
  });
});
