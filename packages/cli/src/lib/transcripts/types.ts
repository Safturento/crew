export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: unknown;
}

export interface ThinkingContent {
  type: 'thinking';
  thinking: string;
  signature: string;
}

export type MessageContent =
  | ToolUseContent
  | ToolResultContent
  | ThinkingContent
  | { type: string };

export interface UsageBlock {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
}

export interface AssistantEvent {
  type: 'assistant';
  timestamp: string;
  message: {
    id: string;
    model: string;
    role: 'assistant';
    content: MessageContent[];
    usage: UsageBlock;
  };
}

export interface UserEvent {
  type: 'user';
  timestamp: string;
  message: {
    role: 'user';
    content: MessageContent[];
  };
}

export interface LastPromptEvent {
  type: 'last-prompt';
  lastPrompt: string;
  sessionId: string;
}

export type TranscriptEvent = AssistantEvent | UserEvent | LastPromptEvent;

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  timestamp: string;
  outputTokens: number;
}

export interface AggregateUsage {
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  inputTokens: number;
}
