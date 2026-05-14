import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execaSync } from 'execa';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeMcpFile } from './write-mcp-file.js';

function makeRealRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'crew-mcp-test-repo-'));
  execaSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  execaSync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'],
    {
      cwd: repo,
    },
  );
  return repo;
}

function makeRealWorktree(repo: string): string {
  const wt = mkdtempSync(join(tmpdir(), 'crew-mcp-test-wt-'));
  rmSync(wt, { recursive: true, force: true });
  execaSync('git', ['worktree', 'add', '-q', '--detach', wt], { cwd: repo });
  return wt;
}

// Plant a fake `@playwright/test` package under `dir/node_modules/` whose
// `chromium.executablePath()` returns the supplied path. Used to prove
// resolveChromiumExecutablePath honors the `resolverCwd` we pass in.
function plantFakePlaywrightTest(dir: string, executablePath: string): void {
  const pkgDir = join(dir, 'node_modules', '@playwright', 'test');
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    join(pkgDir, 'package.json'),
    JSON.stringify({ name: '@playwright/test', main: 'index.js' }),
  );
  writeFileSync(
    join(pkgDir, 'index.js'),
    `module.exports = { chromium: { executablePath: () => ${JSON.stringify(executablePath)} } };\n`,
  );
}

function plantFakeChromiumBinary(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crew-mcp-test-fake-chromium-'));
  const path = join(dir, 'chrome');
  writeFileSync(path, '');
  return path;
}

function plantChromeMcp(home: string, version = '2.0.0'): string {
  const root = join(
    home,
    '.claude/plugins/cache/superpowers-marketplace/superpowers-chrome',
    version,
    'mcp/dist',
  );
  mkdirSync(root, { recursive: true });
  const path = join(root, 'index.js');
  writeFileSync(path, '// stub');
  return path;
}

