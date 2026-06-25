import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { runInit } from './run-init.js';
import { renderProjectToml } from './write-project-toml.js';
import type { InitAnswers } from './types.js';

let repo: string;
let projectsDir: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'crew-init-repo-'));
  projectsDir = mkdtempSync(join(tmpdir(), 'crew-init-projects-'));
});
afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(projectsDir, { recursive: true, force: true });
});

const answersFor = (repoPath: string): InitAnswers => ({
  name: 'demo',
  repoPath,
  jira: { projectKey: 'DEMO', site: 'https://demo.atlassian.net' },
  github: { repo: 'me/demo' },
  sandbox: { allowedDomains: ['github.com'] },
  playwright: {
    smoke: true,
    authored: { testsDir: 'tests/e2e', testCommand: 'npm run test:e2e' },
    startCommand: 'npm run dev',
  },
  brunoSmoke: { collectionDir: 'bruno' },
});

describe('runInit', () => {
  it('scaffolds every crew-specific artifact on an empty repo', async () => {
    const result = await runInit({ cwd: repo, answers: answersFor(repo), projectsDir });

    // project TOML written into the injected projects dir (= registration)
    expect(existsSync(join(projectsDir, 'demo.toml'))).toBe(true);
    // repo env.toml
    expect(existsSync(join(repo, 'env.toml'))).toBe(true);
    // opted-in playwright skeleton
    expect(existsSync(join(repo, 'playwright.config.ts'))).toBe(true);
    expect(existsSync(join(repo, 'tests', 'e2e'))).toBe(true);
    // opted-in bruno skeleton
    expect(existsSync(join(repo, 'bruno', 'bruno.json'))).toBe(true);
    // settings.json with the smoke/e2e excluded commands
    const settings = JSON.parse(readFileSync(join(repo, '.claude', 'settings.json'), 'utf8'));
    expect(settings.sandbox.excludedCommands).toContain('npm run bruno:smoke*');

    expect(result.written).toContain(join(projectsDir, 'demo.toml'));
    expect(result.skipped).toEqual([]);
  });

  it('is an idempotent no-op when re-run with the same answers (no overwrite prompt)', async () => {
    const answers = answersFor(repo);
    await runInit({ cwd: repo, answers, projectsDir });

    let prompted = false;
    const result = await runInit({
      cwd: repo,
      answers,
      projectsDir,
      confirmOverwrite: () => {
        prompted = true;
        return true;
      },
    });

    expect(prompted).toBe(false);
    expect(result.skipped).toEqual([]);
    // the managed files were not listed as freshly written (content identical)
    expect(result.written).not.toContain(join(projectsDir, 'demo.toml'));
    expect(result.written).not.toContain(join(repo, 'env.toml'));
  });

  it('leaves a diverged managed file untouched when the overwrite confirm is declined', async () => {
    const answers = answersFor(repo);
    await runInit({ cwd: repo, answers, projectsDir });

    // hand-edit the project TOML so it diverges from what crew would write
    const tomlPath = join(projectsDir, 'demo.toml');
    const handEdited = `${readFileSync(tomlPath, 'utf8')}\n# hand-edited\n`;
    writeFileSync(tomlPath, handEdited, 'utf8');

    const result = await runInit({
      cwd: repo,
      answers,
      projectsDir,
      confirmOverwrite: () => false,
    });

    expect(readFileSync(tomlPath, 'utf8')).toBe(handEdited); // untouched
    expect(result.skipped).toContain(tomlPath);
    expect(result.written).not.toContain(tomlPath);
  });

  it('overwrites a diverged file when the confirm is accepted', async () => {
    const answers = answersFor(repo);
    await runInit({ cwd: repo, answers, projectsDir });

    const tomlPath = join(projectsDir, 'demo.toml');
    writeFileSync(tomlPath, `${readFileSync(tomlPath, 'utf8')}\n# stale\n`, 'utf8');

    const result = await runInit({
      cwd: repo,
      answers,
      projectsDir,
      confirmOverwrite: () => true,
    });

    expect(readFileSync(tomlPath, 'utf8')).toBe(renderProjectToml(answers)); // reconverged
    expect(result.written).toContain(tomlPath);
  });

  it('does not re-scaffold an existing playwright suite', async () => {
    const answers = answersFor(repo);
    // pre-existing real config
    writeFileSync(join(repo, 'playwright.config.ts'), '// my real config\n', 'utf8');

    const result = await runInit({ cwd: repo, answers, projectsDir });

    expect(readFileSync(join(repo, 'playwright.config.ts'), 'utf8')).toBe('// my real config\n');
    expect(result.written).not.toContain(join(repo, 'playwright.config.ts'));
  });

  it('warns when the agent-context baseline is missing, and not when present', async () => {
    const withoutBaseline = await runInit({ cwd: repo, answers: answersFor(repo), projectsDir });
    expect(withoutBaseline.baselineWarning).toMatch(/establishing-a-new-project/);

    // stamp a minimal baseline and re-run
    writeFileSync(join(repo, 'AGENTS.md'), '# AGENTS\n', 'utf8');
    mkdirSync(join(repo, '.agents'), { recursive: true });
    const withBaseline = await runInit({ cwd: repo, answers: answersFor(repo), projectsDir });
    expect(withBaseline.baselineWarning).toBeUndefined();
  });

  it('fails fast (no partial writes) when the answers render a schema-invalid config', async () => {
    // Playwright opted in but neither smoke nor authored enabled — the schema's
    // superRefine rejects this, so writing it would poison the next config load.
    const answers: InitAnswers = {
      name: 'demo',
      repoPath: repo,
      jira: { projectKey: 'DEMO', site: 'https://demo.atlassian.net' },
      github: { repo: 'me/demo' },
      playwright: { smoke: false },
    };

    await expect(runInit({ cwd: repo, answers, projectsDir })).rejects.toThrow(/playwright/i);

    // nothing was written — the guard runs before any scaffolding
    expect(existsSync(join(projectsDir, 'demo.toml'))).toBe(false);
    expect(existsSync(join(repo, 'env.toml'))).toBe(false);
  });

  it('scaffolds an empty 0600 gh-token placeholder and gitignores .claude/secrets/', async () => {
    const logs: string[] = [];
    const result = await runInit({
      cwd: repo,
      answers: answersFor(repo),
      projectsDir,
      log: (m) => logs.push(m),
    });

    const tokenPath = join(repo, '.claude', 'secrets', 'gh-token');
    expect(existsSync(tokenPath)).toBe(true);
    expect(readFileSync(tokenPath, 'utf8')).toBe(''); // empty placeholder
    expect(statSync(tokenPath).mode & 0o777).toBe(0o600);

    // .gitignore appended (created here since the bare repo had none)
    expect(readFileSync(join(repo, '.gitignore'), 'utf8')).toContain('.claude/secrets/');

    expect(result.written).toContain(tokenPath);
    // a populate-the-PAT instruction is surfaced
    expect(logs.join('\n')).toMatch(/gh-token|PAT/i);
  });

  it('leaves an existing non-empty gh-token untouched and appends gitignore idempotently', async () => {
    const tokenPath = join(repo, '.claude', 'secrets', 'gh-token');
    mkdirSync(join(repo, '.claude', 'secrets'), { recursive: true });
    writeFileSync(tokenPath, 'github_pat_REAL\n', 'utf8');
    writeFileSync(join(repo, '.gitignore'), 'node_modules\n.claude/secrets/\n', 'utf8');

    const result = await runInit({ cwd: repo, answers: answersFor(repo), projectsDir });

    expect(readFileSync(tokenPath, 'utf8')).toBe('github_pat_REAL\n'); // never clobbered
    expect(result.written).not.toContain(tokenPath);
    // gitignore entry not duplicated
    const gi = readFileSync(join(repo, '.gitignore'), 'utf8');
    expect(gi.match(/\.claude\/secrets\//g)).toHaveLength(1);
  });

  it('materializes .env via runEnvInit for a docker-backed project', async () => {
    const canonical = basename(repo);
    const answers: InitAnswers = {
      ...answersFor(repo),
      docker: { canonicalWorktree: canonical },
    };

    const result = await runInit({ cwd: repo, answers, projectsDir });

    expect(result.env?.ok).toBe(true);
    expect(existsSync(join(repo, '.env'))).toBe(true);
  });
});
