import { z } from 'zod';

/**
 * Base envelope stamped on most transcript events. All fields are optional
 * because older fixtures (and sentinel events like `last-prompt`) omit a
 * subset. `uuid` and `parentUuid` form the conversation tree CC threads
 * through the JSONL — preserved on every variant.
 */
export const baseEnvelopeSchema = z.object({
  uuid: z.string().optional(),
  parentUuid: z.string().nullable().optional(),
  timestamp: z.string().optional(),
  sessionId: z.string().optional(),
  cwd: z.string().optional(),
  gitBranch: z.string().optional(),
  userType: z.string().optional(),
  entrypoint: z.string().optional(),
  version: z.string().optional(),
  isSidechain: z.boolean().optional(),
  isMeta: z.boolean().optional(),
});

/**
 * Catch-all variant constructed by the parser when the input fails Zod
 * validation. `reason` records why we fell through:
 * - `unknown_top_level` — `type` field is missing or not in the known set.
 * - `unknown_subtype` — `type` is recognized (`system` / `attachment`) but
 *   the nested discriminator is missing or unrecognized.
 * - `zod_failure` — `type` and any nested discriminator are recognized,
 *   but the surrounding shape failed validation.
 */
export const unknownEventSchema = baseEnvelopeSchema
  .extend({
    type: z.literal('unknown'),
    raw: z.unknown(),
    reason: z.enum(['unknown_top_level', 'unknown_subtype', 'zod_failure']),
  })
  .passthrough();

// ─── content blocks (assistant.message.content[] / user.message.content[]) ───

export const toolUseContentSchema = z
  .object({
    type: z.literal('tool_use'),
    id: z.string(),
    name: z.string(),
    input: z.record(z.string(), z.unknown()),
  })
  .passthrough();

export const thinkingContentSchema = z
  .object({
    type: z.literal('thinking'),
    thinking: z.string(),
    signature: z.string().optional(),
  })
  .passthrough();

export const textContentSchema = z
  .object({
    type: z.literal('text'),
    text: z.string(),
  })
  .passthrough();

export const toolResultContentSchema = z
  .object({
    type: z.literal('tool_result'),
    tool_use_id: z.string(),
    content: z.unknown(),
    is_error: z.boolean().optional(),
  })
  .passthrough();

/**
 * Last-resort fallback for content blocks whose `type` we don't model.
 * `.passthrough()` preserves all fields so a future block type still surfaces
 * its data in the parsed event.
 */
export const unknownContentSchema = z.object({ type: z.string() }).passthrough();

export const assistantContentSchema = z
  .discriminatedUnion('type', [toolUseContentSchema, thinkingContentSchema, textContentSchema])
  .or(unknownContentSchema);

export const userContentSchema = z
  .discriminatedUnion('type', [toolResultContentSchema, textContentSchema])
  .or(unknownContentSchema);

// ─── usage block ───

export const usageBlockSchema = z
  .object({
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
    cache_read_input_tokens: z.number().optional(),
    cache_creation_input_tokens: z.number().optional(),
  })
  .passthrough();

// ─── top-level variants (12) ───

export const assistantEventSchema = baseEnvelopeSchema
  .extend({
    type: z.literal('assistant'),
    timestamp: z.string(),
    message: z
      .object({
        id: z.string().optional(),
        role: z.literal('assistant').optional(),
        model: z.string().optional(),
        content: z.array(assistantContentSchema),
        usage: usageBlockSchema,
      })
      .passthrough(),
  })
  .passthrough();

export const userEventSchema = baseEnvelopeSchema
  .extend({
    type: z.literal('user'),
    timestamp: z.string(),
    message: z
      .object({
        role: z.literal('user').optional(),
        content: z.union([z.array(userContentSchema), z.string()]),
      })
      .passthrough(),
  })
  .passthrough();

export const queueOperationEventSchema = baseEnvelopeSchema
  .extend({
    type: z.literal('queue-operation'),
    operation: z.string(),
    content: z.string().optional(),
  })
  .passthrough();

export const lastPromptEventSchema = baseEnvelopeSchema
  .extend({
    type: z.literal('last-prompt'),
    lastPrompt: z.string(),
    sessionId: z.string(),
  })
  .passthrough();

export const permissionModeEventSchema = baseEnvelopeSchema
  .extend({
    type: z.literal('permission-mode'),
    permissionMode: z.string(),
  })
  .passthrough();

export const fileHistorySnapshotEventSchema = baseEnvelopeSchema
  .extend({
    type: z.literal('file-history-snapshot'),
    messageId: z.string().optional(),
    snapshot: z.unknown(),
    isSnapshotUpdate: z.boolean().optional(),
  })
  .passthrough();

