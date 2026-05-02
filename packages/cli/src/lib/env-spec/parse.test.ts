import { describe, it, expect } from 'vitest';
import { parseEnvSpec } from './parse.js';

const minimal = `
schema = 1

[orchestration]
COMPOSE_PROJECT_NAME = { kind = "template", value = "\${BASE_NAME}-\${WORKTREE_ID}" }
HTTP_PORT = { kind = "port", default = 80 }

[app]
DATABASE_URL = { source = "literal", value = "postgres://localhost:5432/db" }
`;

describe('parseEnvSpec', () => {
  it('parses a minimal valid spec', () => {
    const spec = parseEnvSpec(minimal);
    expect(spec.schema).toBe(1);
    expect(spec.orchestration.COMPOSE_PROJECT_NAME).toEqual({
      kind: 'template',
      value: '${BASE_NAME}-${WORKTREE_ID}',
    });
    expect(spec.orchestration.HTTP_PORT).toEqual({ kind: 'port', default: 80 });
    expect(spec.app.DATABASE_URL).toEqual({
      source: 'literal',
      value: 'postgres://localhost:5432/db',
    });
    expect(spec.files).toEqual({});
    expect(spec.contexts).toEqual({});
  });

  it('rejects an unknown schema version', () => {
    expect(() => parseEnvSpec(`schema = 2\n[orchestration]\n[app]\n`)).toThrow(/schema/i);
  });

  it('rejects a missing schema field', () => {
    expect(() => parseEnvSpec(`[orchestration]\n[app]\n`)).toThrow(/schema/i);
  });

  it('rejects an unknown kind in orchestration', () => {
    const bad = `
schema = 1
[orchestration]
X = { kind = "weather", value = "sunny" }
[app]
`;
    expect(() => parseEnvSpec(bad)).toThrow(/kind/i);
  });

  it('rejects an unknown source in app', () => {
    const bad = `
schema = 1
[orchestration]
[app]
X = { source = "telepathy" }
`;
    expect(() => parseEnvSpec(bad)).toThrow(/source/i);
  });

  it('parses a [files.*] entry with optional env_var', () => {
    const withFiles = `
schema = 1
[orchestration]
[app]
[files.JWK]
path = "./secrets/jwk.pem"
generator = "openssl genpkey -algorithm RSA -out \${path}"
env_var = "JWK_PATH"
`;
    const spec = parseEnvSpec(withFiles);
    expect(spec.files.JWK).toEqual({
      path: './secrets/jwk.pem',
      generator: 'openssl genpkey -algorithm RSA -out ${path}',
      env_var: 'JWK_PATH',
    });
  });

  it('parses [contexts.*] override blocks', () => {
    const withCtx = `
schema = 1
[orchestration]
[app]
DATABASE_URL = { source = "literal", value = "postgres://localhost/db" }
[contexts.docker-backend]
DATABASE_URL = "postgres://postgres:5432/db"
`;
    const spec = parseEnvSpec(withCtx);
    expect(spec.contexts['docker-backend']).toEqual({
      DATABASE_URL: 'postgres://postgres:5432/db',
    });
  });

  it('rejects share = false on an entry without source = "generate"', () => {
    const bad = `
schema = 1
[orchestration]
[app]
X = { source = "literal", value = "x", share = false }
`;
    expect(() => parseEnvSpec(bad)).toThrow(/share/i);
  });
});
