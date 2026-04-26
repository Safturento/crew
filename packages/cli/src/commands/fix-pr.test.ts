import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { loadFeedback, parseGithubPrUrl } from './fix-pr.js';

describe('parseGithubPrUrl', () => {
  it('splits owner and repo from a github pr url', () => {
    expect(parseGithubPrUrl('https://github.com/Safturento/crew/pull/12')).toEqual({
      owner: 'Safturento',
      repo: 'crew',
    });
  });

  it('returns null on non-github urls', () => {
    expect(parseGithubPrUrl('https://example.com/x/y/pull/1')).toBeNull();
  });

  it('returns null on ssh-style urls', () => {
    expect(parseGithubPrUrl('git@github.com:Safturento/crew.git')).toBeNull();
  });

  it('keeps the literal repo segment, including any trailing .git', () => {
    expect(parseGithubPrUrl('https://github.com/Safturento/crew.git/pull/1')).toEqual({
      owner: 'Safturento',
      repo: 'crew.git',
    });
  });
});

describe('loadFeedback (file mode)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'crew-fb-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('reads the file contents and reports the source', async () => {
    const path = join(tmp, 'fb.md');
    writeFileSync(path, 'real feedback');

    const result = await loadFeedback(
      { key: 'KAN-1', mode: { kind: 'file', path } },
      { stdin: Readable.from(['ignored']) },
    );

    expect(result).toEqual({ feedback: 'real feedback', source: `file: ${path}` });
  });

  it('throws on a missing file', async () => {
    await expect(
      loadFeedback(
        { key: 'KAN-1', mode: { kind: 'file', path: join(tmp, 'nope.md') } },
        { stdin: Readable.from(['']) },
      ),
    ).rejects.toThrow(/not found/);
  });
});

describe('loadFeedback (stdin mode)', () => {
  it('reads piped stdin and reports the source', async () => {
    const result = await loadFeedback(
      { key: 'KAN-1', mode: { kind: 'stdin' } },
      { stdin: Readable.from(['piped\nfeedback\n']) },
    );

    expect(result).toEqual({ feedback: 'piped\nfeedback\n', source: 'stdin' });
  });

  it('throws on empty stdin', async () => {
    await expect(
      loadFeedback({ key: 'KAN-1', mode: { kind: 'stdin' } }, { stdin: Readable.from(['']) }),
    ).rejects.toThrow(/empty/);
  });
});
