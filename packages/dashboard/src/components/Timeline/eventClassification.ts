import type { TranscriptEvent } from '../../data/types.js';
import { toolAlias } from '../../format/tool-alias.js';

/**
 * Slim 7 event categories used by the Filters popover. Identifiers are
 * kebab-case so they survive URL/query-string serialization later if we
 * want shareable filter state.
 *
 * Split from the older Slim 5: `hooks-and-skills` divided along its natural
 * attachment-subtype partition into `hooks` (the six hook_* / async_hook_response
 * subtypes) and `skills` (skill_listing / invoked_skills). `startup` carved
 * out of `system` so the CREW-201 crew_startup_* phases don't get buried.
 */
export type CategoryId =
  | 'conversation'
  | 'tools'
  | 'thinking'
  | 'hooks'
  | 'skills'
  | 'system'
  | 'startup';

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  defaultVisible: boolean;
}

export const CATEGORIES: readonly CategoryMeta[] = [
  { id: 'conversation', label: 'Conversation', defaultVisible: true },
  { id: 'tools', label: 'Tools', defaultVisible: true },
  { id: 'thinking', label: 'Thinking', defaultVisible: false },
  { id: 'hooks', label: 'Hooks', defaultVisible: false },
  { id: 'skills', label: 'Skills', defaultVisible: false },
  { id: 'system', label: 'System', defaultVisible: false },
  { id: 'startup', label: 'Startup', defaultVisible: true },
] as const;

export const defaultVisibleCategorySet: ReadonlySet<CategoryId> = new Set(
  CATEGORIES.filter((c) => c.defaultVisible).map((c) => c.id),
);

/**
 * Top-level event types that never reach the timeline UI. Pure bookkeeping
 * from the daemon's perspective — `queue-operation` alone is ~121k events
 * in the historical-transcript scan that drove this list.
 */
const DROPPED_TOP_LEVEL_TYPES: ReadonlySet<string> = new Set([
  'queue-operation',
  'last-prompt',
  'ai-title',
  'pr-link',
  'file-history-snapshot',
  'bridge-session',
  'custom-title',
  'agent-name',
  'permission-mode',
]);

/** Attachment subtypes filtered at the data layer before classification. */
const DROPPED_ATTACHMENT_SUBTYPES: ReadonlySet<string> = new Set(['queued_command']);

const HOOK_ATTACHMENTS: ReadonlySet<string> = new Set([
  'hook_success',
  'hook_additional_context',
  'hook_system_message',
  'hook_non_blocking_error',
  'hook_cancelled',
  'async_hook_response',
]);

const SKILL_ATTACHMENTS: ReadonlySet<string> = new Set(['skill_listing', 'invoked_skills']);

/** Tool name that represents a skill invocation — coalesced into the Skills lens. */
const SKILL_TOOL_NAME = 'Skill';

interface ContentBlock {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
}

interface AssistantOrUserShape {
  message?: {
    content?: ContentBlock[] | string;
  };
}

interface AttachmentShape {
  attachment?: {
    type?: string;
  };
}

/**
 * True for events that should never reach the timeline UI — pure
 * bookkeeping from the daemon. Apply this filter at the data layer
 * before classification + grouping.
 */
export function isDroppedEvent(event: TranscriptEvent): boolean {
  const type = (event as { type?: string }).type;
  if (type && DROPPED_TOP_LEVEL_TYPES.has(type)) return true;
  if (type === 'attachment') {
    const subtype = (event as AttachmentShape).attachment?.type;
    if (subtype && DROPPED_ATTACHMENT_SUBTYPES.has(subtype)) return true;
  }
  return false;
}

/**
 * Returns the set of Slim 7 categories an event belongs to. Assistant /
 * user events with mixed content (text + tool_use + thinking) classify
 * into every category their content blocks would.
 */
export function eventCategories(event: TranscriptEvent): Set<CategoryId> {
  const categories = new Set<CategoryId>();
  switch (event.type) {
    case 'assistant': {
      const content = (event as AssistantOrUserShape).message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_use') {
            categories.add(block.name === SKILL_TOOL_NAME ? 'skills' : 'tools');
          } else if (block.type === 'text') categories.add('conversation');
          else if (block.type === 'thinking') categories.add('thinking');
          else categories.add('system');
        }
      }
      if (categories.size === 0) categories.add('system');
      return categories;
    }
    case 'user': {
      const content = (event as AssistantOrUserShape).message?.content;
      if (typeof content === 'string') {
        categories.add('conversation');
        return categories;
      }
      if (Array.isArray(content)) {
        for (const block of content) {
          // tool_result blocks have no tool name without the id→name map; they
          // stay under `tools`. The paired tool_use already contributes
          // `skills`, so a Skill invocation is still reachable via the Skills
          // filter.
          if (block.type === 'tool_result') categories.add('tools');
          else if (block.type === 'text') categories.add('conversation');
          else categories.add('system');
        }
      }
      if (categories.size === 0) categories.add('system');
      return categories;
    }
    case 'system': {
      const subtype = (event as { subtype?: string }).subtype ?? '';
      if (subtype.startsWith('crew_startup_')) categories.add('startup');
      else categories.add('system');
      return categories;
    }
    case 'attachment': {
      const attachmentType = (event as AttachmentShape).attachment?.type;
      if (attachmentType && HOOK_ATTACHMENTS.has(attachmentType)) {
        categories.add('hooks');
      } else if (attachmentType && SKILL_ATTACHMENTS.has(attachmentType)) {
        categories.add('skills');
      } else {
        categories.add('system');
      }
      return categories;
    }
    default:
      categories.add('system');
      return categories;
  }
}

