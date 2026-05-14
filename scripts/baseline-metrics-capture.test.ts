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

  it('computes output mean and max per turn', () => {
    const stats = aggregateTokenStats(FIXTURE_EVENTS);
    expect(stats.output.maxPerTurn).toBe(400);
    expect(stats.output.meanPerTurn).toBe(300); // floor(900 / 3)
  });

  it('counts turns (usage events) and tool_use calls', () => {
    const stats = aggregateTokenStats(FIXTURE_EVENTS);
    expect(stats.turnCount).toBe(3);
    expect(stats.toolCallCount).toBe(3); // 1 + 2 + 0
  });

  it('captures the last turn snapshot as prClaim (backward-compat with lastPrClaimTokens)', () => {
    const stats = aggregateTokenStats(FIXTURE_EVENTS);
    expect(stats.prClaim).toEqual({
      total: 205, // 5 + 200 + 0
      uncached: 5,
      cacheRead: 200,
      cacheCreate: 0,
    });
  });

  it('attributes tool_result size to the originating tool via tool_use_id (chars/4 heuristic)', () => {
    const stats = aggregateTokenStats(FIXTURE_EVENTS);
    // Bash: tu_001 result 'hello\n' = 6 chars → floor(6/4) = 1
    //       tu_003 result 'foo\nbar\n' = 8 chars → floor(8/4) = 2
    expect(stats.toolBreakdown.Bash).toEqual({ calls: 2, result_tokens_est: 3 });
    // Read: tu_002 result is 'long file content '.repeat(50) = 900 chars → 225
    expect(stats.toolBreakdown.Read).toEqual({ calls: 1, result_tokens_est: 225 });
  });

  it('emits one perTurnRow per usage event with full decomposition', () => {
    const stats = aggregateTokenStats(FIXTURE_EVENTS);
    expect(stats.perTurnRows).toHaveLength(3);

    expect(stats.perTurnRows[0]).toMatchObject({
      turn_index: 0,
      uncached_tokens: 0,
      cache_read_tokens: 100,
      cache_creation_tokens: 50,
      total_tokens: 150,
      output_tokens: 200,
      tool_calls_this_turn: 1,
      tool_calls_breakdown: { Bash: 1 },
    });

    expect(stats.perTurnRows[1]).toMatchObject({
      turn_index: 1,
      uncached_tokens: 10,
      cache_read_tokens: 150,
      cache_creation_tokens: 0,
      total_tokens: 160,
      output_tokens: 300,
      tool_calls_this_turn: 2,
      tool_calls_breakdown: { Read: 1, Bash: 1 },
    });

    expect(stats.perTurnRows[2]).toMatchObject({
      turn_index: 2,
      uncached_tokens: 5,
      cache_read_tokens: 200,
      cache_creation_tokens: 0,
      total_tokens: 205,
      output_tokens: 400,
      tool_calls_this_turn: 0,
      tool_calls_breakdown: {},
    });
  });
});
