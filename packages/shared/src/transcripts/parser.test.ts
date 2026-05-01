import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import {
  parseTranscript,
  parseToolCall,
  aggregateUsage,
  formatToolCall,
  parseAssistantText,
  formatAssistantText,
} from './index.js';
import type { TranscriptEvent } from './index.js';

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

function assistantTextEvent(text: string, timestamp = '2026-05-01T21:50:10.123Z'): TranscriptEvent {
  return {
    type: 'assistant',
    timestamp,
    message: {
      id: 'msg-text',
      model: 'claude-opus-4-7',
      role: 'assistant',
      content: [{ type: 'text', text }],
      usage: {
        input_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 50,
      },
    },
  };
}

describe('parseAssistantText', () => {
  it('extracts the first text block from an assistant event', () => {
    const result = parseAssistantText(assistantTextEvent('Hello world'));
    expect(result).not.toBeNull();
    expect(result?.text).toBe('Hello world');
    expect(result?.timestamp).toBe('2026-05-01T21:50:10.123Z');
  });

  it('returns null when the assistant event has no text block', () => {
    const event: TranscriptEvent = {
      type: 'assistant',
      timestamp: '2026-05-01T21:50:10.123Z',
      message: {
        id: 'msg',
        model: 'claude',
        role: 'assistant',
        content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/x' } }],
        usage: {
          input_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          output_tokens: 1,
        },
      },
    };
    expect(parseAssistantText(event)).toBeNull();
  });

  it('returns null for non-assistant events', () => {
    const events = parseTranscript(readFileSync(FIXTURE, 'utf8'));
    expect(parseAssistantText(events[1]!)).toBeNull();
    expect(parseAssistantText(events[2]!)).toBeNull();
  });

  it('returns null for empty/whitespace-only text', () => {
    expect(parseAssistantText(assistantTextEvent(''))).toBeNull();
    expect(parseAssistantText(assistantTextEvent('   \n  '))).toBeNull();
  });
});

describe('formatAssistantText', () => {
  it('emits HH:MM:SS · text with a single-line snippet', () => {
    const line = formatAssistantText({
      text: 'Hello',
      timestamp: '2026-05-01T21:50:10.123Z',
    });
    expect(line).toBe('21:50:10  · Hello');
  });

  it('collapses multi-paragraph text to one line and truncates to ~120 chars', () => {
    const text =
      '## Summary\n\n**Code state.** The KAN-40 implementation was already on the branch from a previous run, ' +
      'and the ticket has additional context about the stream tail behaviour that drives this change.';
    const line = formatAssistantText({ text, timestamp: '2026-05-01T21:50:10.123Z' });
    expect(line).not.toMatch(/\n/);
    expect(line).toContain('⏎');
    expect(line).toContain('## Summary');
    expect(line.length).toBeLessThanOrEqual(140);
    expect(line.endsWith('…')).toBe(true);
  });

  it('does not truncate or append ellipsis for short text', () => {
    const line = formatAssistantText({
      text: 'short message',
      timestamp: '2026-05-01T21:50:10.123Z',
    });
    expect(line).toBe('21:50:10  · short message');
  });
});