export const prLinkEventSchema = baseEnvelopeSchema
  .extend({
    type: z.literal('pr-link'),
    prNumber: z.number(),
    prUrl: z.string(),
    prRepository: z.string().optional(),
  })
  .passthrough();

export const aiTitleEventSchema = baseEnvelopeSchema
  .extend({
    type: z.literal('ai-title'),
    aiTitle: z.string(),
  })
  .passthrough();

export const customTitleEventSchema = baseEnvelopeSchema
  .extend({
    type: z.literal('custom-title'),
    customTitle: z.string(),
  })
  .passthrough();

export const agentNameEventSchema = baseEnvelopeSchema
  .extend({
    type: z.literal('agent-name'),
    agentName: z.string(),
  })
  .passthrough();

// ─── system subtypes (7) — nested discriminated union on `subtype` ───

export const systemTurnDurationSchema = baseEnvelopeSchema
  .extend({
    type: z.literal('system'),
    subtype: z.literal('turn_duration'),
    durationMs: z.number().optional(),
    messageCount: z.number().optional(),
  })
  .passthrough();

export const systemStopHookSummarySchema = baseEnvelopeSchema
  .extend({
    type: z.literal('system'),
    subtype: z.literal('stop_hook_summary'),
    hookCount: z.number().optional(),
    hookInfos: z.array(z.unknown()).optional(),
  })
  .passthrough();

export const systemLocalCommandSchema = baseEnvelopeSchema
  .extend({
    type: z.literal('system'),
    subtype: z.literal('local_command'),
    content: z.string().optional(),
    level: z.string().optional(),
  })
  .passthrough();

export const systemCompactBoundarySchema = baseEnvelopeSchema
  .extend({
    type: z.literal('system'),
    subtype: z.literal('compact_boundary'),
    content: z.string().optional(),
    level: z.string().optional(),
    logicalParentUuid: z.string().nullable().optional(),
    compactMetadata: z.unknown().optional(),
    slug: z.string().optional(),
  })
  .passthrough();

export const systemBridgeStatusSchema = baseEnvelopeSchema
  .extend({
    type: z.literal('system'),
    subtype: z.literal('bridge_status'),
    content: z.string().optional(),
    url: z.string().optional(),
  })
  .passthrough();

export const systemApiErrorSchema = baseEnvelopeSchema
  .extend({
    type: z.literal('system'),
    subtype: z.literal('api_error'),
    level: z.string().optional(),
    error: z.unknown(),
  })
  .passthrough();

export const systemAwaySummarySchema = baseEnvelopeSchema
  .extend({
    type: z.literal('system'),
    subtype: z.literal('away_summary'),
    content: z.string().optional(),
  })
  .passthrough();

/**
 * CREW-201 startup phase row. Daemon merges the CLI's paired
 * started+completed events into one row per phase, then serves them as a
 * synthetic `system` variant alongside the agent's transcript. The
 * schema pins the wire shape; runtime construction lives in
 * `AgentsService.mergeStartedAndCompleted`, never round-tripped through
 * `parseTranscriptLine`.
 *
 * One schema (not seven), with `subtype` as a `z.enum` of the phase
 * subtypes — keeps the inferred `StartupPhaseRow` type as a single
 * object type with a union-typed `subtype`, which is what callers want
 * when constructing rows from a variable.
 */
export const STARTUP_PHASE_SUBTYPES_INTERNAL = [
  'crew_startup_preflight',
  'crew_startup_worktree',
  'crew_startup_env_spec',
  'crew_startup_npm_install',
  'crew_startup_docker',
  'crew_startup_mcp',
  'crew_startup_claude_spawn',
] as const;

export const systemStartupPhaseRowSchema = baseEnvelopeSchema
  .extend({
    type: z.literal('system'),
    subtype: z.enum(STARTUP_PHASE_SUBTYPES_INTERNAL),
    startedAt: z.string(),
    completedAt: z.string().nullable(),
    status: z.enum(['in_flight', 'completed', 'failed']),
    summary: z.string(),
    durationMs: z.number().nullable(),
    logPath: z.string().nullable(),
  })
  .passthrough();

/**
 * `z.union` (not `z.discriminatedUnion`) because the startup-phase variant
 * carries a `z.enum`-typed subtype rather than a single literal — making
 * `subtype` a non-literal discriminator across the union. The runtime cost
 * is negligible for seven variants and the resulting `SystemEvent` type
 * stays accurate.
 */
export const systemEventSchema = z.union([
  systemTurnDurationSchema,
  systemStopHookSummarySchema,
  systemLocalCommandSchema,
  systemCompactBoundarySchema,
  systemBridgeStatusSchema,
  systemApiErrorSchema,
  systemAwaySummarySchema,
  systemStartupPhaseRowSchema,
]);

