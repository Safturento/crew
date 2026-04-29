import { describe, it, expect } from 'vitest';
import { worktreePathFor, runLogPathFor, dockerLogPathFor } from './paths.js';

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
