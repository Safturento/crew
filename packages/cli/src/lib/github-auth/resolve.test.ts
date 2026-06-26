import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  hasRepoToken,
  userMcpHasGithubServer,
  resolveGithubAuth,
  requireGithubAuth,
} from './resolve.js';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'gh-auth-'));
}

/** Write a fake home dir with a ~/.claude.json containing `mcpServers`. */
function homeWithMcp(servers: Record<string, unknown>): string {
  const home = tmp();
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ mcpServers: servers }));
  return home;
}

describe('hasRepoToken', () => {
  it('false when the file is missing', () => {
    expect(hasRepoToken(join(tmp(), 'gh-token'))).toBe(false);
  });
  it('false when the file is empty', () => {
    const p = join(tmp(), 'gh-token');
    writeFileSync(p, '');
    expect(hasRepoToken(p)).toBe(false);
  });
  it('true when the file is non-empty', () => {
    const p = join(tmp(), 'gh-token');
    writeFileSync(p, 'github_pat_x');
    expect(hasRepoToken(p)).toBe(true);
  });
});

describe('userMcpHasGithubServer', () => {
  it('false when ~/.claude.json is absent', () => {
    expect(userMcpHasGithubServer(tmp())).toBe(false);
  });
  it('false when the file is malformed', () => {
    const home = tmp();
    writeFileSync(join(home, '.claude.json'), '{not json');
    expect(userMcpHasGithubServer(home)).toBe(false);
  });
  it('false when no github server is present', () => {
    expect(userMcpHasGithubServer(homeWithMcp({ playwright: { command: 'npx' } }))).toBe(false);
  });
  it('true when a server is keyed "github"', () => {
    expect(userMcpHasGithubServer(homeWithMcp({ github: { command: 'docker' } }))).toBe(true);
  });
  it('true when a server URL targets githubcopilot.com', () => {
    expect(
      userMcpHasGithubServer(homeWithMcp({ gh: { url: 'https://api.githubcopilot.com/mcp/' } })),
    ).toBe(true);
  });
});

describe('resolveGithubAuth / requireGithubAuth', () => {
  it('ok via token only', () => {
    const p = join(tmp(), 'gh-token');
    writeFileSync(p, 'tok');
    const r = resolveGithubAuth({ tokenPath: p, homeDir: tmp() });
    expect(r).toEqual({ hasToken: true, hasMcp: false, ok: true });
    expect(() => requireGithubAuth({ tokenPath: p, homeDir: tmp() })).not.toThrow();
  });
  it('ok via MCP only', () => {
    const home = homeWithMcp({ github: { command: 'docker' } });
    const r = resolveGithubAuth({ tokenPath: join(tmp(), 'gh-token'), homeDir: home });
    expect(r).toEqual({ hasToken: false, hasMcp: true, ok: true });
  });
  it('throws when neither channel is present', () => {
    expect(() =>
      requireGithubAuth({ tokenPath: join(tmp(), 'gh-token'), homeDir: tmp() }),
    ).toThrow(/no GitHub credential/i);
  });
});
