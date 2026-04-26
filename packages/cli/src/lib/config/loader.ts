import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseToml } from 'smol-toml';
import { execa } from 'execa';
import { projectConfigSchema, type ProjectConfig } from './schema.js';

const CONFIG_DIR = join(homedir(), '.config', 'crew', 'projects');

/**
 * Parse a TOML config string and validate against the project-config schema.
 * Throws on invalid TOML or schema violations.
 */
export function parseProjectConfig(raw: string): ProjectConfig {
  const parsed = parseToml(raw);
  return projectConfigSchema.parse(parsed);
}

/**
 * Load a named project config from ~/.config/crew/projects/<name>.toml.
 */
export function loadProjectConfigByName(name: string): ProjectConfig {
  const path = join(CONFIG_DIR, `${name}.toml`);
  if (!existsSync(path)) {
    throw new Error(`no project config at ${path}`);
  }
  return parseProjectConfig(readFileSync(path, 'utf8'));
}

/**
 * Auto-discover the project config that matches the current cwd. Walks up to
 * find a .git directory, reads the origin URL, and returns the first config
 * in ~/.config/crew/projects/*.toml whose github.repo matches. Returns null
 * if no match.
 */
export async function discoverProjectConfig(cwd: string): Promise<ProjectConfig | null> {
  const remoteUrl = await execa('git', ['-C', cwd, 'remote', 'get-url', 'origin'])
    .then((r) => r.stdout.trim())
    .catch(() => '');
  if (!remoteUrl) return null;

  const repoSlug = parseGithubSlug(remoteUrl);
  if (!repoSlug) return null;

  if (!existsSync(CONFIG_DIR)) return null;
  for (const file of readdirSync(CONFIG_DIR)) {
    if (!file.endsWith('.toml')) continue;
    try {
      const config = parseProjectConfig(readFileSync(join(CONFIG_DIR, file), 'utf8'));
      if (config.github.repo === repoSlug) return config;
    } catch {
      // skip files that don't parse
    }
  }
  return null;
}

function parseGithubSlug(remoteUrl: string): string | null {
  // git@github.com:owner/repo.git → owner/repo
  // https://github.com/owner/repo.git → owner/repo
  const match = remoteUrl.match(/github\.com[:/]([^/]+\/[^/.]+)(\.git)?$/);
  return match?.[1] ?? null;
}
