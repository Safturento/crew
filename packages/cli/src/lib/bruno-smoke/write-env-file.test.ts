import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeEnvFile } from './write-env-file.js';

function makeWorktree(): string {
  return mkdtempSync(join(tmpdir(), 'crew-bruno-test-'));
}

describe('writeEnvFile', () => {
  it('writes <worktree>/<collection_dir>/environments/<envName>.bru with the env file content', () => {
    const wt = makeWorktree();
    mkdirSync(join(wt, 'bruno'), { recursive: true });
    const result = writeEnvFile(wt, {
      collectionDir: 'bruno',
      envName: 'recipes-app-kan-99',
      baseUrl: 'https://localhost:18443',
    });
    expect(result.envFilePath).toBe(join(wt, 'bruno', 'environments', 'recipes-app-kan-99.bru'));
    expect(existsSync(result.envFilePath)).toBe(true);
    const content = readFileSync(result.envFilePath, 'utf8');
    expect(content).toContain('baseUrl: https://localhost:18443');
  });

  it('includes testUser fields when smokeUser is provided', () => {
    const wt = makeWorktree();
    mkdirSync(join(wt, 'bruno'), { recursive: true });
    writeEnvFile(wt, {
      collectionDir: 'bruno',
      envName: 'recipes-app',
      baseUrl: 'http://localhost:3000',
      smokeUser: { email: 'a@b.c', username: 'a', password: 'p' },
    });
    const content = readFileSync(join(wt, 'bruno', 'environments', 'recipes-app.bru'), 'utf8');
    expect(content).toContain('testUser.email: a@b.c');
    expect(content).toContain('testUser.username: a');
    expect(content).toContain('testUser.password: p');
  });

  it('creates the environments/ directory if it does not exist', () => {
    const wt = makeWorktree();
    mkdirSync(join(wt, 'bruno'), { recursive: true });
    expect(existsSync(join(wt, 'bruno', 'environments'))).toBe(false);
    writeEnvFile(wt, {
      collectionDir: 'bruno',
      envName: 'main',
      baseUrl: 'http://localhost:3000',
    });
    expect(existsSync(join(wt, 'bruno', 'environments'))).toBe(true);
  });

  it('returns { existed: true } when overwriting a pre-existing env file', () => {
    const wt = makeWorktree();
    mkdirSync(join(wt, 'bruno', 'environments'), { recursive: true });
    writeFileSync(join(wt, 'bruno', 'environments', 'main.bru'), 'old\n');
    const result = writeEnvFile(wt, {
      collectionDir: 'bruno',
      envName: 'main',
      baseUrl: 'http://localhost:3000',
    });
    expect(result.existed).toBe(true);
    const content = readFileSync(result.envFilePath, 'utf8');
    expect(content).not.toBe('old\n');
  });

  it('throws when <worktree>/<collection_dir>/ does not exist', () => {
    const wt = makeWorktree();
    expect(() =>
      writeEnvFile(wt, {
        collectionDir: 'bruno',
        envName: 'main',
        baseUrl: 'http://localhost:3000',
      }),
    ).toThrow(/collection.*not found|bruno/i);
  });

  it('honours a custom collection_dir', () => {
    const wt = makeWorktree();
    mkdirSync(join(wt, 'api-tests'), { recursive: true });
    const result = writeEnvFile(wt, {
      collectionDir: 'api-tests',
      envName: 'main',
      baseUrl: 'http://localhost:3000',
    });
    expect(result.envFilePath).toBe(join(wt, 'api-tests', 'environments', 'main.bru'));
    expect(existsSync(result.envFilePath)).toBe(true);
  });
});
