import { describe, it, expect } from 'vitest';
import { resolveBrunoEnvName } from './resolve-env-name.js';

describe('resolveBrunoEnvName', () => {
  it('lowercases the worktree basename', () => {
    expect(resolveBrunoEnvName('/home/me/Repos/Recipes-App-KAN-99')).toBe('recipes-app-kan-99');
  });

  it('handles the canonical worktree name', () => {
    expect(resolveBrunoEnvName('/home/me/Repos/Recipes-App')).toBe('recipes-app');
  });

  it('strips trailing slashes', () => {
    expect(resolveBrunoEnvName('/home/me/Repos/Recipes-App-KAN-99/')).toBe('recipes-app-kan-99');
  });

  it('handles a single-segment path', () => {
    expect(resolveBrunoEnvName('Recipes')).toBe('recipes');
  });
});
