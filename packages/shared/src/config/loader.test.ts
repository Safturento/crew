import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { loadProjectConfigByName, parseProjectConfig } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '../../test/fixtures/project-config-sample.toml');

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

describe('parseProjectConfig — playwright', () => {
  const baseToml = `
name = "minimal"
repo_path = "/x"

[jira]
project_key = "MIN"
site = "https://x.atlassian.net"

[github]
repo = "owner/repo"
`;

  it('parses with no [playwright] section (backwards compatible)', () => {
    const config = parseProjectConfig(baseToml);
    expect(config.playwright).toBeUndefined();
  });

  it('parses [playwright] with smoke only', () => {
    const raw = `${baseToml}
[playwright]
app_url = "http://localhost:5173"
start_command = "npm run dev"

[playwright.smoke]
enabled = true
`;
    const config = parseProjectConfig(raw);
    expect(config.playwright?.smoke?.enabled).toBe(true);
    expect(config.playwright?.authored).toBeUndefined();
    expect(config.playwright?.app_url).toBe('http://localhost:5173');
    expect(config.playwright?.start_command).toBe('npm run dev');
  });

  it('parses [playwright] with authored only', () => {
    const raw = `${baseToml}
[playwright]
app_url = "http://localhost:5173"
start_command = "npm run dev"

[playwright.authored]
enabled = true
tests_dir = "tests/e2e"
test_command = "npm run test:e2e"
`;
    const config = parseProjectConfig(raw);
    expect(config.playwright?.smoke).toBeUndefined();
    expect(config.playwright?.authored?.enabled).toBe(true);
    expect(config.playwright?.authored?.tests_dir).toBe('tests/e2e');
    expect(config.playwright?.authored?.test_command).toBe('npm run test:e2e');
  });

  it('parses authored with verify_after_run + verify_max_attempts defaults', () => {
    const raw = `${baseToml}
[playwright]
app_url = "http://localhost:5173"
start_command = "npm run dev"

[playwright.authored]
enabled = true
tests_dir = "tests/e2e"
test_command = "npm run test:e2e"
`;
    const config = parseProjectConfig(raw);
    expect(config.playwright?.authored?.verify_after_run).toBe(false);
    expect(config.playwright?.authored?.verify_max_attempts).toBe(2);
  });

  it('parses authored with verify_after_run = true and a custom verify_max_attempts', () => {
    const raw = `${baseToml}
[playwright]
app_url = "http://localhost:5173"
start_command = "npm run dev"

[playwright.authored]
enabled = true
tests_dir = "tests/e2e"
test_command = "npm run test:e2e"
verify_after_run = true
verify_max_attempts = 4
`;
    const config = parseProjectConfig(raw);
    expect(config.playwright?.authored?.verify_after_run).toBe(true);
    expect(config.playwright?.authored?.verify_max_attempts).toBe(4);
  });

  it('rejects verify_max_attempts < 1', () => {
    const raw = `${baseToml}
[playwright]
app_url = "http://localhost:5173"
start_command = "npm run dev"

[playwright.authored]
enabled = true
tests_dir = "tests/e2e"
test_command = "npm run test:e2e"
verify_max_attempts = 0
`;
    expect(() => parseProjectConfig(raw)).toThrow();
  });

  it('parses [playwright] with both modes enabled', () => {
    const raw = `${baseToml}
[playwright]
app_url = "http://localhost:5173"
start_command = "npm run dev"

[playwright.smoke]
enabled = true

[playwright.authored]
enabled = true
tests_dir = "tests/e2e"
test_command = "npm run test:e2e"
`;
    const config = parseProjectConfig(raw);
    expect(config.playwright?.smoke?.enabled).toBe(true);
    expect(config.playwright?.authored?.enabled).toBe(true);
  });

  it('rejects [playwright] with neither sub-mode enabled', () => {
    const raw = `${baseToml}
[playwright]
app_url = "http://localhost:5173"
start_command = "npm run dev"
`;
    expect(() => parseProjectConfig(raw)).toThrow(
      /at least one of \[playwright\.smoke\] or \[playwright\.authored\]/,
    );
  });

  it('rejects port placeholder in app_url without [docker]', () => {
    const raw = `${baseToml}
[playwright]
app_url = "https://localhost:{httpsPort}"
start_command = "npm run dev"

[playwright.smoke]
enabled = true
`;
    expect(() => parseProjectConfig(raw)).toThrow(/port placeholder.*\[docker\]/);
  });

  it('rejects missing start_command without [docker]', () => {
    const raw = `${baseToml}
[playwright]
app_url = "http://localhost:5173"

[playwright.smoke]
enabled = true
`;
    expect(() => parseProjectConfig(raw)).toThrow(/start_command is required/);
  });

  it('parses [playwright] with port placeholder + [docker]', () => {
    const raw = `${baseToml}
[docker]
canonical_worktree = "x"

[playwright]
app_url = "https://localhost:{httpsPort}"

[playwright.smoke]
enabled = true
`;
    const config = parseProjectConfig(raw);
    expect(config.playwright?.app_url).toBe('https://localhost:{httpsPort}');
  });

  it('silently strips a leftover [visual_testing] block (migration)', () => {
    const raw = `${baseToml}
[visual_testing]
enabled = true
app_url = "http://x"
`;
    const config = parseProjectConfig(raw);
    expect((config as Record<string, unknown>).visual_testing).toBeUndefined();
  });
});

