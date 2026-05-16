import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveSuperpowersChrome } from './resolve-superpowers-chrome.js';

const PLUGIN_REL = join(
  '.claude', 'plugins', 'cache', 'superpowers-marketplace', 'superpowers-chrome',
);

/** Build a fake home dir with a superpowers-chrome plugin at the given versions.
 *  `built` controls whether each version has a `mcp/dist/index.js` on disk. */
function makeHome(versions: Array<{ version: string; built: boolean }>): string {
  const home = mkdtempSync(join(tmpdir(), 'crew-spchrome-'));
  for (const { version, built } of versions) {
    const versionDir = join(home, PLUGIN_REL, version);
    mkdirSync(join(versionDir, 'skills', 'browsing'), { recursive: true });
    if (built) {
      mkdirSync(join(versionDir, 'mcp', 'dist'), { recursive: true });
      writeFileSync(join(versionDir, 'mcp', 'dist', 'index.js'), '// server\n');
    }
  }
  return home;
}

describe('resolveSuperpowersChrome', () => {
  it('returns the MCP server path and skills root for an installed, built plugin', () => {
    const home = makeHome([{ version: '2.0.0', built: true }]);
    const result = resolveSuperpowersChrome(home);
    expect(result).toEqual({
      mcpServerPath: join(home, PLUGIN_REL, '2.0.0', 'mcp', 'dist', 'index.js'),
      skillsRoot: join(home, PLUGIN_REL, '2.0.0', 'skills'),
    });
  });

  it('picks the highest semver when multiple versions are installed', () => {
    const home = makeHome([
      { version: '2.0.0', built: true },
      { version: '10.2.1', built: true },
      { version: '2.10.0', built: true },
    ]);
    const result = resolveSuperpowersChrome(home);
    expect(result?.mcpServerPath).toContain(join('superpowers-chrome', '10.2.1', 'mcp'));
  });

  it('returns null when the plugin directory is absent', () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-spchrome-empty-'));
    expect(resolveSuperpowersChrome(home)).toBeNull();
  });

  it('returns null when no child directory is valid semver', () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-spchrome-nosemver-'));
    mkdirSync(join(home, PLUGIN_REL, 'latest'), { recursive: true });
    expect(resolveSuperpowersChrome(home)).toBeNull();
  });

  it('returns null when the highest version has no built mcp/dist/index.js', () => {
    const home = makeHome([{ version: '2.0.0', built: false }]);
    expect(resolveSuperpowersChrome(home)).toBeNull();
  });
});
