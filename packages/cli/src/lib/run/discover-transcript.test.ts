import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { findNewestTranscript } from './discover-transcript.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crew-discover-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('findNewestTranscript', () => {
  it('returns the newest .jsonl in the directory', async () => {
    writeFileSync(join(dir, 'a.jsonl'), '{}');
    const olderTime = new Date(Date.now() - 60_000);
    utimesSync(join(dir, 'a.jsonl'), olderTime, olderTime);
    writeFileSync(join(dir, 'b.jsonl'), '{}');

    const abort = new AbortController();
    const result = await findNewestTranscript(dir, { signal: abort.signal, pollMs: 20 });

    expect(result).toBe(join(dir, 'b.jsonl'));
  });

  it('waits for the directory to be created', async () => {
    const projectDir = join(dir, 'late');
    const abort = new AbortController();
    const promise = findNewestTranscript(projectDir, { signal: abort.signal, pollMs: 20 });

    await delay(60);
    mkdirSync(projectDir);
    writeFileSync(join(projectDir, 'session.jsonl'), '{}');

    const result = await promise;
    expect(result).toBe(join(projectDir, 'session.jsonl'));
  });

  it('returns null when aborted before any transcript appears', async () => {
    const abort = new AbortController();
    setTimeout(() => abort.abort(), 50);

    const result = await findNewestTranscript(join(dir, 'never'), {
      signal: abort.signal,
      pollMs: 20,
    });
    expect(result).toBeNull();
  });

  it('ignores non-.jsonl files', async () => {
    writeFileSync(join(dir, 'note.txt'), 'x');

    const abort = new AbortController();
    setTimeout(() => abort.abort(), 80);

    const result = await findNewestTranscript(dir, { signal: abort.signal, pollMs: 20 });
    expect(result).toBeNull();
  });
});
