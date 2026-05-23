import { describe, expect, it } from 'vitest';

import {
  CATEGORIES,
  defaultVisibleCategorySet,
  eventCategories,
  eventOneLiner,
  eventToolNames,
  isDroppedEvent,
} from './eventClassification.js';
import type { TranscriptEvent } from '../../data/types.js';

const stamp = '2026-04-29T12:00:00.000Z';

const assistantWith = (content: unknown[]): TranscriptEvent =>
  ({
    type: 'assistant',
    timestamp: stamp,
    message: { role: 'assistant', content, usage: {} },
  }) as unknown as TranscriptEvent;

const userWith = (content: unknown[]): TranscriptEvent =>
  ({
    type: 'user',
    timestamp: stamp,
    message: { role: 'user', content },
  }) as unknown as TranscriptEvent;

describe('CATEGORIES + defaultVisibleCategorySet', () => {
  it('exposes the Slim 5 categories in display order', () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual([
      'conversation',
      'tools',
      'thinking',
      'hooks-and-skills',
      'system',
    ]);
  });

  it('enables Conversation + Tools by default; the rest are hidden', () => {
    expect(defaultVisibleCategorySet.has('conversation')).toBe(true);
    expect(defaultVisibleCategorySet.has('tools')).toBe(true);
    expect(defaultVisibleCategorySet.has('thinking')).toBe(false);
    expect(defaultVisibleCategorySet.has('hooks-and-skills')).toBe(false);
    expect(defaultVisibleCategorySet.has('system')).toBe(false);
  });
});

describe('isDroppedEvent', () => {
  const dropTopLevels = [
    'queue-operation',
    'last-prompt',
    'ai-title',
    'pr-link',
    'file-history-snapshot',
    'bridge-session',
    'custom-title',
    'agent-name',
    'permission-mode',
  ];
  for (const type of dropTopLevels) {
    it(`drops top-level type ${type}`, () => {
      const event = { type, timestamp: stamp } as unknown as TranscriptEvent;
      expect(isDroppedEvent(event)).toBe(true);
    });
  }

  it('drops attachments with subtype queued_command', () => {
    const event = {
      type: 'attachment',
      timestamp: stamp,
      attachment: { type: 'queued_command' },
    } as unknown as TranscriptEvent;
    expect(isDroppedEvent(event)).toBe(true);
  });

  it('does not drop assistant/user/system/in-scope-attachment events', () => {
    expect(isDroppedEvent(assistantWith([{ type: 'text', text: 'hi' }]))).toBe(false);
    expect(isDroppedEvent(userWith([{ type: 'text', text: 'hi' }]))).toBe(false);
    expect(
      isDroppedEvent({
        type: 'system',
        subtype: 'turn_duration',
        timestamp: stamp,
      } as unknown as TranscriptEvent),
    ).toBe(false);
    expect(
      isDroppedEvent({
        type: 'attachment',
        timestamp: stamp,
        attachment: { type: 'hook_success' },
      } as unknown as TranscriptEvent),
    ).toBe(false);
  });
});

describe('eventCategories', () => {
  it('classifies assistant text as conversation', () => {
    const event = assistantWith([{ type: 'text', text: 'hello' }]);
    expect([...eventCategories(event)]).toEqual(['conversation']);
  });

  it('classifies assistant tool_use as tools', () => {
    const event = assistantWith([{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }]);
    expect([...eventCategories(event)]).toEqual(['tools']);
  });

  it('classifies assistant thinking as thinking', () => {
    const event = assistantWith([{ type: 'thinking', thinking: 'reasoning' }]);
    expect([...eventCategories(event)]).toEqual(['thinking']);
  });

  it('classifies user tool_result as tools', () => {
    const event = userWith([{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }]);
    expect([...eventCategories(event)]).toEqual(['tools']);
  });

  it('classifies bare-string user content as conversation', () => {
    const event = {
      type: 'user',
      timestamp: stamp,
      message: { role: 'user', content: 'fix the build' },
    } as unknown as TranscriptEvent;
    expect([...eventCategories(event)]).toEqual(['conversation']);
  });

  it('returns multi-membership for mixed assistant content (text + tool_use + thinking)', () => {
    const event = assistantWith([
      { type: 'text', text: 'I will think then act' },
      { type: 'thinking', thinking: 'planning…' },
      { type: 'tool_use', id: 't1', name: 'Bash', input: {} },
    ]);
    const cats = eventCategories(event);
    expect(cats.has('conversation')).toBe(true);
    expect(cats.has('tools')).toBe(true);
    expect(cats.has('thinking')).toBe(true);
  });

  it('classifies every hooks-and-skills attachment subtype into hooks-and-skills', () => {
    const subtypes = [
      'hook_success',
      'hook_additional_context',
      'hook_system_message',
      'hook_non_blocking_error',
      'hook_cancelled',
      'async_hook_response',
      'skill_listing',
      'invoked_skills',
      'command_permissions',
      'deferred_tools_delta',
      'mcp_instructions_delta',
      'task_reminder',
      'todo_reminder',
      'nested_memory',
      'plan_mode',
      'plan_mode_exit',
      'plan_mode_reentry',
      'ultrathink_effort',
      'date_change',
      'edited_text_file',
      'opened_file_in_ide',
      'file',
      'compact_file_reference',
    ];
    for (const subtype of subtypes) {
      const event = {
        type: 'attachment',
        timestamp: stamp,
        attachment: { type: subtype },
      } as unknown as TranscriptEvent;
      expect([...eventCategories(event)]).toEqual(['hooks-and-skills']);
    }
  });

  it('classifies system events as system (any subtype)', () => {
    const event = {
      type: 'system',
      subtype: 'turn_duration',
      timestamp: stamp,
    } as unknown as TranscriptEvent;
    expect([...eventCategories(event)]).toEqual(['system']);
  });

  it('uses system as the catch-all for unrecognised top-types and attachment subtypes', () => {
    expect([
      ...eventCategories({
        type: 'attachment',
        timestamp: stamp,
        attachment: { type: 'unknown_subtype' },
      } as unknown as TranscriptEvent),
    ]).toEqual(['system']);
    expect([
      ...eventCategories({
        type: 'unknown',
        timestamp: stamp,
      } as unknown as TranscriptEvent),
    ]).toEqual(['system']);
  });
});

