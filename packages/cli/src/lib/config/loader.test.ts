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

  it('parses an optional [db_clone] section with all fields', () => {
    const raw = `
name = "x"
repo_path = "/x"

[jira]
project_key = "X"
site = "https://x.atlassian.net"

[github]
repo = "u/r"

[db_clone]
postgres_service = "db"
postgres_user = "app"
postgres_database = "app"
required_tables = ["user", "user_macro_goal"]
exclude_tables = ["kysely_migration*", "audit_log"]
`;
    const config = parseProjectConfig(raw);
    expect(config.db_clone).toEqual({
      postgres_service: 'db',
      postgres_user: 'app',
      postgres_database: 'app',
      required_tables: ['user', 'user_macro_goal'],
      exclude_tables: ['kysely_migration*', 'audit_log'],
    });
  });

  it('fills in db_clone defaults when section is omitted', () => {
    const raw = `
name = "x"
repo_path = "/x"

[jira]
project_key = "X"
site = "https://x.atlassian.net"

[github]
repo = "u/r"
`;
    const config = parseProjectConfig(raw);
    expect(config.db_clone).toEqual({
      postgres_service: 'postgres',
      postgres_user: 'postgres',
      postgres_database: 'postgres',
      required_tables: [],
      exclude_tables: ['kysely_migration*'],
    });
  });
});

describe('parseProjectConfig — visual_testing', () => {
  const baseToml = `
name = "minimal"
repo_path = "/x"

[jira]
project_key = "MIN"
site = "https://x.atlassian.net"

[github]
repo = "owner/repo"
`;

  it('parses with no [visual_testing] section (backwards compatible)', () => {
    const config = parseProjectConfig(baseToml);
    expect(config.visual_testing).toBeUndefined();
  });

  it('parses [visual_testing] with start_command (no docker)', () => {
    const raw = `${baseToml}
[visual_testing]
enabled = true
app_url = "http://localhost:5173"
start_command = "npm run dev"
`;
    const config = parseProjectConfig(raw);
    expect(config.visual_testing?.enabled).toBe(true);
    expect(config.visual_testing?.app_url).toBe('http://localhost:5173');
    expect(config.visual_testing?.start_command).toBe('npm run dev');
  });

  it('parses [visual_testing] with port placeholder + [docker]', () => {
    const raw = `${baseToml}
[docker]
canonical_worktree = "main"

[visual_testing]
enabled = true
app_url = "https://localhost:{httpsPort}"
`;
    const config = parseProjectConfig(raw);
    expect(config.visual_testing?.app_url).toBe('https://localhost:{httpsPort}');
  });

  it('rejects [visual_testing] without app_url', () => {
    const raw = `${baseToml}
[visual_testing]
enabled = true
`;
    expect(() => parseProjectConfig(raw)).toThrow();
  });

  it('rejects [visual_testing] when neither start_command nor [docker] present', () => {
    const raw = `${baseToml}
[visual_testing]
enabled = true
app_url = "http://localhost:5173"
`;
    expect(() => parseProjectConfig(raw)).toThrow(/start_command/);
  });

  it('rejects {httpsPort} placeholder when no [docker] section', () => {
    const raw = `${baseToml}
[visual_testing]
enabled = true
app_url = "https://localhost:{httpsPort}"
start_command = "npm run dev"
`;
    expect(() => parseProjectConfig(raw)).toThrow(/docker/);
  });

  it('parses [visual_testing.authored] sub-table when complete', () => {
    const raw = `${baseToml}
[visual_testing]
enabled = true
app_url = "http://localhost:5173"
start_command = "npm run dev"

[visual_testing.authored]
tests_dir = "tests/e2e"
test_command = "npm run test:e2e"
`;
    const config = parseProjectConfig(raw);
    expect(config.visual_testing?.authored?.tests_dir).toBe('tests/e2e');
    expect(config.visual_testing?.authored?.test_command).toBe('npm run test:e2e');
  });

  // Note: the [visual_testing.authored] partial-rejection case is tested in
  // CREW-γ (Task 13) when the authored sub-table is added to the schema.
});
