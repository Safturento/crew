import { describe, it, expect } from 'vitest';
import { claudeProjectDirFor } from './claudeProjectDirFor.js';

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
