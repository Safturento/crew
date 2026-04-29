import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseToml } from 'smol-toml';
import { projectConfigSchema, type ProjectConfig } from './schema.js';

/** Default location for per-project configs: `~/.config/crew/projects`. */
export function defaultProjectConfigDir(): string {
  return join(homedir(), '.config', 'crew', 'projects');
}

/**
 * Parse a TOML config string and validate against the project-config schema.
 * Throws on invalid TOML or schema violations.
 */
export function parseProjectConfig(raw: string): ProjectConfig {
  const parsed = parseToml(raw);
  return projectConfigSchema.parse(parsed);
}

/**
 * Load a named project config from `<configDir>/<name>.toml`. When `configDir`
 * is omitted, falls back to `~/.config/crew/projects`. The daemon and tests
 * pass an explicit directory so the loader stays free of process-global state.
 */
export function loadProjectConfigByName(name: string, configDir?: string): ProjectConfig {
  const dir = configDir ?? defaultProjectConfigDir();
  const path = join(dir, `${name}.toml`);
  if (!existsSync(path)) {
    throw new Error(`no project config at ${path}`);
  }
  return parseProjectConfig(readFileSync(path, 'utf8'));
}
