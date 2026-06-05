import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { projectConfigSchema } from 'crew-shared';
import { writeProjectToml } from './write-project-toml.js';
import type { InitAnswers } from './types.js';

interface RawToml {
  name: string;
  repo_path: string;
  default_branch: string;
  jira: { project_key: string };
  github: { repo: string };
  docker?: unknown;
  playwright?: { app_url: string };
  bruno_smoke?: { base_url: string };
}

const asRaw = (raw: string): RawToml => parseToml(raw) as unknown as RawToml;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crew-init-toml-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const fullAnswers: InitAnswers = {
  name: 'demo',
  repoPath: '/home/me/Repos/demo',
  jira: { projectKey: 'DEMO', site: 'https://demo.atlassian.net' },
  github: { repo: 'me/demo' },
  docker: { canonicalWorktree: 'demo' },
  sandbox: { allowedDomains: ['github.com', 'api.anthropic.com'] },
  playwright: {
    smoke: true,
    authored: { testsDir: 'tests/e2e', testCommand: 'npm run test:e2e' },
  },
  brunoSmoke: { collectionDir: 'bruno' },
};

describe('writeProjectToml', () => {
  it('writes <name>.toml into the projects dir', () => {
    const written = writeProjectToml(fullAnswers, dir);
    expect(written).toBe(join(dir, 'demo.toml'));
    expect(existsSync(written)).toBe(true);
  });

  it('emits TOML that round-trips through projectConfigSchema', () => {
    const written = writeProjectToml(fullAnswers, dir);
    const parsed = parseToml(readFileSync(written, 'utf8'));
    const result = projectConfigSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it('uses ${VAR} refs for playwright.app_url and bruno_smoke.base_url', () => {
    const written = writeProjectToml(fullAnswers, dir);
    const parsed = asRaw(readFileSync(written, 'utf8'));
    expect(parsed.playwright?.app_url).toBe('${APP_URL}');
    expect(parsed.bruno_smoke?.base_url).toBe('${DAEMON_URL}');
  });

  it('carries name, repo_path, jira, github through to the TOML', () => {
    const written = writeProjectToml(fullAnswers, dir);
    const parsed = asRaw(readFileSync(written, 'utf8'));
    expect(parsed.name).toBe('demo');
    expect(parsed.repo_path).toBe('/home/me/Repos/demo');
    expect(parsed.default_branch).toBe('main');
    expect(parsed.jira.project_key).toBe('DEMO');
    expect(parsed.github.repo).toBe('me/demo');
  });

  it('emits start_command for a non-docker Playwright project (schema-valid)', () => {
    const noDocker: InitAnswers = {
      name: 'standalone',
      repoPath: '/x/standalone',
      jira: { projectKey: 'SA', site: 'https://sa.atlassian.net' },
      github: { repo: 'me/standalone' },
      playwright: {
        appUrl: 'http://localhost:3000',
        smoke: true,
        startCommand: 'npm run dev',
      },
    };
    const written = writeProjectToml(noDocker, dir);
    const parsed = parseToml(readFileSync(written, 'utf8')) as {
      playwright: { start_command: string };
    };
    expect(parsed.playwright.start_command).toBe('npm run dev');
    // superRefine: start_command is mandatory when [playwright] is set without [docker]
    expect(projectConfigSchema.safeParse(parsed).success).toBe(true);
  });

  it('omits optional blocks when the answers do not opt in', () => {
    const minimal: InitAnswers = {
      name: 'bare',
      repoPath: '/x/bare',
      jira: { projectKey: 'BARE', site: 'https://bare.atlassian.net' },
      github: { repo: 'me/bare' },
    };
    const written = writeProjectToml(minimal, dir);
    const parsed = asRaw(readFileSync(written, 'utf8'));
    expect(parsed.playwright).toBeUndefined();
    expect(parsed.bruno_smoke).toBeUndefined();
    expect(parsed.docker).toBeUndefined();
    expect(projectConfigSchema.safeParse(parsed).success).toBe(true);
  });
});
