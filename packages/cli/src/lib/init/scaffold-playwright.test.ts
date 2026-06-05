import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffoldPlaywright } from './scaffold-playwright.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crew-init-pw-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('scaffoldPlaywright', () => {
  it('writes playwright.config.ts and a tests/e2e skeleton spec', () => {
    const written = scaffoldPlaywright(dir);
    expect(written).toEqual([
      join(dir, 'playwright.config.ts'),
      join(dir, 'tests', 'e2e', 'example.spec.ts'),
    ]);
    for (const p of written) expect(existsSync(p)).toBe(true);
  });

  it('config points testDir at ./tests/e2e and uses @playwright/test', () => {
    const [config] = scaffoldPlaywright(dir);
    const contents = readFileSync(config, 'utf8');
    expect(contents).toContain("from '@playwright/test'");
    expect(contents).toContain("testDir: './tests/e2e'");
    expect(contents).toContain('defineConfig');
  });

  it('skeleton spec navigates and asserts', () => {
    const [, spec] = scaffoldPlaywright(dir);
    const contents = readFileSync(spec, 'utf8');
    expect(contents).toContain("import { test, expect } from '@playwright/test'");
    expect(contents).toContain("page.goto('/')");
  });

  it('creates the nested tests/e2e dir when absent', () => {
    scaffoldPlaywright(dir);
    expect(existsSync(join(dir, 'tests', 'e2e'))).toBe(true);
  });
});
