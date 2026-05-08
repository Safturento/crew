import { describe, expect, it } from 'vitest';

import { defaultVisibleSet, eventChipGroups } from './eventClassification.js';
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

describe('defaultVisibleSet', () => {
  it('only enables Tool calls and Assistant prose by default', () => {
    expect(defaultVisibleSet.has('tool-calls')).toBe(true);
    expect(defaultVisibleSet.has('assistant-prose')).toBe(true);
    expect(defaultVisibleSet.has('thinking')).toBe(false);
    expect(defaultVisibleSet.has('system')).toBe(false);
    expect(defaultVisibleSet.has('hooks-and-skills')).toBe(false);
    expect(defaultVisibleSet.has('other')).toBe(false);
  });
});

describe('eventChipGroups', () => {
  it('classifies assistant.tool_use as tool-calls', () => {
    const event = assistantWith([{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }]);
    expect([...eventChipGroups(event)]).toEqual(['tool-calls']);
  });

  it('classifies assistant.text as assistant-prose', () => {
    const event = assistantWith([{ type: 'text', text: 'hello' }]);
    expect([...eventChipGroups(event)]).toEqual(['assistant-prose']);
  });

  it('classifies assistant.thinking as thinking', () => {
    const event = assistantWith([{ type: 'thinking', thinking: 'reasoning' }]);
    expect([...eventChipGroups(event)]).toEqual(['thinking']);
  });

  it('returns multiple groups for an assistant event with mixed content', () => {
    const event = assistantWith([
      { type: 'text', text: 'I will run npm test' },
      { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } },
    ]);
    const groups = eventChipGroups(event);
    expect(groups.has('assistant-prose')).toBe(true);
    expect(groups.has('tool-calls')).toBe(true);
  });

  it('classifies user.tool_result as tool-calls', () => {
    const event = userWith([
      { type: 'tool_result', tool_use_id: 't1', content: 'ok' },
    ]);
    expect([...eventChipGroups(event)]).toEqual(['tool-calls']);
  });

  it('classifies system events as system regardless of subtype', () => {
    const event = {
      type: 'system',
      subtype: 'turn_duration',
      timestamp: stamp,
      durationMs: 100,
    } as unknown as TranscriptEvent;
    expect([...eventChipGroups(event)]).toEqual(['system']);
  });

  it('classifies attachment hook_success as hooks-and-skills', () => {
    const event = {
      type: 'attachment',
      timestamp: stamp,
      attachment: { type: 'hook_success', hookName: 'foo' },
    } as unknown as TranscriptEvent;
    expect([...eventChipGroups(event)]).toEqual(['hooks-and-skills']);
  });

  it('classifies attachment skill_listing as hooks-and-skills', () => {
    const event = {
      type: 'attachment',
      timestamp: stamp,
      attachment: { type: 'skill_listing' },
    } as unknown as TranscriptEvent;
    expect([...eventChipGroups(event)]).toEqual(['hooks-and-skills']);
  });

  it('classifies attachment todo_reminder as other', () => {
    const event = {
      type: 'attachment',
      timestamp: stamp,
      attachment: { type: 'todo_reminder' },
    } as unknown as TranscriptEvent;
    expect([...eventChipGroups(event)]).toEqual(['other']);
  });

  it('classifies queue-operation as other', () => {
    const event = {
      type: 'queue-operation',
      timestamp: stamp,
      operation: 'enqueue',
    } as unknown as TranscriptEvent;
    expect([...eventChipGroups(event)]).toEqual(['other']);
  });

  it('classifies pr-link as other', () => {
    const event = {
      type: 'pr-link',
      timestamp: stamp,
      prNumber: 1,
      prUrl: 'https://example.com',
    } as unknown as TranscriptEvent;
    expect([...eventChipGroups(event)]).toEqual(['other']);
  });

  it('classifies unknown variant as other', () => {
    const event = {
      type: 'unknown',
      timestamp: stamp,
      raw: {},
      reason: 'unknown_top_level',
    } as unknown as TranscriptEvent;
    expect([...eventChipGroups(event)]).toEqual(['other']);
  });
});
