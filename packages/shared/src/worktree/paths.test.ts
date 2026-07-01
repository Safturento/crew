import { describe, it, expect } from 'vitest';
import { worktreePathFor } from './paths.js';

describe('worktreePathFor', () => {
  it('places the worktree as a <repo>-<KEY> sibling of the source repo', () => {
    expect(worktreePathFor('/home/me/Repos/crew', 'CREW-307')).toBe('/home/me/Repos/crew-CREW-307');
  });

  it('tolerates a trailing slash on the repo path', () => {
    expect(worktreePathFor('/home/me/Repos/crew/', 'CREW-1')).toBe('/home/me/Repos/crew-CREW-1');
  });
});
