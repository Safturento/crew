import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveChromeMcpPath } from './resolve-chrome-mcp-path.js';

describe('resolveChromeMcpPath', () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'crew-chrome-resolve-'));
  });
  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('returns null when the plugin cache directory does not exist', () => {
    expect(resolveChromeMcpPath(home)).toBeNull();
  });

  it('returns null when the superpowers-chrome dir is empty', () => {
    mkdirSync(join(home, '.claude/plugins/cache/superpowers-marketplace/superpowers-chrome'), {
      recursive: true,
    });
    expect(resolveChromeMcpPath(home)).toBeNull();
  });

  it('returns null when no version subdir has mcp/dist/index.js', () => {
    const root = join(home, '.claude/plugins/cache/superpowers-marketplace/superpowers-chrome');
    mkdirSync(join(root, '2.0.0'), { recursive: true });
    expect(resolveChromeMcpPath(home)).toBeNull();
  });

  it('returns the dist path when one version exists', () => {
    const root = join(home, '.claude/plugins/cache/superpowers-marketplace/superpowers-chrome');
    mkdirSync(join(root, '2.0.0/mcp/dist'), { recursive: true });
    const distFile = join(root, '2.0.0/mcp/dist/index.js');
    writeFileSync(distFile, '// stub');
    expect(resolveChromeMcpPath(home)).toBe(distFile);
  });

  it('picks the highest semver when multiple versions are present', () => {
    const root = join(home, '.claude/plugins/cache/superpowers-marketplace/superpowers-chrome');
    for (const v of ['1.9.0', '2.0.0', '2.1.0', '2.0.5']) {
      mkdirSync(join(root, `${v}/mcp/dist`), { recursive: true });
      writeFileSync(join(root, `${v}/mcp/dist/index.js`), '// stub');
    }
    expect(resolveChromeMcpPath(home)).toBe(join(root, '2.1.0/mcp/dist/index.js'));
  });

  it('ignores non-semver directory names', () => {
    const root = join(home, '.claude/plugins/cache/superpowers-marketplace/superpowers-chrome');
    mkdirSync(join(root, 'next/mcp/dist'), { recursive: true });
    writeFileSync(join(root, 'next/mcp/dist/index.js'), '// stub');
    mkdirSync(join(root, '1.0.0/mcp/dist'), { recursive: true });
    writeFileSync(join(root, '1.0.0/mcp/dist/index.js'), '// stub');
    expect(resolveChromeMcpPath(home)).toBe(join(root, '1.0.0/mcp/dist/index.js'));
  });

  it('skips a semver dir whose dist/index.js is missing and falls back to the next-highest', () => {
    const root = join(home, '.claude/plugins/cache/superpowers-marketplace/superpowers-chrome');
    mkdirSync(join(root, '2.0.0/mcp/dist'), { recursive: true });
    mkdirSync(join(root, '1.9.0/mcp/dist'), { recursive: true });
    writeFileSync(join(root, '1.9.0/mcp/dist/index.js'), '// stub');
    expect(resolveChromeMcpPath(home)).toBe(join(root, '1.9.0/mcp/dist/index.js'));
  });
});
