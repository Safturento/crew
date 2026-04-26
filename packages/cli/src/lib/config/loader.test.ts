import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parseProjectConfig } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '../../../test/fixtures/project-config-sample.toml');

describe('parseProjectConfig', () => {
  it('parses a valid TOML config', () => {
    const raw = readFileSync(FIXTURE, 'utf8');
    const config = parseProjectConfig(raw);

    expect(config.name).toBe('recipes-app');
    expect(config.jira.project_key).toBe('KAN');
    expect(config.jira.site).toBe('https://safturento.atlassian.net');
    expect(config.github.repo).toBe('Safturento/Recipes');
    expect(config.docker?.canonical_worktree).toBe('Recipes-App');
    expect(config.default_branch).toBe('main');
  });

  it('defaults default_branch to "main" when omitted', () => {
    const raw = `
name = "minimal"
repo_path = "/x"

[jira]
project_key = "MIN"
site = "https://x.atlassian.net"

[github]
repo = "u/r"
`;
    const config = parseProjectConfig(raw);
    expect(config.default_branch).toBe('main');
  });

  it('throws a useful error on invalid TOML', () => {
    expect(() => parseProjectConfig('not = valid = toml')).toThrow();
  });

  it('throws when jira.site is not a URL', () => {
    const raw = `
name = "x"
repo_path = "/x"

[jira]
project_key = "X"
site = "not a url"

[github]
repo = "u/r"
`;
    expect(() => parseProjectConfig(raw)).toThrow();
  });
});
