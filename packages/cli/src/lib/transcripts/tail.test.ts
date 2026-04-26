import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { tailTranscript } from './tail.js';
import type { TranscriptEvent } from './types.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crew-tail-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function assistantEvent(seq: number): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: '2026-04-26T17:47:39.520Z',
    message: {
      id: `msg-${seq}`,
      model: 'claude-sonnet-4-6',
      role: 'assistant',
      content: [
        { type: 'tool_use', id: `t-${seq}`, name: 'Read', input: { file_path: `/x/${seq}` } },
      ],
      usage: {
        input_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 1,
      },
    },
  });
}

async function collect(
  iter: AsyncIterable<TranscriptEvent>,
  count: number,
  abort: AbortController,
  timeoutMs = 1500,
): Promise<TranscriptEvent[]> {
  const out: TranscriptEvent[] = [];
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    for await (const ev of iter) {
      out.push(ev);
      if (out.length >= count) {
        abort.abort();
        break;
      }
    }
  } finally {
    clearTimeout(timer);
  }
  return out;
}

describe('tailTranscript', () => {
  it('emits events that are already in the file when tailing starts', async () => {
    const path = join(dir, 't.jsonl');
    writeFileSync(path, assistantEvent(1) + '\n' + assistantEvent(2) + '\n');

    const abort = new AbortController();
    const events = await collect(
      tailTranscript(path, { signal: abort.signal, pollMs: 20 }),
      2,
      abort,
    );

    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe('assistant');
  });

  it('emits events that are appended after tailing starts', async () => {
    const path = join(dir, 't.jsonl');
    writeFileSync(path, '');

    const abort = new AbortController();
    const collector = collect(tailTranscript(path, { signal: abort.signal, pollMs: 20 }), 2, abort);

    await delay(50);
    appendFileSync(path, assistantEvent(1) + '\n');
    await delay(50);
    appendFileSync(path, assistantEvent(2) + '\n');

    const events = await collector;
    expect(events).toHaveLength(2);
  });

  it('waits for the file to be created before emitting', async () => {
    const path = join(dir, 'late.jsonl');

    const abort = new AbortController();
    const collector = collect(tailTranscript(path, { signal: abort.signal, pollMs: 20 }), 1, abort);

    await delay(60);
    writeFileSync(path, assistantEvent(1) + '\n');

    const events = await collector;
    expect(events).toHaveLength(1);
  });

  it('skips malformed JSON lines without stopping', async () => {
    const path = join(dir, 't.jsonl');
    writeFileSync(path, '{ not json\n' + assistantEvent(1) + '\n');

    const abort = new AbortController();
    const events = await collect(
      tailTranscript(path, { signal: abort.signal, pollMs: 20 }),
      1,
      abort,
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('assistant');
  });

  it('stops promptly when the AbortSignal fires', async () => {
    const path = join(dir, 't.jsonl');
    writeFileSync(path, '');

    const abort = new AbortController();
    abort.abort();

    const events: TranscriptEvent[] = [];
    for await (const ev of tailTranscript(path, { signal: abort.signal, pollMs: 20 })) {
      events.push(ev);
    }
    expect(events).toEqual([]);
  });
});
