// `TranscriptEvent` and the per-variant types are inferred from the Zod
// schemas in `./schemas.ts`. This file re-exports the names slice 1b
// consumers depend on, plus the legacy `ToolCall` / `AssistantText` /
// `AggregateUsage` shapes the parser still emits.

export type {
  TranscriptEvent,
  UnknownEvent,
  AssistantEvent,
  UserEvent,
  QueueOperationEvent,
  LastPromptEvent,
  PermissionModeEvent,
  FileHistorySnapshotEvent,
  PrLinkEvent,
  AiTitleEvent,
  CustomTitleEvent,
  AgentNameEvent,
  SystemEvent,
  AttachmentEvent,
  ToolUseContent,
  ThinkingContent,
  TextContent,
  ToolResultContent,
  UnknownContent,
  AssistantContent,
  UserContent,
  MessageContent,
  UsageBlock,
  BaseEnvelope,
} from './schemas.js';

/**
 * Subset of envelope fields the slice 1b consumers reach for to identify a
 * session. Kept for backwards-compat — prefer importing the full event type.
 */
export interface SessionContext {
  sessionId?: string;
  cwd?: string;
  gitBranch?: string;
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  timestamp: string;
  outputTokens: number;
}

export interface AssistantText {
  text: string;
  timestamp: string;
}

export interface AggregateUsage {
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  inputTokens: number;
}
