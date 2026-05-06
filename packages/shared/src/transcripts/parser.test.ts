import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import {
  parseTranscript,
  parseTranscriptLine,
  parseToolCall,
  aggregateUsage,
  formatToolCall,
  parseAssistantText,
  formatAssistantText,
} from './index.js';
import type { TranscriptEvent } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '../../test/fixtures/transcript-sample.jsonl');
const VARIANTS_DIR = join(__dirname, 'fixtures');

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
      '{"type":"assistant","timestamp":"2026-04-26T17:47:39.520Z","message":{"id":"a","model":"m","role":"assistant","content":[],"usage":{"input_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":0}}}\n{not json}\n',
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
  } as TranscriptEvent;
}

describe('parseAssistantText', () => {
  it('extracts the first text block from an assistant event', () => {
    const result = parseAssistantText(assistantTextEvent('Hello world'));
    expect(result).not.toBeNull();
    expect(result?.text).toBe('Hello world');
    expect(result?.timestamp).toBe('2026-05-01T21:50:10.123Z');
  });

  it('returns null when the assistant event has no text block', () => {
    const event = {
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
    } as TranscriptEvent;
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

// Per-variant fixture coverage. Each .jsonl under `fixtures/` is a real
// (sanitized) transcript line, one per discriminated variant. Asserts:
// 1. The line parses without falling back to `unknown`.
// 2. The discriminant is what the filename promises.
// 3. Envelope fields (`uuid` and `parentUuid` when present) survive the
//    parse — slice 1c needs them for the conversation tree.

interface VariantSpec {
  file: string;
  expectedType:
    | 'assistant'
    | 'user'
    | 'queue-operation'
    | 'attachment'
    | 'last-prompt'
    | 'permission-mode'
    | 'file-history-snapshot'
    | 'system'
    | 'pr-link'
    | 'ai-title'
    | 'custom-title'
    | 'agent-name';
  /** Inner discriminator for `system` (`subtype`) and `attachment` (`attachment.type`). */
  expectedSubtype?: string;
}

const VARIANT_SPECS: VariantSpec[] = [
  // assistant content variants
  { file: 'assistant-tool-use.jsonl', expectedType: 'assistant' },
  { file: 'assistant-thinking.jsonl', expectedType: 'assistant' },
  { file: 'assistant-text.jsonl', expectedType: 'assistant' },
  // user content variants
  { file: 'user-tool-result.jsonl', expectedType: 'user' },
  { file: 'user-text.jsonl', expectedType: 'user' },
  { file: 'user-bare-string.jsonl', expectedType: 'user' },
  // queue-operation
  { file: 'queue-operation-enqueue.jsonl', expectedType: 'queue-operation' },
  { file: 'queue-operation-dequeue.jsonl', expectedType: 'queue-operation' },
  // sentinel events
  { file: 'last-prompt.jsonl', expectedType: 'last-prompt' },
  { file: 'permission-mode.jsonl', expectedType: 'permission-mode' },
  { file: 'file-history-snapshot.jsonl', expectedType: 'file-history-snapshot' },
  { file: 'pr-link.jsonl', expectedType: 'pr-link' },
  { file: 'ai-title.jsonl', expectedType: 'ai-title' },
  { file: 'custom-title.jsonl', expectedType: 'custom-title' },
  { file: 'agent-name.jsonl', expectedType: 'agent-name' },
  // system subtypes (7)
  { file: 'system-turn-duration.jsonl', expectedType: 'system', expectedSubtype: 'turn_duration' },
  {
    file: 'system-stop-hook-summary.jsonl',
    expectedType: 'system',
    expectedSubtype: 'stop_hook_summary',
  },
  { file: 'system-local-command.jsonl', expectedType: 'system', expectedSubtype: 'local_command' },
  {
    file: 'system-compact-boundary.jsonl',
    expectedType: 'system',
    expectedSubtype: 'compact_boundary',
  },
  { file: 'system-bridge-status.jsonl', expectedType: 'system', expectedSubtype: 'bridge_status' },
  { file: 'system-api-error.jsonl', expectedType: 'system', expectedSubtype: 'api_error' },
  { file: 'system-away-summary.jsonl', expectedType: 'system', expectedSubtype: 'away_summary' },
  // attachment subtypes (20)
  {
    file: 'attachment-hook-success.jsonl',
    expectedType: 'attachment',
    expectedSubtype: 'hook_success',
  },
  {
    file: 'attachment-queued-command.jsonl',
    expectedType: 'attachment',
    expectedSubtype: 'queued_command',
  },
  {
    file: 'attachment-todo-reminder.jsonl',
    expectedType: 'attachment',
    expectedSubtype: 'todo_reminder',
  },
  {
    file: 'attachment-task-reminder.jsonl',
    expectedType: 'attachment',
    expectedSubtype: 'task_reminder',
  },
  {
    file: 'attachment-command-permissions.jsonl',
    expectedType: 'attachment',
    expectedSubtype: 'command_permissions',
  },
  {
    file: 'attachment-skill-listing.jsonl',
    expectedType: 'attachment',
    expectedSubtype: 'skill_listing',
  },
  {
    file: 'attachment-hook-additional-context.jsonl',
    expectedType: 'attachment',
    expectedSubtype: 'hook_additional_context',
  },
  {
    file: 'attachment-deferred-tools-delta.jsonl',
    expectedType: 'attachment',
    expectedSubtype: 'deferred_tools_delta',
  },
  {
    file: 'attachment-edited-text-file.jsonl',
    expectedType: 'attachment',
    expectedSubtype: 'edited_text_file',
  },
  {
    file: 'attachment-hook-system-message.jsonl',
    expectedType: 'attachment',
    expectedSubtype: 'hook_system_message',
  },
  { file: 'attachment-file.jsonl', expectedType: 'attachment', expectedSubtype: 'file' },
  {
    file: 'attachment-ultrathink-effort.jsonl',
    expectedType: 'attachment',
    expectedSubtype: 'ultrathink_effort',
  },
  {
    file: 'attachment-date-change.jsonl',
    expectedType: 'attachment',
    expectedSubtype: 'date_change',
  },
  {
    file: 'attachment-plan-mode-exit.jsonl',
    expectedType: 'attachment',
    expectedSubtype: 'plan_mode_exit',
  },
  {
    file: 'attachment-nested-memory.jsonl',
    expectedType: 'attachment',
    expectedSubtype: 'nested_memory',
  },
  {
    file: 'attachment-invoked-skills.jsonl',
    expectedType: 'attachment',
    expectedSubtype: 'invoked_skills',
  },
  { file: 'attachment-plan-mode.jsonl', expectedType: 'attachment', expectedSubtype: 'plan_mode' },
  {
    file: 'attachment-hook-non-blocking-error.jsonl',
    expectedType: 'attachment',
    expectedSubtype: 'hook_non_blocking_error',
  },
  {
    file: 'attachment-compact-file-reference.jsonl',
    expectedType: 'attachment',
    expectedSubtype: 'compact_file_reference',
  },
  {
    file: 'attachment-plan-mode-reentry.jsonl',
    expectedType: 'attachment',
    expectedSubtype: 'plan_mode_reentry',
  },
];

describe('parseTranscriptLine — every variant', () => {
  it.each(VARIANT_SPECS.map((s) => [s.file, s.expectedType, s.expectedSubtype ?? null] as const))(
    'parses %s as type=%s subtype=%s',
    (file, expectedType, expectedSubtype) => {
      const line = readFileSync(join(VARIANTS_DIR, file), 'utf8').trim();
      const event = parseTranscriptLine(line);
      expect(event, `expected ${file} to parse`).not.toBeNull();
      expect(event!.type, `expected discriminant on ${file}`).toBe(expectedType);
      if (expectedSubtype !== null) {
        if (expectedType === 'system') {
          expect((event as { subtype: string }).subtype).toBe(expectedSubtype);
        } else if (expectedType === 'attachment') {
          expect((event as { attachment: { type: string } }).attachment.type).toBe(expectedSubtype);
        }
      }
    },
  );

  it('every fixture file is covered by a spec (no orphans)', () => {
    const onDisk = readdirSync(VARIANTS_DIR)
      .filter((f) => f.endsWith('.jsonl'))
      .sort();
    const inSpec = VARIANT_SPECS.map((s) => s.file).sort();
    expect(onDisk).toEqual(inSpec);
  });

  it('preserves uuid + parentUuid on variants that carry them', () => {
    const line = readFileSync(join(VARIANTS_DIR, 'assistant-tool-use.jsonl'), 'utf8').trim();
    const event = parseTranscriptLine(line);
    expect(event).not.toBeNull();
    const raw = JSON.parse(line);
    if (typeof raw.uuid === 'string') {
      expect((event as { uuid?: string }).uuid).toBe(raw.uuid);
    }
    if (raw.parentUuid !== undefined) {
      expect((event as { parentUuid?: string | null }).parentUuid).toBe(raw.parentUuid);
    }
  });

  it('returns null on malformed JSON', () => {
    expect(parseTranscriptLine('not json')).toBeNull();
    expect(parseTranscriptLine('{"unterminated":')).toBeNull();
  });

  it('returns the unknown variant with reason=unknown_top_level on unrecognized type', () => {
    const event = parseTranscriptLine(JSON.stringify({ type: 'martian', uuid: 'u1' }));
    expect(event).toMatchObject({ type: 'unknown', reason: 'unknown_top_level' });
  });

  it('returns the unknown variant with reason=unknown_top_level when type is missing', () => {
    const event = parseTranscriptLine(JSON.stringify({ uuid: 'u1' }));
    expect(event).toMatchObject({ type: 'unknown', reason: 'unknown_top_level' });
  });

  it('returns the unknown variant with reason=zod_failure on a bad shape for a known type', () => {
    const event = parseTranscriptLine(
      JSON.stringify({ type: 'assistant', timestamp: 'x', message: 'wrong-shape' }),
    );
    expect(event).toMatchObject({ type: 'unknown', reason: 'zod_failure' });
  });

  it('returns the unknown variant with reason=unknown_subtype on a system event with unknown subtype', () => {
    const event = parseTranscriptLine(JSON.stringify({ type: 'system', subtype: 'martian' }));
    expect(event).toMatchObject({ type: 'unknown', reason: 'unknown_subtype' });
  });

  it('returns the unknown variant with reason=unknown_subtype on an attachment with unknown attachment.type', () => {
    const event = parseTranscriptLine(
      JSON.stringify({ type: 'attachment', attachment: { type: 'martian' } }),
    );
    expect(event).toMatchObject({ type: 'unknown', reason: 'unknown_subtype' });
  });

  it('preserves the raw payload on the unknown variant for forensics', () => {
    const original = { type: 'martian', payload: { hello: 'world' } };
    const event = parseTranscriptLine(JSON.stringify(original));
    expect(event).not.toBeNull();
    expect((event as { raw: unknown }).raw).toEqual(original);
  });
});
