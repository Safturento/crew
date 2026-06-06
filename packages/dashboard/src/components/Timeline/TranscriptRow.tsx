import { ChevronDown, ChevronRight } from 'lucide-react';
import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';
import type {
  AssistantContent,
  AssistantEvent,
  AttachmentEvent,
  SystemEvent,
  TextContent,
  ThinkingContent,
  ToolResultContent,
  ToolUseContent,
  TranscriptEvent,
  UnknownEvent,
  UserContent,
  UserEvent,
} from 'crew-shared';

import { cn } from '../../lib/utils.js';
import type { PillColor } from '../../lib/pill-variants.js';
import { TOOL_COLOR_CLASSES, type ToolColorKey } from '../../data/tool-colors.js';
import { toolAlias } from '../../format/tool-alias.js';
import { Tag } from '../ui/tag.js';
import { colorForTool } from './event-palette.js';
import { labelForAttachment, labelForSystem } from './event-labels.js';

const LINE_ONE_MAX = 80;
type Tone = 'default' | 'error';

interface RowSpec {
  blockType: string;
  category: 'conversation' | 'tools' | 'thinking' | 'hooks-and-skills' | 'system';
  tone: Tone;
  tagLabel: string;
  toolColor?: ToolColorKey;
  oneLiner: string;
  timestamp?: string;
  tokens?: number;
  expanded: string;
}

const CATEGORY_COLOR: Record<RowSpec['category'], PillColor> = {
  conversation: 'running',
  tools: 'waiting',
  thinking: 'pr_open',
  'hooks-and-skills': 'initializing',
  system: 'idle',
};

const STRUCTURED_BLOCK_TYPES: ReadonlySet<string> = new Set([
  'tool_use',
  'tool_result',
  'attachment',
  'system',
]);

function useIsClamped(ref: RefObject<HTMLElement | null>): boolean {
  const [clamped, setClamped] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return clamped;
}

interface TranscriptRowProps {
  event: TranscriptEvent;
}

export function TranscriptRow({ event }: TranscriptRowProps) {
  return (
    <>
      {specsForEvent(event).map((spec, idx) => (
        <Row key={idx} spec={spec} />
      ))}
    </>
  );
}

function Row({ spec }: { spec: RowSpec }) {
  const [open, setOpen] = useState(false);
  const onelinerRef = useRef<HTMLSpanElement>(null);
  const isClamped = useIsClamped(onelinerRef);
  const isStructured = STRUCTURED_BLOCK_TYPES.has(spec.blockType);
  const showChevron = isClamped || isStructured;

  const tagColorProps: { color?: PillColor; toolColor?: ToolColorKey } =
    spec.tone === 'error'
      ? { color: 'error' }
      : spec.toolColor
        ? { toolColor: spec.toolColor }
        : { color: CATEGORY_COLOR[spec.category] };
  const meta = formatMeta(spec.timestamp, spec.tokens);
  const ariaLabel = `${spec.tagLabel} · ${spec.oneLiner}`.trim();
  const chevronColorClass =
    spec.tone === 'error'
      ? 'text-red-300'
      : spec.toolColor
        ? TOOL_COLOR_CLASSES[spec.toolColor].text
        : 'text-muted-foreground';

  return (
    <div
      data-testid="transcript-row"
      data-block-type={spec.blockType}
      data-category={spec.category}
      data-tone={spec.tone}
      className="border-b border-white/5"
    >
      <button
        type="button"
        data-testid="transcript-row-trigger"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left"
      >
        <Tag
          {...tagColorProps}
          intensity="mid"
          data-testid="transcript-row-tag"
          className="mt-0.5 shrink-0"
        >
          {spec.tagLabel}
        </Tag>
        <span
          ref={onelinerRef}
          data-testid="transcript-row-text"
          className={cn(
            'min-w-0 flex-1 line-clamp-3 whitespace-normal font-mono text-xs',
            spec.tone === 'error' ? 'text-red-400' : 'text-muted-foreground',
          )}
        >
          {spec.oneLiner}
        </span>
        {meta ? (
          <span
            data-testid="transcript-row-meta"
            className="mt-0.5 shrink-0 font-mono text-xs text-muted-foreground tabular-nums"
          >
            {meta}
          </span>
        ) : null}
        <span
          data-testid="transcript-row-chevron"
          aria-hidden
          className={cn('mt-0.5 shrink-0', chevronColorClass, !showChevron && 'invisible')}
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </span>
      </button>
      {open ? (
        <pre
          data-testid="transcript-row-expanded"
          className="mx-2.5 mb-2 max-h-[300px] overflow-x-auto overflow-y-auto rounded-sm bg-black/30 p-2 text-xs whitespace-pre-wrap text-foreground"
        >
          {spec.expanded}
        </pre>
      ) : null}
    </div>
  );
}