describe('parseProjectConfig — bruno_smoke', () => {
  const baseToml = `
name = "minimal"
repo_path = "/x"

[jira]
project_key = "MIN"
site = "https://x.atlassian.net"

[github]
repo = "owner/repo"
`;

  it('parses with no [bruno_smoke] section (backwards compatible)', () => {
    const config = parseProjectConfig(baseToml);
    expect(config.bruno_smoke).toBeUndefined();
  });

  it('parses [bruno_smoke] minimal (no docker, no smoke_user)', () => {
    const raw = `${baseToml}
[bruno_smoke]
enabled = true
base_url = "http://localhost:3000"
`;
    const config = parseProjectConfig(raw);
    expect(config.bruno_smoke?.enabled).toBe(true);
    expect(config.bruno_smoke?.base_url).toBe('http://localhost:3000');
    expect(config.bruno_smoke?.collection_dir).toBe('bruno');
    expect(config.bruno_smoke?.smoke_user).toBeUndefined();
  });

  it('parses [bruno_smoke] with port placeholder + [docker]', () => {
    const raw = `${baseToml}
[docker]
canonical_worktree = "main"

[bruno_smoke]
enabled = true
base_url = "https://localhost:{httpsPort}"
`;
    const config = parseProjectConfig(raw);
    expect(config.bruno_smoke?.base_url).toBe('https://localhost:{httpsPort}');
  });

  it('parses custom collection_dir', () => {
    const raw = `${baseToml}
[bruno_smoke]
enabled = true
base_url = "http://localhost:3000"
collection_dir = "api-tests"
`;
    const config = parseProjectConfig(raw);
    expect(config.bruno_smoke?.collection_dir).toBe('api-tests');
  });

  it('parses full [bruno_smoke.smoke_user] sub-table', () => {
    const raw = `${baseToml}
[bruno_smoke]
enabled = true
base_url = "http://localhost:3000"

[bruno_smoke.smoke_user]
email = "smoke@example.com"
username = "smoke"
password = "hunter2"
`;
    const config = parseProjectConfig(raw);
    expect(config.bruno_smoke?.smoke_user).toEqual({
      email: 'smoke@example.com',
      username: 'smoke',
      password: 'hunter2',
    });
  });

  it('rejects [bruno_smoke] without base_url', () => {
    const raw = `${baseToml}
[bruno_smoke]
enabled = true
`;
    expect(() => parseProjectConfig(raw)).toThrow();
  });

  it('rejects {httpsPort} placeholder when no [docker] section', () => {
    const raw = `${baseToml}
[bruno_smoke]
enabled = true
base_url = "https://localhost:{httpsPort}"
`;
    expect(() => parseProjectConfig(raw)).toThrow(/docker/);
  });

  it('rejects [bruno_smoke.smoke_user] missing password', () => {
    const raw = `${baseToml}
[bruno_smoke]
enabled = true
base_url = "http://localhost:3000"

[bruno_smoke.smoke_user]
email = "smoke@example.com"
username = "smoke"
`;
    expect(() => parseProjectConfig(raw)).toThrow(/password/);
  });

  it('rejects [bruno_smoke.smoke_user] missing email', () => {
    const raw = `${baseToml}
[bruno_smoke]
enabled = true
base_url = "http://localhost:3000"

[bruno_smoke.smoke_user]
username = "smoke"
password = "hunter2"
`;
    expect(() => parseProjectConfig(raw)).toThrow(/email/);
  });

  it('rejects empty collection_dir', () => {
    const raw = `${baseToml}
[bruno_smoke]
enabled = true
base_url = "http://localhost:3000"
collection_dir = ""
`;
    expect(() => parseProjectConfig(raw)).toThrow();
  });
});

describe('loadProjectConfigByName', () => {
  it('loads a config from a custom configDir when provided', () => {
    const dir = mkdtempSync(join(tmpdir(), 'crew-shared-config-'));
    try {
      writeFileSync(
        join(dir, 'recipes-app.toml'),
        `name = "recipes-app"
repo_path = "/x"

[jira]
project_key = "KAN"
site = "https://safturento.atlassian.net"

[github]
repo = "Safturento/Recipes"
`,
        'utf8',
      );
      const config = loadProjectConfigByName('recipes-app', dir);
      expect(config.name).toBe('recipes-app');
      expect(config.jira.project_key).toBe('KAN');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws a useful error referencing the custom configDir when missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'crew-shared-config-'));
    try {
      expect(() => loadProjectConfigByName('does-not-exist', dir)).toThrow(/does-not-exist/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
