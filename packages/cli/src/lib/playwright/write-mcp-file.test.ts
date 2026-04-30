import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeMcpFile } from './write-mcp-file.js';

function makeWorktree(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crew-mcp-test-'));
  mkdirSync(join(dir, '.git', 'info'), { recursive: true });
  return dir;
}

describe('writeMcpFile', () => {
  it('writes .mcp.json with the supplied config', () => {
    const wt = makeWorktree();
    writeMcpFile(wt, { appUrl: 'https://localhost:18443' });
    const written = JSON.parse(readFileSync(join(wt, '.mcp.json'), 'utf8'));
    expect(written.mcpServers.playwright.env.CREW_APP_URL).toBe('https://localhost:18443');
  });

  it('adds .mcp.json to .git/info/exclude', () => {
    const wt = makeWorktree();
    writeMcpFile(wt, { appUrl: 'http://localhost:5173' });
    const exclude = readFileSync(join(wt, '.git', 'info', 'exclude'), 'utf8');
    expect(exclude).toMatch(/^\.mcp\.json$/m);
  });

  it('is idempotent — second call does not duplicate the exclude line', () => {
    const wt = makeWorktree();
    writeMcpFile(wt, { appUrl: 'http://localhost:5173' });
    writeMcpFile(wt, { appUrl: 'http://localhost:5173' });
    const exclude = readFileSync(join(wt, '.git', 'info', 'exclude'), 'utf8');
    const matches = exclude.match(/^\.mcp\.json$/gm) ?? [];
    expect(matches.length).toBe(1);
  });

  it('preserves pre-existing exclude entries', () => {
    const wt = makeWorktree();
    writeFileSync(join(wt, '.git', 'info', 'exclude'), 'something-else.txt\n');
    writeMcpFile(wt, { appUrl: 'http://localhost:5173' });
    const exclude = readFileSync(join(wt, '.git', 'info', 'exclude'), 'utf8');
    expect(exclude).toContain('something-else.txt');
    expect(exclude).toMatch(/^\.mcp\.json$/m);
  });

  it('returns { existed: true } when overwriting a pre-existing .mcp.json', () => {
    const wt = makeWorktree();
    writeFileSync(join(wt, '.mcp.json'), '{"mcpServers":{}}\n');
    const result = writeMcpFile(wt, { appUrl: 'http://localhost:5173' });
    expect(result.existed).toBe(true);
    expect(existsSync(join(wt, '.mcp.json'))).toBe(true);
  });
});
