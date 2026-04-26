import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requireGhToken, requireWorktreeAvailable } from './preconditions.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crew-preconditions-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('requireGhToken', () => {
  it('does not throw when the file exists and is non-empty', () => {
    const path = join(dir, 'gh-token');
    writeFileSync(path, 'github_pat_123');
    expect(() => requireGhToken(path)).not.toThrow();
  });

  it('throws a useful error when the file is missing', () => {
    expect(() => requireGhToken(join(dir, 'missing'))).toThrow(/missing or empty/i);
  });

  it('throws when the file exists but is empty', () => {
    const path = join(dir, 'gh-token');
    writeFileSync(path, '');
    expect(() => requireGhToken(path)).toThrow(/missing or empty/i);
  });
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
});
