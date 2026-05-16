import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface SuperpowersChromePaths {
  /** Absolute path to the chrome MCP server entrypoint (`mcp/dist/index.js`). */
  mcpServerPath: string;
  /** Absolute path to the plugin's `skills/` directory — the parent of `browsing/`. */
  skillsRoot: string;
}

const PLUGIN_SUBPATH = join(
  '.claude', 'plugins', 'cache', 'superpowers-marketplace', 'superpowers-chrome',
);

/**
 * Resolve the installed superpowers-chrome plugin from the user's plugin cache.
 * Returns the chrome MCP server entrypoint and the plugin's skills root, or
 * `null` when the plugin is absent, has no valid version directory, or has no
 * built MCP server. The browsing skill is useless without the MCP server it
 * drives, so a missing server entrypoint means the whole plugin is treated as
 * unavailable.
 */
export function resolveSuperpowersChrome(
  homeDir: string = homedir(),
): SuperpowersChromePaths | null {
  const pluginDir = join(homeDir, PLUGIN_SUBPATH);
  if (!existsSync(pluginDir)) return null;

  const dirNames = readdirSync(pluginDir).filter((name) => {
    try {
      return statSync(join(pluginDir, name)).isDirectory();
    } catch {
      return false;
    }
  });
  const version = highestSemver(dirNames);
  if (!version) return null;

  const versionDir = join(pluginDir, version);
  const mcpServerPath = join(versionDir, 'mcp', 'dist', 'index.js');
  if (!existsSync(mcpServerPath)) return null;

  return { mcpServerPath, skillsRoot: join(versionDir, 'skills') };
}

/** Pick the highest `MAJOR.MINOR.PATCH` name; ignore non-semver entries. */
function highestSemver(names: string[]): string | null {
  const parsed = names
    .map((name) => {
      const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(name);
      return m
        ? { name, tuple: [Number(m[1]), Number(m[2]), Number(m[3])] as const }
        : null;
    })
    .filter((x): x is { name: string; tuple: readonly [number, number, number] } => x !== null);
  if (parsed.length === 0) return null;
  parsed.sort((a, b) => {
    for (let i = 0; i < 3; i++) {
      if (a.tuple[i] !== b.tuple[i]) return a.tuple[i] - b.tuple[i];
    }
    return 0;
  });
  return parsed[parsed.length - 1].name;
}
