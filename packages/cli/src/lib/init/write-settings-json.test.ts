import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSettingsJson } from './write-settings-json.js';
import type { InitAnswers } from './types.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crew-init-settings-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const fullAnswers: InitAnswers = {
  name: 'demo',
  repoPath: '/x/demo',
  jira: { projectKey: 'DEMO', site: 'https://demo.atlassian.net' },
  github: { repo: 'me/demo' },
  docker: { canonicalWorktree: 'demo' },
  playwright: {
    smoke: true,
    authored: { testsDir: 'tests/e2e', testCommand: 'npm run test:e2e' },
  },
  brunoSmoke: { collectionDir: 'bruno' },
};

const minimalAnswers: InitAnswers = {
  name: 'bare',
  repoPath: '/x/bare',
  jira: { projectKey: 'BARE', site: 'https://bare.atlassian.net' },
  github: { repo: 'me/bare' },
};

function settingsPath(): string {
  return join(dir, '.claude', 'settings.json');
}

function seedExisting(json: unknown): void {
  mkdirSync(join(dir, '.claude'), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(json, null, 2), 'utf8');
}

describe('writeSettingsJson', () => {
  it('creates .claude/settings.json with the required excludedCommands when absent', () => {
    const written = writeSettingsJson(fullAnswers, dir);
    expect(written).toBe(settingsPath());
    expect(existsSync(written)).toBe(true);
    const json = JSON.parse(readFileSync(written, 'utf8'));
    expect(json.sandbox.excludedCommands).toEqual(
      expect.arrayContaining(['npm run bruno:smoke*', 'npm run test:e2e*', 'docker compose*']),
    );
  });

  it('merges into an existing file without clobbering other keys', () => {
    seedExisting({
      permissions: { allow: ['Bash(ls:*)'] },
      sandbox: { allowedDomains: ['example.com'], excludedCommands: ['existing*'] },
    });

    writeSettingsJson(fullAnswers, dir);
    const json = JSON.parse(readFileSync(settingsPath(), 'utf8'));

    // unrelated keys preserved
    expect(json.permissions.allow).toEqual(['Bash(ls:*)']);
    expect(json.sandbox.allowedDomains).toEqual(['example.com']);
    // existing excludedCommands kept, required entries added
    expect(json.sandbox.excludedCommands).toContain('existing*');
    expect(json.sandbox.excludedCommands).toContain('docker compose*');
    expect(json.sandbox.excludedCommands).toContain('npm run bruno:smoke*');
  });

  it('does not duplicate an entry already present (idempotent)', () => {
    seedExisting({ sandbox: { excludedCommands: ['docker compose*'] } });
    writeSettingsJson(fullAnswers, dir);
    writeSettingsJson(fullAnswers, dir);
    const cmds: string[] = JSON.parse(readFileSync(settingsPath(), 'utf8')).sandbox
      .excludedCommands;
    expect(cmds.filter((c) => c === 'docker compose*')).toHaveLength(1);
    expect(new Set(cmds).size).toBe(cmds.length);
  });

  it('derives no entries when nothing is opted in, but still creates the file', () => {
    const written = writeSettingsJson(minimalAnswers, dir);
    const json = JSON.parse(readFileSync(written, 'utf8'));
    expect(json.sandbox.excludedCommands).toEqual([]);
  });

  it('only adds the authored test command when playwright.authored is opted in', () => {
    const smokeOnly: InitAnswers = { ...minimalAnswers, playwright: { smoke: true } };
    writeSettingsJson(smokeOnly, dir);
    const cmds: string[] = JSON.parse(readFileSync(settingsPath(), 'utf8')).sandbox
      .excludedCommands;
    expect(cmds).toEqual([]);
  });
});