describe('writeMcpFile', () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'crew-mcp-test-home-'));
  });
  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('writes .mcp.json with a playwright server entry when only playwright opts are given', async () => {
    const repo = makeRealRepo();
    await writeMcpFile(repo, {
      playwright: { appUrl: 'https://localhost:18443', resolverCwd: repo },
      home,
    });
    const written = JSON.parse(readFileSync(join(repo, '.mcp.json'), 'utf8'));
    expect(Object.keys(written.mcpServers)).toEqual(['playwright']);
    expect(written.mcpServers.playwright.env.CREW_APP_URL).toBe('https://localhost:18443');
  });

  it('on a real worktree, writes the exclude line to the main repo .git/info/exclude (not under the worktree)', async () => {
    const repo = makeRealRepo();
    const wt = makeRealWorktree(repo);

    await writeMcpFile(wt, {
      playwright: { appUrl: 'http://localhost:5173', resolverCwd: repo },
      home,
    });

    const mainExclude = readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf8');
    expect(mainExclude).toMatch(/^\.mcp\.json$/m);

    const worktreeAdminDir = join(repo, '.git', 'worktrees');
    if (existsSync(worktreeAdminDir)) {
      const worktreeAdminExclude = join(worktreeAdminDir, 'info', 'exclude');
      expect(existsSync(worktreeAdminExclude)).toBe(false);
    }
  });

  it('on a regular checkout, writes to .git/info/exclude in that checkout', async () => {
    const repo = makeRealRepo();
    await writeMcpFile(repo, {
      playwright: { appUrl: 'http://localhost:5173', resolverCwd: repo },
      home,
    });
    const exclude = readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf8');
    expect(exclude).toMatch(/^\.mcp\.json$/m);
  });

  it('is idempotent — second call does not duplicate the exclude line', async () => {
    const repo = makeRealRepo();
    await writeMcpFile(repo, {
      playwright: { appUrl: 'http://localhost:5173', resolverCwd: repo },
      home,
    });
    await writeMcpFile(repo, {
      playwright: { appUrl: 'http://localhost:5173', resolverCwd: repo },
      home,
    });
    const exclude = readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf8');
    const matches = exclude.match(/^\.mcp\.json$/gm) ?? [];
    expect(matches.length).toBe(1);
  });

  it('preserves pre-existing exclude entries', async () => {
    const repo = makeRealRepo();
    writeFileSync(join(repo, '.git', 'info', 'exclude'), 'something-else.txt\n');
    await writeMcpFile(repo, {
      playwright: { appUrl: 'http://localhost:5173', resolverCwd: repo },
      home,
    });
    const exclude = readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf8');
    expect(exclude).toContain('something-else.txt');
    expect(exclude).toMatch(/^\.mcp\.json$/m);
  });

  it('returns { existed: true } when overwriting a pre-existing .mcp.json', async () => {
    const repo = makeRealRepo();
    writeFileSync(join(repo, '.mcp.json'), '{"mcpServers":{}}\n');
    const result = await writeMcpFile(repo, {
      playwright: { appUrl: 'http://localhost:5173', resolverCwd: repo },
      home,
    });
    expect(result.existed).toBe(true);
    expect(existsSync(join(repo, '.mcp.json'))).toBe(true);
  });

  it('resolves the chromium binary against `resolverCwd`, not the worktree', async () => {
    const repo = makeRealRepo();
    const wt = makeRealWorktree(repo);
    const chromiumPath = plantFakeChromiumBinary();
    plantFakePlaywrightTest(repo, chromiumPath);

    const result = await writeMcpFile(wt, {
      playwright: { appUrl: 'http://localhost:5173', resolverCwd: repo },
      home,
    });

    expect(result.chromiumPath).toBe(chromiumPath);
    const written = JSON.parse(readFileSync(join(wt, '.mcp.json'), 'utf8'));
    expect(written.mcpServers.playwright.args).toContain('--executable-path');
    expect(written.mcpServers.playwright.args).toContain(chromiumPath);
  });

  it('returns chromiumPath: null when `resolverCwd` cannot resolve `@playwright/test`', async () => {
    const repo = makeRealRepo();
    const wt = makeRealWorktree(repo);

    const result = await writeMcpFile(wt, {
      playwright: { appUrl: 'http://localhost:5173', resolverCwd: repo },
      home,
    });

    expect(result.chromiumPath).toBeNull();
    const written = JSON.parse(readFileSync(join(wt, '.mcp.json'), 'utf8'));
    expect(written.mcpServers.playwright.args).not.toContain('--executable-path');
  });

  it('writes a both-servers config when chrome resolves successfully', async () => {
    const repo = makeRealRepo();
    const chromePath = plantChromeMcp(home);
    const result = await writeMcpFile(repo, {
      playwright: { appUrl: 'http://localhost:5173', resolverCwd: repo },
      chrome: true,
      home,
    });
    const written = JSON.parse(readFileSync(join(repo, '.mcp.json'), 'utf8'));
    expect(Object.keys(written.mcpServers).sort()).toEqual(['chrome', 'playwright']);
    expect(written.mcpServers.chrome.command).toBe('node');
    expect(written.mcpServers.chrome.args[0]).toBe(chromePath);
    expect(result.chromeMcpPath).toBe(chromePath);
  });

  it('writes playwright-only and warns when chrome is requested but not resolvable', async () => {
    const repo = makeRealRepo();
    const warn = vi.fn();
    const result = await writeMcpFile(repo, {
      playwright: { appUrl: 'http://localhost:5173', resolverCwd: repo },
      chrome: true,
      home,
      warn,
    });
    const written = JSON.parse(readFileSync(join(repo, '.mcp.json'), 'utf8'));
    expect(Object.keys(written.mcpServers)).toEqual(['playwright']);
    expect(result.chromeMcpPath).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('superpowers-chrome plugin not found'),
    );
  });

  it('writes a chrome-only config when only chrome is requested and resolves', async () => {
    const repo = makeRealRepo();
    plantChromeMcp(home);
    await writeMcpFile(repo, { chrome: true, home });
    const written = JSON.parse(readFileSync(join(repo, '.mcp.json'), 'utf8'));
    expect(Object.keys(written.mcpServers)).toEqual(['chrome']);
  });

  it('does not write .mcp.json when only chrome is requested and chrome does not resolve', async () => {
    const repo = makeRealRepo();
    const warn = vi.fn();
    const result = await writeMcpFile(repo, { chrome: true, home, warn });
    expect(existsSync(join(repo, '.mcp.json'))).toBe(false);
    expect(result.chromeMcpPath).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('throws when neither playwright nor chrome is requested', async () => {
    const repo = makeRealRepo();
    await expect(writeMcpFile(repo, { home })).rejects.toThrow(
      /at least one of playwright or chrome/,
    );
  });
});
