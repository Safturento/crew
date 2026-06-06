import { describe, expect, it } from 'vitest';

import {
  CATEGORIES,
  buildToolNameMap,
  defaultVisibleCategorySet,
  eventCategories,
  eventOneLiner,
  eventToolAliases,
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

describe('CATEGORIES + defaultVisibleCategorySet (Slim 7)', () => {
  it('exposes the seven canonical category ids in display order', () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual([
      'conversation',
      'tools',
      'thinking',
      'hooks',
      'skills',
      'system',
      'startup',
    ]);
  });

  it('enables Conversation + Tools + Startup by default; the rest are hidden', () => {
    expect(defaultVisibleCategorySet.has('conversation')).toBe(true);
    expect(defaultVisibleCategorySet.has('tools')).toBe(true);
    expect(defaultVisibleCategorySet.has('thinking')).toBe(false);
    expect(defaultVisibleCategorySet.has('hooks')).toBe(false);
    expect(defaultVisibleCategorySet.has('skills')).toBe(false);
    expect(defaultVisibleCategorySet.has('system')).toBe(false);
    expect(defaultVisibleCategorySet.has('startup')).toBe(true);
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

describe('eventCategories (Slim 7)', () => {
  it('classifies assistant text as conversation', () => {
    const event = assistantWith([{ type: 'text', text: 'hello' }]);
    expect([...eventCategories(event)]).toEqual(['conversation']);
  });

  it('classifies assistant tool_use as tools', () => {
    const event = assistantWith([{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }]);
    expect([...eventCategories(event)]).toEqual(['tools']);
  });

  it('classifies a Skill tool_use under skills, not tools', () => {
    const event = assistantWith([{ type: 'tool_use', id: 't1', name: 'Skill', input: {} }]);
    expect([...eventCategories(event)]).toEqual(['skills']);
  });

  it('still classifies a non-Skill tool_use under tools', () => {
    const event = assistantWith([{ type: 'tool_use', id: 't2', name: 'Bash', input: {} }]);
    expect([...eventCategories(event)]).toEqual(['tools']);
  });

  it('a mixed turn with text + Skill lands in conversation AND skills', () => {
    const event = assistantWith([
      { type: 'text', text: 'hi' },
      { type: 'tool_use', id: 't3', name: 'Skill', input: {} },
    ]);
    expect(new Set(eventCategories(event))).toEqual(new Set(['conversation', 'skills']));
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

  it('classifies every hook attachment subtype into hooks', () => {
    const subtypes = [
      'hook_success',
      'hook_additional_context',
      'hook_system_message',
      'hook_non_blocking_error',
      'hook_cancelled',
      'async_hook_response',
    ];
    for (const subtype of subtypes) {
      const event = {
        type: 'attachment',
        timestamp: stamp,
        attachment: { type: subtype },
      } as unknown as TranscriptEvent;
      const cats = eventCategories(event);
      expect(cats.has('hooks')).toBe(true);
      expect(cats.has('skills')).toBe(false);
      expect(cats.has('system')).toBe(false);
    }
  });

  it('classifies skill_listing + invoked_skills as skills', () => {
    for (const subtype of ['skill_listing', 'invoked_skills']) {
      const event = {
        type: 'attachment',
        timestamp: stamp,
        attachment: { type: subtype },
      } as unknown as TranscriptEvent;
      const cats = eventCategories(event);
      expect(cats.has('skills')).toBe(true);
      expect(cats.has('hooks')).toBe(false);
      expect(cats.has('system')).toBe(false);
    }
  });

  it('routes remaining attachment subtypes to system', () => {
    const otherSubtypes = [
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
    for (const subtype of otherSubtypes) {
      const event = {
        type: 'attachment',
        timestamp: stamp,
        attachment: { type: subtype },
      } as unknown as TranscriptEvent;
      expect([...eventCategories(event)]).toEqual(['system']);
    }
  });

  it('classifies non-startup system events as system', () => {
    const event = {
      type: 'system',
      subtype: 'turn_duration',
      timestamp: stamp,
    } as unknown as TranscriptEvent;
    const cats = eventCategories(event);
    expect(cats.has('system')).toBe(true);
    expect(cats.has('startup')).toBe(false);
  });

  it('routes crew_startup_* system subtypes to startup', () => {
    const event = {
      type: 'system',
      subtype: 'crew_startup_npm_install',
      timestamp: stamp,
    } as unknown as TranscriptEvent;
    const cats = eventCategories(event);
    expect(cats.has('startup')).toBe(true);
    expect(cats.has('system')).toBe(false);
  });

  it('routes every crew_startup_* phase to startup', () => {
    const phases = [
      'crew_startup_preflight',
      'crew_startup_git_fetch',
      'crew_startup_npm_install',
      'crew_startup_docker_compose',
      'crew_startup_bruno_env',
      'crew_startup_playwright_browsers',
      'crew_startup_claude_spawn',
    ];
    for (const subtype of phases) {
      const event = {
        type: 'system',
        subtype,
        timestamp: stamp,
      } as unknown as TranscriptEvent;
      expect(eventCategories(event).has('startup')).toBe(true);
    }
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

describe('buildToolNameMap', () => {
  it('maps tool_use ids to tool names from assistant events', () => {
    const events = [
      assistantWith([
        { type: 'tool_use', id: 'toolu_abc', name: 'Bash', input: {} },
        { type: 'tool_use', id: 'toolu_def', name: 'mcp__atlassian__jira_get_issue', input: {} },
      ]),
    ];
    const map = buildToolNameMap(events);
    expect(map.get('toolu_abc')).toBe('Bash');
    expect(map.get('toolu_def')).toBe('mcp__atlassian__jira_get_issue');
    expect(map.size).toBe(2);
  });

  it('walks every assistant event in the array', () => {
    const events = [
      assistantWith([{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }]),
      assistantWith([{ type: 'tool_use', id: 't2', name: 'Edit', input: {} }]),
    ];
    const map = buildToolNameMap(events);
    expect(map.size).toBe(2);
    expect(map.get('t1')).toBe('Bash');
    expect(map.get('t2')).toBe('Edit');
  });

  it('ignores non-assistant events and non-tool_use blocks', () => {
    const events = [
      userWith([{ type: 'text', text: 'hi' }]),
      assistantWith([{ type: 'text', text: 'hello' }]),
      {
        type: 'system',
        subtype: 'turn_duration',
        timestamp: stamp,
      } as unknown as TranscriptEvent,
    ];
    expect(buildToolNameMap(events).size).toBe(0);
  });

  it('returns an empty map for an empty events array', () => {
    expect(buildToolNameMap([]).size).toBe(0);
  });
});

describe('eventToolAliases', () => {
  const mapWith = (entries: [string, string][]): Map<string, string> => new Map(entries);

  it('returns aliases for assistant.tool_use blocks via toolAlias()', () => {
    const event = assistantWith([{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }]);
    expect(eventToolAliases(event, new Map())).toEqual(['Bash']);
  });

  it('collapses MCP variants to a single MCP:<Service> alias', () => {
    const event = assistantWith([
      { type: 'tool_use', id: 't1', name: 'mcp__atlassian__jira_get_issue', input: {} },
    ]);
    expect(eventToolAliases(event, new Map())).toEqual(['MCP:Jira']);
  });

  it('returns every tool_use alias for mixed assistant content', () => {
    const event = assistantWith([
      { type: 'text', text: 'do it' },
      { type: 'tool_use', id: 't1', name: 'Bash', input: {} },
      { type: 'tool_use', id: 't2', name: 'Edit', input: {} },
    ]);
    expect(eventToolAliases(event, new Map())).toEqual(['Bash', 'Edit']);
  });

  it('resolves a user.tool_result via the tool_use_id map and aliases the name', () => {
    const event = userWith([{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }]);
    const map = mapWith([['t1', 'mcp__atlassian__jira_get_issue']]);
    expect(eventToolAliases(event, map)).toEqual(['MCP:Jira']);
  });

  it('returns [] for a tool_result whose id is not in the map (do not hide)', () => {
    const event = userWith([{ type: 'tool_result', tool_use_id: 'orphan', content: 'ok' }]);
    expect(eventToolAliases(event, new Map())).toEqual([]);
  });

  it('excludes a Skill tool_use from the tool-name alias list', () => {
    const event = assistantWith([{ type: 'tool_use', id: 't4', name: 'Skill', input: {} }]);
    expect(eventToolAliases(event, new Map())).toEqual([]);
  });

  it('excludes a Skill tool_result (resolved via the map) from the alias list', () => {
    const event = userWith([{ type: 'tool_result', tool_use_id: 't5', content: 'ok' }]);
    const map = mapWith([['t5', 'Skill']]);
    expect(eventToolAliases(event, map)).toEqual([]);
  });

  it('returns [] for events with no tool linkage at all', () => {
    expect(eventToolAliases(assistantWith([{ type: 'text', text: 'hi' }]), new Map())).toEqual([]);
    expect(
      eventToolAliases(
        {
          type: 'system',
          subtype: 'turn_duration',
          timestamp: stamp,
        } as unknown as TranscriptEvent,
        new Map(),
      ),
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
