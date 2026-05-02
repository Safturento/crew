import { readFileSync } from 'node:fs';
import { parse as parseToml } from 'smol-toml';
import { envSpecSchema, ENV_SPEC_SCHEMA_VERSION, type EnvSpec } from './types.js';

/**
 * Parse a raw env.toml string into a validated EnvSpec.
 * Throws on TOML syntax errors, schema-version mismatch, or shape violations.
 */
export function parseEnvSpec(raw: string): EnvSpec {
  let parsed: unknown;
  try {
    parsed = parseToml(raw);
  } catch (err) {
    throw new Error(`env.toml parse error: ${(err as Error).message}`);
  }

  const top = parsed as { schema?: unknown };
  if (top.schema === undefined) {
    throw new Error(
      `env.toml missing required \`schema\` field. This crew version supports schema = ${ENV_SPEC_SCHEMA_VERSION}.`,
    );
  }
  if (top.schema !== ENV_SPEC_SCHEMA_VERSION) {
    throw new Error(
      `env.toml schema = ${String(top.schema)} but this crew version only supports schema = ${ENV_SPEC_SCHEMA_VERSION}. Update crew or the spec.`,
    );
  }

  const result = envSpecSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('\n');
    throw new Error(`env.toml validation failed:\n${issues}`);
  }
  return result.data;
}

/** Read and parse `env.toml` from the given absolute path. */
export function loadEnvSpec(path: string): EnvSpec {
  return parseEnvSpec(readFileSync(path, 'utf8'));
}
