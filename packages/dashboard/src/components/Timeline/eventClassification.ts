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