// ─── attachment subtypes (20) — nested z.union on `attachment.type` ───
//
// `z.discriminatedUnion` discriminates on a top-level key, but the variant
// is inside `attachment`. We use `z.union(...)` here; each option still
// carries `type: literal('attachment')` so the *outer* top-level union
// works fine.

const makeAttachmentSchema = <T extends z.ZodRawShape>(
  attachmentTypeLiteral: string,
  attachmentShape: T,
) =>
  baseEnvelopeSchema
    .extend({
      type: z.literal('attachment'),
      attachment: z
        .object({
          type: z.literal(attachmentTypeLiteral),
          ...attachmentShape,
        })
        .passthrough(),
    })
    .passthrough();

export const attachmentHookSuccessSchema = makeAttachmentSchema('hook_success', {
  hookName: z.string().optional(),
  toolUseID: z.string().optional(),
  hookEvent: z.string().optional(),
  content: z.string().optional(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
});

export const attachmentQueuedCommandSchema = makeAttachmentSchema('queued_command', {
  prompt: z.string(),
});

export const attachmentTodoReminderSchema = makeAttachmentSchema('todo_reminder', {
  content: z.array(z.unknown()).optional(),
  itemCount: z.number().optional(),
});

export const attachmentTaskReminderSchema = makeAttachmentSchema('task_reminder', {
  content: z.array(z.unknown()).optional(),
  itemCount: z.number().optional(),
});

export const attachmentCommandPermissionsSchema = makeAttachmentSchema('command_permissions', {
  allowedTools: z.array(z.string()).optional(),
});

export const attachmentSkillListingSchema = makeAttachmentSchema('skill_listing', {
  content: z.string().optional(),
});

export const attachmentHookAdditionalContextSchema = makeAttachmentSchema(
  'hook_additional_context',
  {
    content: z.array(z.string()).optional(),
  },
);

export const attachmentDeferredToolsDeltaSchema = makeAttachmentSchema('deferred_tools_delta', {
  addedNames: z.array(z.string()).optional(),
  addedLines: z.array(z.string()).optional(),
  removedNames: z.array(z.string()).optional(),
});

export const attachmentEditedTextFileSchema = makeAttachmentSchema('edited_text_file', {
  filename: z.string().optional(),
  snippet: z.string().optional(),
});

export const attachmentHookSystemMessageSchema = makeAttachmentSchema('hook_system_message', {
  content: z.string().optional(),
});

export const attachmentFileSchema = makeAttachmentSchema('file', {
  filename: z.string().optional(),
  content: z.unknown(),
});

export const attachmentUltrathinkEffortSchema = makeAttachmentSchema('ultrathink_effort', {});

export const attachmentDateChangeSchema = makeAttachmentSchema('date_change', {
  newDate: z.string().optional(),
});

export const attachmentPlanModeExitSchema = makeAttachmentSchema('plan_mode_exit', {
  planFilePath: z.string().optional(),
  planExists: z.boolean().optional(),
});

export const attachmentNestedMemorySchema = makeAttachmentSchema('nested_memory', {
  path: z.string().optional(),
  content: z.unknown(),
});

export const attachmentInvokedSkillsSchema = makeAttachmentSchema('invoked_skills', {
  skills: z.array(z.unknown()).optional(),
});

export const attachmentPlanModeSchema = makeAttachmentSchema('plan_mode', {
  reminderType: z.string().optional(),
  isSubAgent: z.boolean().optional(),
  planFilePath: z.string().optional(),
  planExists: z.boolean().optional(),
});

export const attachmentHookNonBlockingErrorSchema = makeAttachmentSchema(
  'hook_non_blocking_error',
  {
    hookName: z.string().optional(),
    toolUseID: z.string().optional(),
    hookEvent: z.string().optional(),
    stderr: z.string().optional(),
    stdout: z.string().optional(),
    exitCode: z.number().optional(),
    command: z.string().optional(),
  },
);

export const attachmentCompactFileReferenceSchema = makeAttachmentSchema('compact_file_reference', {
  filename: z.string().optional(),
  displayPath: z.string().optional(),
});

export const attachmentPlanModeReentrySchema = makeAttachmentSchema('plan_mode_reentry', {
  planFilePath: z.string().optional(),
});

export const attachmentEventSchema = z.union([
  attachmentHookSuccessSchema,
  attachmentQueuedCommandSchema,
  attachmentTodoReminderSchema,
  attachmentTaskReminderSchema,
  attachmentCommandPermissionsSchema,
  attachmentSkillListingSchema,
  attachmentHookAdditionalContextSchema,
  attachmentDeferredToolsDeltaSchema,
  attachmentEditedTextFileSchema,
  attachmentHookSystemMessageSchema,
  attachmentFileSchema,
  attachmentUltrathinkEffortSchema,
  attachmentDateChangeSchema,
  attachmentPlanModeExitSchema,
  attachmentNestedMemorySchema,
  attachmentInvokedSkillsSchema,
  attachmentPlanModeSchema,
  attachmentHookNonBlockingErrorSchema,
  attachmentCompactFileReferenceSchema,
  attachmentPlanModeReentrySchema,
]);

// ─── known-types registry (used by the parser to label `unknown` fallbacks) ──

export const KNOWN_TOP_LEVEL_TYPES = new Set<string>([
  'assistant',
  'user',
  'queue-operation',
  'attachment',
  'last-prompt',
  'permission-mode',
  'file-history-snapshot',
  'system',
  'pr-link',
  'ai-title',
  'custom-title',
  'agent-name',
]);

export const KNOWN_SYSTEM_SUBTYPES = new Set<string>([
  'turn_duration',
  'stop_hook_summary',
  'local_command',
  'compact_boundary',
  'bridge_status',
  'api_error',
  'away_summary',
  'crew_startup_preflight',
  'crew_startup_worktree',
  'crew_startup_env_spec',
  'crew_startup_npm_install',
  'crew_startup_docker',
  'crew_startup_mcp',
  'crew_startup_claude_spawn',
]);

export const KNOWN_ATTACHMENT_TYPES = new Set<string>([
  'hook_success',
  'queued_command',
  'todo_reminder',
  'task_reminder',
  'command_permissions',
  'skill_listing',
  'hook_additional_context',
  'deferred_tools_delta',
  'edited_text_file',
  'hook_system_message',
  'file',
  'ultrathink_effort',
  'date_change',
  'plan_mode_exit',
  'nested_memory',
  'invoked_skills',
  'plan_mode',
  'hook_non_blocking_error',
  'compact_file_reference',
  'plan_mode_reentry',
]);

// ─── top-level union ───
//
// Plain `z.union` (rather than `discriminatedUnion`) so the system + attachment
// nested unions plug in without extra plumbing — the parser never sees an
// option whose discriminator key isn't a top-level `type` literal.

export const transcriptEventSchema = z.union([
  assistantEventSchema,
  userEventSchema,
  queueOperationEventSchema,
  lastPromptEventSchema,
  permissionModeEventSchema,
  fileHistorySnapshotEventSchema,
  prLinkEventSchema,
  aiTitleEventSchema,
  customTitleEventSchema,
  agentNameEventSchema,
  systemEventSchema,
  attachmentEventSchema,
  unknownEventSchema,
]);

// ─── inferred types ───

export type BaseEnvelope = z.infer<typeof baseEnvelopeSchema>;
export type TranscriptEvent = z.infer<typeof transcriptEventSchema>;
export type UnknownEvent = z.infer<typeof unknownEventSchema>;

export type ToolUseContent = z.infer<typeof toolUseContentSchema>;
export type ThinkingContent = z.infer<typeof thinkingContentSchema>;
export type TextContent = z.infer<typeof textContentSchema>;
export type ToolResultContent = z.infer<typeof toolResultContentSchema>;
export type UnknownContent = z.infer<typeof unknownContentSchema>;
export type AssistantContent = z.infer<typeof assistantContentSchema>;
export type UserContent = z.infer<typeof userContentSchema>;
/** Convenience alias for slice 1b consumers — mirrors the legacy `MessageContent`. */
export type MessageContent = AssistantContent | UserContent;

export type UsageBlock = z.infer<typeof usageBlockSchema>;

export type AssistantEvent = z.infer<typeof assistantEventSchema>;
export type UserEvent = z.infer<typeof userEventSchema>;
export type QueueOperationEvent = z.infer<typeof queueOperationEventSchema>;
export type LastPromptEvent = z.infer<typeof lastPromptEventSchema>;
export type PermissionModeEvent = z.infer<typeof permissionModeEventSchema>;
export type FileHistorySnapshotEvent = z.infer<typeof fileHistorySnapshotEventSchema>;
export type PrLinkEvent = z.infer<typeof prLinkEventSchema>;
export type AiTitleEvent = z.infer<typeof aiTitleEventSchema>;
export type CustomTitleEvent = z.infer<typeof customTitleEventSchema>;
export type AgentNameEvent = z.infer<typeof agentNameEventSchema>;
export type SystemEvent = z.infer<typeof systemEventSchema>;
export type AttachmentEvent = z.infer<typeof attachmentEventSchema>;
