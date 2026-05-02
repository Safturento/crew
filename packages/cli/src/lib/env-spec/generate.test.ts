import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGenerator, runFileGenerator } from './generate.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crew-gen-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('runGenerator', () => {
  it('returns trimmed stdout from a shell command', () => {
    expect(runGenerator('echo hello')).toBe('hello');
  });

  it('throws with command + stderr context on non-zero exit', () => {
    expect(() => runGenerator('false')).toThrow(/exit/i);
  });
});

describe('runFileGenerator', () => {
  it('runs the generator and creates the file when path is missing', () => {
    const target = join(dir, 'made.txt');
    runFileGenerator({
      path: target,
      generator: `echo created > "\${path}"`,
      pathSubstitution: target,
    });
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, 'utf8').trim()).toBe('created');
  });

  it('does NOT re-run the generator when the file already exists', () => {
    const target = join(dir, 'cached.txt');
    writeFileSync(target, 'pre-existing\n');
    runFileGenerator({
      path: target,
      generator: `echo overwrite > "\${path}"`,
      pathSubstitution: target,
    });
    expect(readFileSync(target, 'utf8').trim()).toBe('pre-existing');
  });

  it('substitutes ${path} into the generator command', () => {
    const target = join(dir, 'substituted.txt');
    runFileGenerator({
      path: target,
      generator: 'printf "%s" "${path}" > "${path}"',
      pathSubstitution: target,
    });
    expect(readFileSync(target, 'utf8')).toBe(target);
  });
});
