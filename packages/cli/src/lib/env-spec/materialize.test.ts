import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { materialize, type MaterializeOptions } from './materialize.js';
import { parseEnvSpec } from './parse.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crew-mat-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const baseSpec = `
schema = 1

[orchestration]
COMPOSE_PROJECT_NAME = { kind = "template", value = "\${BASE_NAME}-\${WORKTREE_ID}" }
HTTP_PORT  = { kind = "port", default = 80 }
HTTPS_PORT = { kind = "port", default = 443 }
APP_URL    = { kind = "template", value = "https://localhost:\${HTTPS_PORT}" }

[app]
DATABASE_URL = { source = "literal",  value = "postgres://localhost:\${HTTP_PORT}/db" }
SECRET       = { source = "generate", command = "echo deterministic-secret" }
CORS_ORIGIN  = { source = "literal",  value = "\${APP_URL}" }

[contexts.docker-backend]
DATABASE_URL = "postgres://postgres:5432/db"
`;

const opts = (overrides: Partial<MaterializeOptions> = {}): MaterializeOptions => ({
  baseName: 'recipes',
  worktreeId: 'main',
  worktreeBasename: 'recipes',
  isCanonical: true,
  cacheEnv: {},
  canonicalEnv: undefined,
  ...overrides,
});

describe('materialize', () => {
  it('resolves all four section types into a base map and per-context overrides', () => {
    const spec = parseEnvSpec(baseSpec);
    const result = materialize(spec, opts());

    expect(result.base.COMPOSE_PROJECT_NAME).toBe('recipes-main');
    expect(result.base.HTTP_PORT).toBe('80');
    expect(result.base.HTTPS_PORT).toBe('443');
    expect(result.base.APP_URL).toBe('https://localhost:443');
    expect(result.base.DATABASE_URL).toBe('postgres://localhost:80/db');
    expect(result.base.SECRET).toBe('deterministic-secret');
    expect(result.base.CORS_ORIGIN).toBe('https://localhost:443');
    expect(result.contexts['docker-backend']).toEqual({
      DATABASE_URL: 'postgres://postgres:5432/db',
    });
  });

  it('uses default for canonical port slots and allocator for non-canonical', () => {
    const spec = parseEnvSpec(baseSpec);

    const canon = materialize(spec, opts());
    expect(canon.base.HTTP_PORT).toBe('80');

    const spawn = materialize(
      spec,
      opts({ isCanonical: false, worktreeId: 'kan-23', worktreeBasename: 'recipes-kan-23' }),
    );
    expect(spawn.base.HTTP_PORT).not.toBe('80');
    expect(parseInt(spawn.base.HTTP_PORT, 10)).toBeGreaterThanOrEqual(16384);
  });

  it('preserves cached values for source = "generate" (idempotency)', () => {
    const spec = parseEnvSpec(baseSpec);
    const result = materialize(spec, opts({ cacheEnv: { SECRET: 'cached-value' } }));
    expect(result.base.SECRET).toBe('cached-value');
  });

  it('shares source = "generate" from canonical .env when not canonical', () => {
    const spec = parseEnvSpec(baseSpec);
    const result = materialize(
      spec,
      opts({
        isCanonical: false,
        worktreeId: 'kan-23',
        worktreeBasename: 'recipes-kan-23',
        canonicalEnv: { SECRET: 'from-canonical' },
      }),
    );
    expect(result.base.SECRET).toBe('from-canonical');
  });

  it('opts out of sharing when share = false on the entry', () => {
    const specSrc = baseSpec.replace(
      'SECRET       = { source = "generate", command = "echo deterministic-secret" }',
      'SECRET       = { source = "generate", command = "echo deterministic-secret", share = false }',
    );
    const spec = parseEnvSpec(specSrc);
    const result = materialize(
      spec,
      opts({
        isCanonical: false,
        worktreeId: 'kan-23',
        worktreeBasename: 'recipes-kan-23',
        canonicalEnv: { SECRET: 'should-not-share' },
      }),
    );
    expect(result.base.SECRET).toBe('deterministic-secret');
  });

  it('runs file generators and exposes the path under env_var when set', () => {
    const target = join(dir, 'jwk.pem');
    const fileSpec = `
schema = 1
[orchestration]
[app]
[files.JWK]
path      = "${target.replaceAll('\\', '/')}"
generator = "echo --- > \${path}"
env_var   = "JWK_PATH"
`;
    const spec = parseEnvSpec(fileSpec);
    const result = materialize(spec, opts());
    expect(result.base.JWK_PATH).toBe(target);
  });

  it('lets app literals reference a [files.*] env_var (files run before resolution loop)', () => {
    const target = join(dir, 'jwk.pem');
    const fileSpec = `
schema = 1
[orchestration]
[app]
JWK_DESC = { source = "literal", value = "key at \${JWK_PATH}" }
[files.JWK]
path      = "${target.replaceAll('\\', '/')}"
generator = "echo --- > \${path}"
env_var   = "JWK_PATH"
`;
    const spec = parseEnvSpec(fileSpec);
    const result = materialize(spec, opts());
    expect(result.base.JWK_DESC).toBe(`key at ${target}`);
  });

  it('lowercases BASE_NAME and WORKTREE_ID built-ins before substitution', () => {
    // Real-world trigger: ticket key "KAN-12" preserves uppercase through
    // wtBasename.replace("Recipes-", ""), then ${BASE_NAME}-${WORKTREE_ID}
    // produces a compose project name docker rejects.
    const spec = parseEnvSpec(baseSpec);
    const result = materialize(
      spec,
      opts({
        isCanonical: false,
        baseName: 'Recipes',
        worktreeId: 'KAN-12',
        worktreeBasename: 'Recipes-KAN-12',
      }),
    );
    expect(result.base.COMPOSE_PROJECT_NAME).toBe('recipes-kan-12');
  });

  it('throws on a cycle in templates', () => {
    const cycle = `
schema = 1
[orchestration]
A = { kind = "template", value = "\${B}" }
B = { kind = "template", value = "\${A}" }
[app]
`;
    const spec = parseEnvSpec(cycle);
    expect(() => materialize(spec, opts())).toThrow(/cycle/i);
  });
});
