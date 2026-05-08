import type { TranscriptEvent } from '../../data/types.js';

/**
 * Six chip groups per UI spec §7.4. Identifiers are kebab-case so they
 * survive URL/query-string serialization later if we want shareable
 * filter state.
 */
export type ChipGroup =
  | 'tool-calls'
  | 'assistant-prose'
  | 'thinking'
  | 'system'
  | 'hooks-and-skills'
  | 'other';

export interface ChipGroupMeta {
  id: ChipGroup;
  label: string;
  defaultVisible: boolean;
}

export const CHIP_GROUPS: readonly ChipGroupMeta[] = [
  { id: 'tool-calls', label: 'Tool calls', defaultVisible: true },
  { id: 'assistant-prose', label: 'Assistant prose', defaultVisible: true },
  { id: 'thinking', label: 'Thinking', defaultVisible: false },
  { id: 'system', label: 'System', defaultVisible: false },
  { id: 'hooks-and-skills', label: 'Hooks & skills', defaultVisible: false },
  { id: 'other', label: 'Other', defaultVisible: false },
] as const;

export const defaultVisibleSet: ReadonlySet<ChipGroup> = new Set(
  CHIP_GROUPS.filter((g) => g.defaultVisible).map((g) => g.id),
);

const HOOKS_AND_SKILLS_ATTACHMENTS = new Set([
  'hook_success',
  'hook_additional_context',
  'hook_system_message',
  'hook_non_blocking_error',
  'skill_listing',
  'invoked_skills',
  'command_permissions',
  'deferred_tools_delta',
]);

interface ContentBlock {
  type?: string;
  text?: string;
  thinking?: string;
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
 * Returns the set of chip groups an event belongs to. Assistant / user
 * events with mixed content (e.g. text + tool_use) classify into every
 * group that any of their content blocks would.
 */
export function eventChipGroups(event: TranscriptEvent): Set<ChipGroup> {
  const groups = new Set<ChipGroup>();
  switch (event.type) {
    case 'assistant': {
      const content = (event as AssistantOrUserShape).message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_use') groups.add('tool-calls');
          else if (block.type === 'text') groups.add('assistant-prose');
          else if (block.type === 'thinking') groups.add('thinking');
          else groups.add('other');
        }
      }
      if (groups.size === 0) groups.add('other');
      return groups;
    }
    case 'user': {
      const content = (event as AssistantOrUserShape).message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result') groups.add('tool-calls');
          else if (block.type === 'text') groups.add('assistant-prose');
          else groups.add('other');
        }
      } else {
        // Bare-string user content (a typed prompt). Treat as prose.
        groups.add('assistant-prose');
      }
      if (groups.size === 0) groups.add('other');
      return groups;
    }
    case 'system':
      groups.add('system');
      return groups;
    case 'attachment': {
      const attachmentType = (event as AttachmentShape).attachment?.type;
      if (attachmentType && HOOKS_AND_SKILLS_ATTACHMENTS.has(attachmentType)) {
        groups.add('hooks-and-skills');
      } else {
        groups.add('other');
      }
      return groups;
    }
    default:
      groups.add('other');
      return groups;
  }
}

/**
 * Returns a one-line summary of an event suitable for substring search
 * (and, in CREW-L, for the EventCard line-1 renderer). Concatenates
 * salient strings from each content block / envelope field; never
 * truncates here — UI consumers can clip per their layout.
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

function summarizeMessageEvent(
  shape: AssistantOrUserShape,
  role: 'assistant' | 'user',
): string {
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
  // Prefer the most recognizable keys first; otherwise serialize the
  // first scalar value.
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
        if (c && typeof c === 'object' && 'text' in c && typeof (c as { text?: unknown }).text === 'string') {
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
