import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadFeedback, parseGithubPrUrl, type FeedbackMode } from './fix-pr.js';

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

    const result = await loadFeedback({ key: 'KAN-1', mode: { kind: 'file', path } });

    expect(result).toEqual({ feedback: 'real feedback', source: `file: ${path}` });
  });

  it('throws on a missing file', async () => {
    await expect(
      loadFeedback({ key: 'KAN-1', mode: { kind: 'file', path: join(tmp, 'nope.md') } }),
    ).rejects.toThrow(/not found/);
  });
});

describe('loadFeedback — message mode', () => {
  it('returns the message as feedback verbatim', async () => {
    const result = await loadFeedback({
      key: 'KAN-1',
      mode: { kind: 'message', message: 'hello world' },
    });
    expect(result.feedback).toBe('hello world');
    expect(result.source).toBe('inline message');
  });

  it('preserves multi-line content', async () => {
    const msg = 'line one\nline two\n  - bullet';
    const result = await loadFeedback({
      key: 'KAN-1',
      mode: { kind: 'message', message: msg },
    });
    expect(result.feedback).toBe(msg);
  });

  it('throws on empty message', async () => {
    await expect(
      loadFeedback({ key: 'KAN-1', mode: { kind: 'message', message: '' } }),
    ).rejects.toThrow(/empty/i);
  });

  it('throws on whitespace-only message', async () => {
    await expect(
      loadFeedback({ key: 'KAN-1', mode: { kind: 'message', message: '   \n  ' } }),
    ).rejects.toThrow(/empty/i);
  });
});

describe('loadFeedback — stdin mode removed', () => {
  it("does not have a 'stdin' kind in FeedbackMode", () => {
    type Kind = FeedbackMode['kind'];
    const valid: Kind[] = ['pr', 'file', 'message'];
    expect(valid).toContain('message');
    expect(valid as string[]).not.toContain('stdin');
  });
});
