import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasBinary, preflightTools } from './preflight.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crew-preflight-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function makeExecutable(parent: string, name: string): void {
  mkdirSync(parent, { recursive: true });
  const path = join(parent, name);
  writeFileSync(path, '#!/usr/bin/env bash\n');
  chmodSync(path, 0o755);
}

describe('hasBinary', () => {
  it('returns true when an executable file with the name lives in one of the PATH entries', () => {
    makeExecutable(join(dir, 'a'), 'claude');
    const path = `${join(dir, 'b')}:${join(dir, 'a')}`;

    expect(hasBinary('claude', path)).toBe(true);
  });

  it('returns false when the binary is missing in every PATH entry', () => {
    expect(hasBinary('nope', `${dir}:${join(dir, 'sub')}`)).toBe(false);
  });

  it('skips empty path segments without throwing', () => {
    expect(hasBinary('nope', '::')).toBe(false);
  });

  it('treats files without the executable bit as missing', () => {
    const parent = join(dir, 'a');
    mkdirSync(parent, { recursive: true });
    writeFileSync(join(parent, 'gh'), '');

    expect(hasBinary('gh', parent)).toBe(false);
  });

  it('follows symlinks to a real executable', () => {
    const parent = join(dir, 'a');
    makeExecutable(parent, 'claude-real');
    const linkParent = join(dir, 'b');
    mkdirSync(linkParent, { recursive: true });
    symlinkSync(join(parent, 'claude-real'), join(linkParent, 'claude'));

    expect(hasBinary('claude', linkParent)).toBe(true);
  });
});

describe('preflightTools', () => {
  it('returns an empty list when every tool is on PATH', () => {
    const parent = join(dir, 'bin');
    makeExecutable(parent, 'claude');
    makeExecutable(parent, 'gh');
    makeExecutable(parent, 'jq');

    expect(preflightTools(['claude', 'gh', 'jq'], parent)).toEqual([]);
  });

  it('returns the names of binaries that are missing, preserving input order', () => {
    const parent = join(dir, 'bin');
    makeExecutable(parent, 'claude');
    makeExecutable(parent, 'jq');

    expect(preflightTools(['claude', 'gh', 'jq', 'bwrap'], parent)).toEqual(['gh', 'bwrap']);
  });
});