function specsForEvent(event: TranscriptEvent): RowSpec[] {
  switch (event.type) {
    case 'assistant':
      return specsForAssistant(event);
    case 'user':
      return specsForUser(event);
    case 'system':
      return [specForSystem(event)];
    case 'attachment':
      return [specForAttachment(event)];
    case 'unknown':
      return [specForUnknown(event)];
    default:
      return [specForFallback(event)];
  }
}

function specsForAssistant(event: AssistantEvent): RowSpec[] {
  const blocks = event.message.content;
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return [specForFallback(event)];
  }
  return blocks.map((block) => specForAssistantBlock(event, block));
}

function specForAssistantBlock(event: AssistantEvent, block: AssistantContent): RowSpec {
  const tokens = event.message.usage?.output_tokens;
  if (isToolUse(block) && block.name === 'Skill') {
    // A `Skill` tool invocation is coalesced into the Skills lens (see
    // eventClassification.ts). Render it like a skill attachment: the
    // hooks-and-skills palette + the same "Skill invoked" label that
    // invoked_skills attachments use.
    return {
      blockType: 'tool_use',
      category: 'hooks-and-skills',
      tone: 'default',
      tagLabel: 'Skill invoked',
      oneLiner: truncate(summarizeToolInput(block.input)),
      timestamp: event.timestamp,
      tokens,
      expanded: prettyJson(block.input),
    };
  }
  if (isToolUse(block)) {
    const alias = toolAlias(block.name);
    const summary = summarizeToolInput(block.input);
    return {
      blockType: 'tool_use',
      category: 'tools',
      tone: 'default',
      tagLabel: alias,
      toolColor: colorForTool(alias),
      oneLiner: truncate(summary),
      timestamp: event.timestamp,
      tokens,
      expanded: prettyJson(block.input),
    };
  }
  if (isThinking(block)) {
    return {
      blockType: 'thinking',
      category: 'thinking',
      tone: 'default',
      tagLabel: 'Thinking',
      oneLiner: truncate(block.thinking),
      timestamp: event.timestamp,
      tokens,
      expanded: block.thinking,
    };
  }
  if (isText(block)) {
    return {
      blockType: 'text',
      category: 'conversation',
      tone: 'default',
      tagLabel: 'Assistant',
      oneLiner: truncate(block.text),
      timestamp: event.timestamp,
      tokens,
      expanded: block.text,
    };
  }
  return specForUnknownBlock(event, block);
}

function specsForUser(event: UserEvent): RowSpec[] {
  const content = event.message.content;
  if (typeof content === 'string') {
    return [
      {
        blockType: 'text',
        category: 'conversation',
        tone: 'default',
        tagLabel: 'User',
        oneLiner: truncate(content),
        timestamp: event.timestamp,
        expanded: content,
      },
    ];
  }
  if (!Array.isArray(content) || content.length === 0) {
    return [specForFallback(event)];
  }
  return content.map((block) => specForUserBlock(event, block));
}

function specForUserBlock(event: UserEvent, block: UserContent): RowSpec {
  if (isToolResult(block)) {
    const body = stringifyResultContent(block.content);
    return {
      blockType: 'tool_result',
      category: 'tools',
      tone: block.is_error ? 'error' : 'default',
      tagLabel: 'Result',
      oneLiner: truncate(body),
      timestamp: event.timestamp,
      expanded: body || prettyJson(block),
    };
  }
  if (isText(block)) {
    return {
      blockType: 'text',
      category: 'conversation',
      tone: 'default',
      tagLabel: 'User',
      oneLiner: truncate(block.text),
      timestamp: event.timestamp,
      expanded: block.text,
    };
  }
  return specForUnknownBlock(event, block);
}

function specForSystem(event: SystemEvent): RowSpec {
  const subtype = (event as { subtype?: string }).subtype ?? 'system';

  // CREW-201: StartupPhaseRow variants carry `status` + `startedAt`
  // instead of the regular system event's `timestamp`. The merge happens
  // in the daemon; the frontend only branches on the shape it receives.
  if (subtype.startsWith('crew_startup_')) {
    const phase = event as unknown as {
      subtype: string;
      status: 'in_flight' | 'completed' | 'failed';
      summary: string;
      startedAt: string;
    };
    return {
      blockType: 'system',
      category: 'system',
      tone: phase.status === 'failed' ? 'error' : 'default',
      tagLabel: labelForSystem(phase.subtype),
      oneLiner: truncate(phase.summary ?? ''),
      timestamp: phase.startedAt,
      expanded: prettyJson(event),
    };
  }

  const summary = summarizeSystem(event);
  return {
    blockType: 'system',
    category: 'system',
    tone: subtype === 'api_error' ? 'error' : 'default',
    tagLabel: labelForSystem(subtype),
    oneLiner: truncate(summary),
    timestamp: event.timestamp,
    expanded: prettyJson(event),
  };
}

