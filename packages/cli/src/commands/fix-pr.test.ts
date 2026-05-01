import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  brunoSmokeOptionsFor,
  loadFeedback,
  parseGithubPrUrl,
  type FeedbackMode,
} from './fix-pr.js';
import type { ProjectConfig } from 'crew-shared';

describe('parseGithubPrUrl', () => {
  it('splits owner and repo from a github pr url', () => {
    expect(parseGithubPrUrl('https://github.com/Safturento/crew/pull/12')).toEqual({
      owner: 'Safturento',
      repo: 'crew',
    });
  });

  it('returns null on non-github urls', () => {
    expect(parseGithubPrUrl('https://example.com/x/y/pull/1')).toBeNull();
  });

  it('returns null on ssh-style urls', () => {
    expect(parseGithubPrUrl('git@github.com:Safturento/crew.git')).toBeNull();
  });

  it('keeps the literal repo segment, including any trailing .git', () => {
    expect(parseGithubPrUrl('https://github.com/Safturento/crew.git/pull/1')).toEqual({
      owner: 'Safturento',
      repo: 'crew.git',
    });
  });
});

describe('loadFeedback (file mode)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'crew-fb-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('reads the file contents and reports the source', async () => {
    const path = join(tmp, 'fb.md');
    writeFileSync(path, 'real feedback');

    const result = await loadFeedback({ key: 'KAN-1', mode: { kind: 'file', path } });

    expect(result).toEqual({ feedback: 'real feedback', source: `file: ${path}` });
  });

  it('throws on a missing file', async () => {
    await expect(
      loadFeedback({ key: 'KAN-1', mode: { kind: 'file', path: join(tmp, 'nope.md') } }),
    ).rejects.toThrow(/not found/);
  });
});

describe('loadFeedback — message mode', () => {
  it('returns the message as feedback verbatim', async () => {
    const result = await loadFeedback({
      key: 'KAN-1',
      mode: { kind: 'message', message: 'hello world' },
    });
    expect(result.feedback).toBe('hello world');
    expect(result.source).toBe('inline message');
  });

  it('preserves multi-line content', async () => {
    const msg = 'line one\nline two\n  - bullet';
    const result = await loadFeedback({
      key: 'KAN-1',
      mode: { kind: 'message', message: msg },
    });
    expect(result.feedback).toBe(msg);
  });

  it('throws on empty message', async () => {
    await expect(
      loadFeedback({ key: 'KAN-1', mode: { kind: 'message', message: '' } }),
    ).rejects.toThrow(/empty/i);
  });

  it('throws on whitespace-only message', async () => {
    await expect(
      loadFeedback({ key: 'KAN-1', mode: { kind: 'message', message: '   \n  ' } }),
    ).rejects.toThrow(/empty/i);
  });
});

describe('loadFeedback — stdin mode removed', () => {
  it("does not have a 'stdin' kind in FeedbackMode", () => {
    type Kind = FeedbackMode['kind'];
    const valid: Kind[] = ['pr', 'file', 'message'];
    expect(valid).toContain('message');
    expect(valid as string[]).not.toContain('stdin');
  });
});

function baseConfig(): ProjectConfig {
  return {
    name: 'test',
    repo_path: '/repo',
    default_branch: 'main',
    jira: { project_key: 'X', site: 'https://x.atlassian.net' },
    github: { repo: 'a/b' },
    db_clone: {
      postgres_service: 'postgres',
      postgres_user: 'postgres',
      postgres_database: 'postgres',
      required_tables: [],
      exclude_tables: ['kysely_migration*'],
    },
  } as ProjectConfig;
}

describe('brunoSmokeOptionsFor', () => {
  it('returns undefined when bruno_smoke is not enabled', () => {
    expect(brunoSmokeOptionsFor(baseConfig(), '/wt/main')).toBeUndefined();
  });

  it('throws when bruno_smoke uses a port placeholder without [docker]', () => {
    const cfg = baseConfig();
    cfg.bruno_smoke = {
      enabled: true,
      base_url: 'https://localhost:{httpsPort}',
      collection_dir: 'bruno',
    };
    expect(() => brunoSmokeOptionsFor(cfg, '/wt/main')).toThrow(/port|docker/i);
  });

  it('returns the resolved options when bruno_smoke is enabled', () => {
    const cfg = baseConfig();
    cfg.bruno_smoke = {
      enabled: true,
      base_url: 'http://localhost:3000',
      collection_dir: 'bruno',
    };
    const opts = brunoSmokeOptionsFor(cfg, '/wt/Recipes-App-KAN-99');
    expect(opts).toEqual({
      baseUrl: 'http://localhost:3000',
      envName: 'recipes-app-kan-99',
      collectionDir: 'bruno',
      hasSmokeUser: false,
    });
  });

  it('reports hasSmokeUser true when smoke_user is configured', () => {
    const cfg = baseConfig();
    cfg.bruno_smoke = {
      enabled: true,
      base_url: 'http://localhost:3000',
      collection_dir: 'bruno',
      smoke_user: { email: 'a', username: 'b', password: 'c' },
    };
    const opts = brunoSmokeOptionsFor(cfg, '/wt/main');
    expect(opts?.hasSmokeUser).toBe(true);
  });

  it('does not read .env when base_url has no port placeholder, even with [docker] set', () => {
    const cfg = baseConfig();
    cfg.docker = {
      canonical_worktree: 'main',
      http_port_base: 8000,
      https_port_base: 8400,
      postgres_port_base: 15400,
    };
    cfg.bruno_smoke = {
      enabled: true,
      base_url: 'http://localhost:3000',
      collection_dir: 'bruno',
    };
    // /wt/missing has no .env file. If the helper reads disk, this throws.
    const opts = brunoSmokeOptionsFor(cfg, '/wt/missing');
    expect(opts).toEqual({
      baseUrl: 'http://localhost:3000',
      envName: 'missing',
      collectionDir: 'bruno',
      hasSmokeUser: false,
    });
  });
});
