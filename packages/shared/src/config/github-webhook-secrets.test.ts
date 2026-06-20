import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseGithubWebhookSecrets, loadGithubWebhookSecrets } from './github-webhook-secrets.js';

describe('parseGithubWebhookSecrets', () => {
  it('maps repo (lowercased) → secret', () => {
    const m = parseGithubWebhookSecrets(`
["Owner/Repo"]
secret = "s3cr3t"
`);
    expect(m.get('owner/repo')).toBe('s3cr3t');
  });

  it('maps multiple repos', () => {
    const m = parseGithubWebhookSecrets(`
["Owner/one"]
secret = "a"

["Owner/two"]
secret = "b"
`);
    expect(m.get('owner/one')).toBe('a');
    expect(m.get('owner/two')).toBe('b');
    expect(m.size).toBe(2);
  });

  it('rejects an entry missing secret', () => {
    expect(() => parseGithubWebhookSecrets(`["o/r"]\n`)).toThrow();
  });

  it('rejects an empty secret', () => {
    expect(() => parseGithubWebhookSecrets(`["o/r"]\nsecret = ""\n`)).toThrow();
  });

  it('rejects malformed TOML', () => {
    expect(() => parseGithubWebhookSecrets('not = valid = toml')).toThrow();
  });
});

describe('loadGithubWebhookSecrets', () => {
  it('returns an empty map when the file is absent', () => {
    expect(loadGithubWebhookSecrets('/nonexistent/github-webhook-secrets.toml').size).toBe(0);
  });

  it('loads and parses an existing file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'crew-webhook-secrets-'));
    try {
      const path = join(dir, 'github-webhook-secrets.toml');
      writeFileSync(path, `["Owner/Repo"]\nsecret = "s3cr3t"\n`, 'utf8');
      const m = loadGithubWebhookSecrets(path);
      expect(m.get('owner/repo')).toBe('s3cr3t');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws on a present-but-malformed file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'crew-webhook-secrets-'));
    try {
      const path = join(dir, 'github-webhook-secrets.toml');
      writeFileSync(path, `["o/r"]\n`, 'utf8'); // missing secret
      expect(() => loadGithubWebhookSecrets(path)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