/**
 * Walk every assistant.tool_use block across an events array and return a
 * `tool_use_id → tool name` map. Memoize at the call site (typically
 * `useMemo` over the events array in Timeline.tsx) — rebuild per change is
 * cheap because it's O(events × tool_use blocks).
 */
export function buildToolNameMap(events: readonly TranscriptEvent[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of events) {
    if (e.type !== 'assistant') continue;
    const content = (e as AssistantOrUserShape).message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (
        block.type === 'tool_use' &&
        typeof block.name === 'string' &&
        typeof block.id === 'string'
      ) {
        map.set(block.id, block.name);
      }
    }
  }
  return map;
}

/**
 * Returns every tool alias an event carries — drawn from BOTH
 * `assistant.tool_use` blocks (resolved via `block.name`) AND
 * `user.tool_result` blocks (resolved via `block.tool_use_id` against
 * `toolNameById`). Aliases are normalized via `toolAlias()` so MCP variants
 * collapse to one entry.
 *
 * Returns `[]` when the event has no tool linkage, or when a tool_result's
 * id is unresolvable — treated as "we don't know" so callers don't
 * accidentally hide events they can't classify.
 */
export function eventToolAliases(
  event: TranscriptEvent,
  toolNameById: ReadonlyMap<string, string>,
): string[] {
  const aliases: string[] = [];
  if (event.type === 'assistant') {
    const content = (event as AssistantOrUserShape).message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'tool_use' && typeof block.name === 'string') {
          if (block.name === SKILL_TOOL_NAME) continue;
          aliases.push(toolAlias(block.name));
        }
      }
    }
  } else if (event.type === 'user') {
    const content = (event as AssistantOrUserShape).message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
          const name = toolNameById.get(block.tool_use_id);
          if (name && name !== SKILL_TOOL_NAME) aliases.push(toolAlias(name));
        }
      }
    }
  }
  return aliases;
}

/**
 * Returns a one-line summary of an event suitable for substring search
 * and the EventCard line-1 renderer.
 */
export function eventOneLiner(event: TranscriptEvent): string {
  switch (event.type) {
    case 'assistant':
    case 'user':
      return summarizeMessageEvent(event as AssistantOrUserShape, event.type);
    case 'system': {
      const subtype = (event as { subtype?: string }).subtype ?? 'unknown';
      const tail = collectSystemTail(event as Record<string, unknown>);
      return tail ? `[system/${subtype}] ${tail}` : `[system/${subtype}]`;
    }
    case 'attachment': {
      const att = (event as AttachmentShape).attachment ?? {};
      const tail = collectAttachmentTail(att);
      return tail ? `[${att.type ?? 'attachment'}] ${tail}` : `[${att.type ?? 'attachment'}]`;
    }
    case 'queue-operation': {
      const op = (event as { operation?: string }).operation ?? '';
      const content = (event as { content?: string }).content ?? '';
      return `[queue/${op}] ${content}`.trim();
    }
    case 'pr-link':
      return `[pr-link] ${(event as { prUrl?: string }).prUrl ?? ''}`;
    case 'ai-title':
      return `[ai-title] ${(event as { aiTitle?: string }).aiTitle ?? ''}`;
    case 'custom-title':
      return `[custom-title] ${(event as { customTitle?: string }).customTitle ?? ''}`;
    case 'agent-name':
      return `[agent-name] ${(event as { agentName?: string }).agentName ?? ''}`;
    case 'last-prompt':
      return `[last-prompt] ${(event as { lastPrompt?: string }).lastPrompt ?? ''}`;
    case 'permission-mode':
      return `[permission-mode] ${(event as { permissionMode?: string }).permissionMode ?? ''}`;
    case 'file-history-snapshot':
      return '[file-history-snapshot]';
    case 'unknown':
      return '[unknown]';
    default:
      return `[${(event as { type?: string }).type ?? 'event'}]`;
  }
}

function summarizeMessageEvent(shape: AssistantOrUserShape, role: 'assistant' | 'user'): string {
  const content = shape.message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return `[${role}]`;
  const parts: string[] = [];
  for (const block of content) {
    parts.push(summarizeContentBlock(block));
  }
  return parts.filter(Boolean).join(' · ');
}

function summarizeContentBlock(block: ContentBlock): string {
  switch (block.type) {
    case 'tool_use':
      return `[${block.name ?? 'tool_use'}] ${formatToolInput(block.input)}`.trim();
    case 'text':
      return block.text ?? '';
    case 'thinking':
      return block.thinking ?? '';
    case 'tool_result': {
      const body = stringifyResultContent(block.content);
      return body ? `[result] ${body}` : '[result]';
    }
    default:
      return block.type ? `[${block.type}]` : '';
  }
}

function formatToolInput(input: Record<string, unknown> | undefined): string {
  if (!input) return '';
  for (const key of ['command', 'file_path', 'path', 'pattern', 'query', 'description']) {
    const value = input[key];
    if (typeof value === 'string') return value;
  }
  for (const value of Object.values(input)) {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }
  return '';
}

function stringifyResultContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (
          c &&
          typeof c === 'object' &&
          'text' in c &&
          typeof (c as { text?: unknown }).text === 'string'
        ) {
          return (c as { text: string }).text;
        }
        return '';
      })
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

function collectSystemTail(record: Record<string, unknown>): string {
  for (const key of ['content', 'error', 'url']) {
    const value = record[key];
    if (typeof value === 'string') return value;
  }
  return '';
}

function collectAttachmentTail(att: Record<string, unknown>): string {
  for (const key of ['filename', 'prompt', 'content', 'hookName', 'displayPath', 'newDate']) {
    const value = att[key];
    if (typeof value === 'string') return value;
  }
  return '';
}
