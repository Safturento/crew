import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requireWorktreeAvailable } from './preconditions.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crew-preconditions-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('requireWorktreeAvailable', () => {
  it('does not throw when nothing exists at the path', () => {
    expect(() => requireWorktreeAvailable(join(dir, 'never'))).not.toThrow();
  });

  it('throws when the path is already taken', () => {
    const path = join(dir, 'existing');
    mkdirSync(path);
    expect(() => requireWorktreeAvailable(path)).toThrow(/already exists/i);
  });

  it('points users at crew resume and crew restart --hard in the error', () => {
    const path = join(dir, 'existing');
    mkdirSync(path);
    expect(() => requireWorktreeAvailable(path)).toThrow(/crew resume/);
    expect(() => requireWorktreeAvailable(path)).toThrow(/crew restart .*--hard/);
  });
});
