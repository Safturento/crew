import { describe, it, expect } from 'vitest';
import { worktreePathFor, claudeProjectDirFor, runLogPathFor, dockerLogPathFor } from './paths.js';

describe('worktreePathFor', () => {
  it('places the worktree as a sibling of the source repo, suffixed with the key', () => {
    expect(worktreePathFor('/home/me/Repos/Recipes-App', 'KAN-23')).toBe(
      '/home/me/Repos/Recipes-App-KAN-23',
    );
  });

  it('strips a trailing slash from the repo path before suffixing', () => {
    expect(worktreePathFor('/home/me/Repos/Recipes-App/', 'KAN-23')).toBe(
      '/home/me/Repos/Recipes-App-KAN-23',
    );
  });
});

describe('claudeProjectDirFor', () => {
  it('encodes the absolute worktree path the way claude does (slashes → dashes, leading slash → dash)', () => {
    expect(claudeProjectDirFor('/home/me/Repos/Recipes-App-KAN-23', '/home/me')).toBe(
      '/home/me/.claude/projects/-home-me-Repos-Recipes-App-KAN-23',
    );
  });

  it('honors the supplied homedir override', () => {
    expect(claudeProjectDirFor('/x/y', '/var/u')).toBe('/var/u/.claude/projects/-x-y');
  });
});

describe('runLogPathFor', () => {
  it('lives in /tmp and is keyed by ticket', () => {
    expect(runLogPathFor('KAN-23')).toBe('/tmp/crew-run-KAN-23.log');
  });
});

describe('dockerLogPathFor', () => {
  it('lives in /tmp and is keyed by ticket', () => {
    expect(dockerLogPathFor('KAN-23')).toBe('/tmp/crew-docker-KAN-23.log');
  });
});