function specForAttachment(event: AttachmentEvent): RowSpec {
  const att = event.attachment as Record<string, unknown>;
  const type = String(att.type ?? 'attachment');
  const category = HOOKS_AND_SKILLS_ATTACHMENTS.has(type) ? 'hooks-and-skills' : 'system';
  return {
    blockType: 'attachment',
    category,
    tone: type === 'hook_non_blocking_error' ? 'error' : 'default',
    tagLabel: labelForAttachment(type),
    oneLiner: truncate(summarizeAttachment(att)),
    timestamp: event.timestamp,
    expanded: prettyJson(event.attachment),
  };
}

function specForUnknown(event: UnknownEvent): RowSpec {
  return {
    blockType: 'unknown',
    category: 'system',
    tone: 'default',
    tagLabel: 'unknown',
    oneLiner: '',
    timestamp: event.timestamp,
    expanded: prettyJson(event.raw),
  };
}

function specForFallback(event: TranscriptEvent): RowSpec {
  const type = (event as { type?: string }).type ?? 'event';
  return {
    blockType: type,
    category: 'system',
    tone: 'default',
    tagLabel: type,
    oneLiner: '',
    timestamp: (event as { timestamp?: string }).timestamp,
    expanded: prettyJson(event),
  };
}

function specForUnknownBlock(event: TranscriptEvent, block: unknown): RowSpec {
  const label =
    block && typeof block === 'object' && 'type' in block && typeof block.type === 'string'
      ? block.type
      : 'unknown';
  return {
    blockType: label,
    category: 'system',
    tone: 'default',
    tagLabel: label,
    oneLiner: '',
    timestamp: (event as { timestamp?: string }).timestamp,
    expanded: prettyJson(block),
  };
}

// ---------- helpers ----------

const HOOKS_AND_SKILLS_ATTACHMENTS = new Set<string>([
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
]);

function isToolUse(c: AssistantContent | UserContent): c is ToolUseContent {
  if (c.type !== 'tool_use') return false;
  const r = c as Record<string, unknown>;
  return typeof r.name === 'string' && typeof r.id === 'string';
}

function isThinking(c: AssistantContent): c is ThinkingContent {
  return c.type === 'thinking' && typeof (c as { thinking: unknown }).thinking === 'string';
}

function isText(c: AssistantContent | UserContent): c is TextContent {
  return c.type === 'text' && typeof (c as { text: unknown }).text === 'string';
}

function isToolResult(c: UserContent): c is ToolResultContent {
  return (
    c.type === 'tool_result' && typeof (c as { tool_use_id: unknown }).tool_use_id === 'string'
  );
}

const TOOL_INPUT_PRIMARY_FIELDS = [
  'command',
  'file_path',
  'path',
  'pattern',
  'url',
  'query',
  'description',
  'prompt',
] as const;

function summarizeToolInput(input: Record<string, unknown> | undefined): string {
  if (!input) return '';
  for (const key of TOOL_INPUT_PRIMARY_FIELDS) {
    const value = input[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

function stringifyResultContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === 'string') return c;
        if (
          c &&
          typeof c === 'object' &&
          'text' in c &&
          typeof (c as { text: unknown }).text === 'string'
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

function summarizeSystem(event: SystemEvent): string {
  const r = event as Record<string, unknown>;
  switch ((r.subtype as string | undefined) ?? '') {
    case 'turn_duration': {
      const seconds = ((r.durationMs as number | undefined) ?? 0) / 1000;
      return `${seconds.toFixed(1)}s · ${(r.messageCount as number | undefined) ?? 0} msg`;
    }
    case 'stop_hook_summary':
      return `${(r.hookCount as number | undefined) ?? 0} hooks`;
    case 'api_error': {
      const err = r.error;
      if (err && typeof err === 'object' && 'message' in err) {
        return String((err as { message: unknown }).message);
      }
      return typeof err === 'string' ? err : '';
    }
    default: {
      const content = r.content;
      return typeof content === 'string' ? content : '';
    }
  }
}

function summarizeAttachment(att: Record<string, unknown>): string {
  for (const key of [
    'filename',
    'prompt',
    'hookName',
    'displayPath',
    'newDate',
    'content',
  ] as const) {
    const value = att[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

export function truncate(text: string, max = LINE_ONE_MAX): string {
  const collapsed = (text ?? '').replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max - 1).trimEnd()}…`;
}

function formatHHMMSS(timestamp: string | undefined): string {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function formatTokensShort(tokens: number | undefined): string {
  if (tokens === undefined || tokens === null) return '';
  if (tokens >= 1_000) {
    const k = tokens / 1_000;
    const rounded = k >= 10 ? k.toFixed(0) : k.toFixed(1);
    return `${rounded}k tok`;
  }
  return `${tokens} tok`;
}

function formatMeta(timestamp: string | undefined, tokens: number | undefined): ReactNode {
  const time = formatHHMMSS(timestamp);
  const tok = formatTokensShort(tokens);
  if (time && tok) return `${time} · ${tok}`;
  return time || tok || null;
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
