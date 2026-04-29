import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parseTranscript, parseToolCall, aggregateUsage, formatToolCall } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '../../test/fixtures/transcript-sample.jsonl');

describe('parseTranscript', () => {
  it('parses a JSONL transcript into typed events', () => {
    const raw = readFileSync(FIXTURE, 'utf8');
    const events = parseTranscript(raw);

    expect(events).toHaveLength(3);
    expect(events[0]?.type).toBe('assistant');
    expect(events[1]?.type).toBe('user');
    expect(events[2]?.type).toBe('last-prompt');
  });

  it('skips blank lines', () => {
    const events = parseTranscript('\n\n');
    expect(events).toHaveLength(0);
  });

  it('skips lines that fail to parse as JSON', () => {
    const events = parseTranscript(
      '{"type":"assistant","timestamp":"x","message":{"id":"a","model":"m","role":"assistant","content":[],"usage":{"input_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":0}}}\n{not json}\n',
    );
    expect(events).toHaveLength(1);
  });
});

describe('parseToolCall', () => {
  it('extracts the tool_use from an assistant event', () => {
    const raw = readFileSync(FIXTURE, 'utf8');
    const [first] = parseTranscript(raw);
    const call = parseToolCall(first!);

    expect(call).not.toBeNull();
    expect(call?.name).toBe('Read');
    expect(call?.input).toEqual({ file_path: '/home/x/repo/foo.ts' });
    expect(call?.outputTokens).toBe(42);
    expect(call?.timestamp).toBe('2026-04-26T17:47:39.520Z');
  });

  it('returns null for non-assistant events', () => {
    const raw = readFileSync(FIXTURE, 'utf8');
    const events = parseTranscript(raw);
    expect(parseToolCall(events[1]!)).toBeNull();
    expect(parseToolCall(events[2]!)).toBeNull();
  });
});

describe('aggregateUsage', () => {
  it('sums output_tokens across assistant events', () => {
    const raw = readFileSync(FIXTURE, 'utf8');
    const events = parseTranscript(raw);
    const usage = aggregateUsage(events);

    expect(usage.outputTokens).toBe(42);
    expect(usage.cacheReadTokens).toBe(1000);
  });
});

describe('formatToolCall', () => {
  it('renders Read calls with the file path', () => {
    const call = parseToolCall(parseTranscript(readFileSync(FIXTURE, 'utf8'))[0]!);
    expect(formatToolCall(call!)).toContain('Read');
    expect(formatToolCall(call!)).toContain('/home/x/repo/foo.ts');
  });
});
