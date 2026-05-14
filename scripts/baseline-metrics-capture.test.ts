import { describe, it, expect } from 'vitest';
import { aggregateTokenStats, type TranscriptEvent } from './baseline-metrics-capture.js';

const FIXTURE_EVENTS: TranscriptEvent[] = [
  // Turn 1: assistant calls one Bash
  {
    type: 'assistant',
    message: {
      content: [{ type: 'tool_use', id: 'tu_001', name: 'Bash', input: { command: 'echo hi' } }],
      usage: {
        input_tokens: 0,
        cache_read_input_tokens: 100,
        cache_creation_input_tokens: 50,
        output_tokens: 200,
      },
    },
  },
  // tool_result for tu_001 — 6 chars → 1 token under chars/4
  {
    type: 'user',
    message: {
      content: [{ type: 'tool_result', tool_use_id: 'tu_001', content: 'hello\n' }],
    },
  },
  // Turn 2: assistant calls Read AND Bash
  {
    type: 'assistant',
    message: {
      content: [
        { type: 'tool_use', id: 'tu_002', name: 'Read', input: { file_path: '/foo' } },
        { type: 'tool_use', id: 'tu_003', name: 'Bash', input: { command: 'ls' } },
      ],
      usage: {
        input_tokens: 10,
        cache_read_input_tokens: 150,
        cache_creation_input_tokens: 0,
        output_tokens: 300,
      },
    },
  },
  // tool_results for tu_002 (900 chars → 225 tokens) and tu_003 (8 chars → 2 tokens)
  {
    type: 'user',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: 'tu_002', content: 'long file content '.repeat(50) },
        { type: 'tool_result', tool_use_id: 'tu_003', content: 'foo\nbar\n' },
      ],
    },
  },
  // Turn 3: assistant text only, no tool_use
  {
    type: 'assistant',
    message: {
      content: [],
      usage: {
        input_tokens: 5,
        cache_read_input_tokens: 200,
        cache_creation_input_tokens: 0,
        output_tokens: 400,
      },
    },
  },
];

describe('aggregateTokenStats', () => {
  it('sums output_tokens across all turns', () => {
    const stats = aggregateTokenStats(FIXTURE_EVENTS);
    expect(stats.output.total).toBe(900); // 200 + 300 + 400
  });
});
