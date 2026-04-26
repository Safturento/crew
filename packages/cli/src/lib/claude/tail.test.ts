import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tailTranscript } from './tail.js';

describe('tailTranscript', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'crew-tail-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('only emits lines appended after start (skips pre-existing content)', async () => {
    const file = join(tmp, 't.jsonl');
    writeFileSync(file, 'old1\nold2\n');

    const lines: string[] = [];
    let resolveDone: () => void = () => {};
    const done = new Promise<void>((r) => (resolveDone = r));

    const tailPromise = tailTranscript({
      transcriptPath: file,
      until: done,
      onLine: (l) => lines.push(l),
      pollMs: 25,
    });

    await new Promise((r) => setTimeout(r, 50));
    appendFileSync(file, 'new1\nnew2\n');
    await new Promise((r) => setTimeout(r, 100));
    resolveDone();
    await tailPromise;

    expect(lines).toEqual(['new1', 'new2']);
  });

  it('handles partial lines split across reads', async () => {
    const file = join(tmp, 't.jsonl');
    writeFileSync(file, '');

    const lines: string[] = [];
    let resolveDone: () => void = () => {};
    const done = new Promise<void>((r) => (resolveDone = r));

    const tailPromise = tailTranscript({
      transcriptPath: file,
      until: done,
      onLine: (l) => lines.push(l),
      pollMs: 25,
    });

    await new Promise((r) => setTimeout(r, 30));
    appendFileSync(file, 'first half ');
    await new Promise((r) => setTimeout(r, 60));
    appendFileSync(file, 'second half\n');
    await new Promise((r) => setTimeout(r, 80));
    resolveDone();
    await tailPromise;

    expect(lines).toEqual(['first half second half']);
  });

  it('flushes any remaining content after until resolves', async () => {
    const file = join(tmp, 't.jsonl');
    writeFileSync(file, '');

    const lines: string[] = [];
    let resolveDone: () => void = () => {};
    const done = new Promise<void>((r) => (resolveDone = r));

    const tailPromise = tailTranscript({
      transcriptPath: file,
      until: done,
      onLine: (l) => lines.push(l),
      pollMs: 100,
    });

    await new Promise((r) => setTimeout(r, 30));
    appendFileSync(file, 'flushed\n');
    resolveDone();
    await tailPromise;

    expect(lines).toEqual(['flushed']);
  });

  it('survives the file not existing at start (waits for it to appear)', async () => {
    const file = join(tmp, 'late.jsonl');

    const lines: string[] = [];
    let resolveDone: () => void = () => {};
    const done = new Promise<void>((r) => (resolveDone = r));

    const tailPromise = tailTranscript({
      transcriptPath: file,
      until: done,
      onLine: (l) => lines.push(l),
      pollMs: 25,
    });

    await new Promise((r) => setTimeout(r, 50));
    writeFileSync(file, 'late line\n');
    await new Promise((r) => setTimeout(r, 80));
    resolveDone();
    await tailPromise;

    expect(lines).toEqual(['late line']);
  });
});