describe('eventToolNames', () => {
  it('returns the tool_use name for an assistant tool_use block', () => {
    const event = assistantWith([{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }]);
    expect(eventToolNames(event)).toEqual(['Bash']);
  });

  it('joins every tool_use block in mixed content', () => {
    const event = assistantWith([
      { type: 'text', text: 'do it' },
      { type: 'tool_use', id: 't1', name: 'Bash', input: {} },
      { type: 'tool_use', id: 't2', name: 'Edit', input: {} },
    ]);
    expect(eventToolNames(event)).toEqual(['Bash', 'Edit']);
  });

  it('returns the tool_use name behind a user.tool_result via the linked id', () => {
    // We don't resolve cross-event id linking here — a user.tool_result
    // alone has no tool_name. eventToolNames returns [] for it.
    const event = userWith([{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }]);
    expect(eventToolNames(event)).toEqual([]);
  });

  it('returns [] for non-tool events', () => {
    expect(eventToolNames(assistantWith([{ type: 'text', text: 'hi' }]))).toEqual([]);
    expect(
      eventToolNames({
        type: 'system',
        subtype: 'turn_duration',
        timestamp: stamp,
      } as unknown as TranscriptEvent),
    ).toEqual([]);
  });
});

describe('eventOneLiner', () => {
  it('summarizes a Bash tool_use with the tool name + command', () => {
    const event = assistantWith([
      { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } },
    ]);
    const line = eventOneLiner(event);
    expect(line).toContain('Bash');
    expect(line).toContain('npm test');
  });

  it('returns the assistant text for an assistant.text content block', () => {
    const event = assistantWith([{ type: 'text', text: 'Looking into the bug.' }]);
    expect(eventOneLiner(event)).toContain('Looking into the bug.');
  });

  it('returns the thinking text for an assistant.thinking block', () => {
    const event = assistantWith([{ type: 'thinking', thinking: 'first I would' }]);
    expect(eventOneLiner(event)).toContain('first I would');
  });

  it('joins multiple content blocks with a separator', () => {
    const event = assistantWith([
      { type: 'text', text: 'I will run npm test' },
      { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } },
    ]);
    const line = eventOneLiner(event);
    expect(line).toContain('I will run npm test');
    expect(line).toContain('Bash');
  });

  it('returns the user tool_result content for a user.tool_result event', () => {
    const event = userWith([{ type: 'tool_result', tool_use_id: 't1', content: 'all tests pass' }]);
    expect(eventOneLiner(event)).toContain('all tests pass');
  });

  it('returns a bare-string user prompt verbatim', () => {
    const event = {
      type: 'user',
      timestamp: stamp,
      message: { role: 'user', content: 'fix the build' },
    } as unknown as TranscriptEvent;
    expect(eventOneLiner(event)).toContain('fix the build');
  });

  it('returns [system/<subtype>] for a system event', () => {
    const event = {
      type: 'system',
      subtype: 'turn_duration',
      timestamp: stamp,
      durationMs: 100,
    } as unknown as TranscriptEvent;
    expect(eventOneLiner(event)).toContain('[system/turn_duration]');
  });

  it('returns [<attachment.type>] for an attachment event', () => {
    const event = {
      type: 'attachment',
      timestamp: stamp,
      attachment: { type: 'hook_success', hookName: 'foo' },
    } as unknown as TranscriptEvent;
    expect(eventOneLiner(event)).toContain('[hook_success]');
  });
});
