import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Writable } from 'node:stream';
import { streamTranscript } from './stream-transcript.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crew-stream-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface CaptureSink {
  out: Writable;
  lines: string[];
}

function makeSink(): CaptureSink {
  const lines: string[] = [];
  const out = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  return { out, lines };
}

function assistantToolUseEvent(toolName: string, input: Record<string, unknown>): string {
  return `${JSON.stringify({
    type: 'assistant',
    timestamp: '2025-01-01T12:34:56.789Z',
    message: {
      id: `msg-${toolName}`,
      model: 'claude',
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: `tu-${toolName}`,
          name: toolName,
          input,
        },
      ],
      usage: {
        input_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 100,
      },
    },
  })}\n`;
}

describe('streamTranscript', () => {
  it('emits formatted tool-call lines for events appended after the call begins', async () => {
    const transcriptPath = join(dir, 'session.jsonl');
    writeFileSync(transcriptPath, '');
    const abort = new AbortController();
    const { out, lines } = makeSink();

    const promise = streamTranscript({
      transcriptPath,
      signal: abort.signal,
      out,
      pollMs: 20,
    });

    // Append after the call begins.
    await delay(40);
    appendFileSync(transcriptPath, assistantToolUseEvent('Read', { file_path: '/tmp/a.ts' }));
    await delay(60);
    appendFileSync(transcriptPath, assistantToolUseEvent('Bash', { command: 'ls' }));
    await delay(60);

    abort.abort();
    const result = await promise;

    expect(result.transcriptPath).toBe(transcriptPath);
    const joined = lines.join('');
    expect(joined).toMatch(/\[Read\]/);
    expect(joined).toMatch(/\/tmp\/a\.ts/);
    expect(joined).toMatch(/\[Bash\]/);
    expect(joined).toMatch(/ls/);
  });

  it('drains trailing events written just before the abort fires', async () => {
    const transcriptPath = join(dir, 'session.jsonl');
    writeFileSync(transcriptPath, '');
    const abort = new AbortController();
    const { out, lines } = makeSink();

    const promise = streamTranscript({
      transcriptPath,
      signal: abort.signal,
      out,
      pollMs: 20,
    });

    await delay(30);
    appendFileSync(transcriptPath, assistantToolUseEvent('Edit', { file_path: '/tmp/x.ts' }));
    // Abort almost immediately — the read-then-check-abort loop must still
    // emit this event.
    abort.abort();

    const result = await promise;
    expect(result.transcriptPath).toBe(transcriptPath);
    expect(lines.join('')).toMatch(/\[Edit\]/);
  });

  it('terminates after the abort signal fires (does not hang)', async () => {
    const transcriptPath = join(dir, 'session.jsonl');
    writeFileSync(transcriptPath, '');
    const abort = new AbortController();
    const { out } = makeSink();

    const promise = streamTranscript({
      transcriptPath,
      signal: abort.signal,
      out,
      pollMs: 20,
    });

    setTimeout(() => abort.abort(), 60);

    // If the loop didn't honor abort, this would hang forever.
    const result = await promise;
    expect(result.transcriptPath).toBe(transcriptPath);
  });

  it('discovers a transcript when given a projectDir', async () => {
    const projectDir = join(dir, 'project');
    mkdirSync(projectDir);
    const transcriptPath = join(projectDir, 'session.jsonl');
    writeFileSync(transcriptPath, '');
    const abort = new AbortController();
    const { out, lines } = makeSink();

    const promise = streamTranscript({
      projectDir,
      signal: abort.signal,
      out,
      pollMs: 20,
    });

    await delay(40);
    appendFileSync(transcriptPath, assistantToolUseEvent('Read', { file_path: '/tmp/a.ts' }));
    await delay(60);
    abort.abort();

    const result = await promise;
    expect(result.transcriptPath).toBe(transcriptPath);
    expect(lines.join('')).toMatch(/\[Read\]/);
  });

  it('returns a null transcriptPath when discovery aborts before any file appears', async () => {
    const projectDir = join(dir, 'never');
    const abort = new AbortController();
    const { out, lines } = makeSink();

    setTimeout(() => abort.abort(), 60);
    const result = await streamTranscript({
      projectDir,
      signal: abort.signal,
      out,
      pollMs: 20,
    });

    expect(result.transcriptPath).toBeNull();
    expect(lines).toEqual([]);
  });

  it('ignores non-tool-call events (e.g. user messages, last-prompt sentinels)', async () => {
    const transcriptPath = join(dir, 'session.jsonl');
    writeFileSync(transcriptPath, '');
    const abort = new AbortController();
    const { out, lines } = makeSink();

    const promise = streamTranscript({
      transcriptPath,
      signal: abort.signal,
      out,
      pollMs: 20,
    });

    await delay(30);
    appendFileSync(
      transcriptPath,
      `${JSON.stringify({
        type: 'user',
        timestamp: '2025-01-01T12:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      })}\n`,
    );
    appendFileSync(
      transcriptPath,
      `${JSON.stringify({
        type: 'last-prompt',
        lastPrompt: 'whatever',
        sessionId: 'abc',
      })}\n`,
    );
    await delay(60);
    abort.abort();
    await promise;

    expect(lines).toEqual([]);
  });

  it('honours startAtEnd by skipping events already in the file', async () => {
    const transcriptPath = join(dir, 'session.jsonl');
    writeFileSync(transcriptPath, assistantToolUseEvent('Read', { file_path: '/preexisting' }));
    const abort = new AbortController();
    const { out, lines } = makeSink();

    const promise = streamTranscript({
      transcriptPath,
      signal: abort.signal,
      startAtEnd: true,
      out,
      pollMs: 20,
    });

    await delay(40);
    appendFileSync(transcriptPath, assistantToolUseEvent('Bash', { command: 'echo hi' }));
    await delay(60);
    abort.abort();
    await promise;

    const joined = lines.join('');
    expect(joined).not.toMatch(/preexisting/);
    expect(joined).toMatch(/echo hi/);
  });
});
