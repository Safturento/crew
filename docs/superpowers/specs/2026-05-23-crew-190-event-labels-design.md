# CREW-190 — Human-readable labels for raw event subtypes

**Ticket:** [CREW-190](https://safturento.atlassian.net/browse/CREW-190)
**Epic:** [CREW-189 — Agent drawer Timeline polish (post-CREW-188)](https://safturento.atlassian.net/browse/CREW-189)
**Date:** 2026-05-23

## Goal

Replace raw snake_case identifiers (`local_command`, `hook_success`, `skill_listing`, `turn_duration`, etc.) in `TranscriptRow`'s tag-label column with human-readable equivalents from a centralized map. Unmapped subtypes fall back to a Title-Case humanizer so new event types never crash or look ugly.

## Non-goals

- **Tool name renaming.** Tool names (`Bash`, `Edit`, `MCP:Jira`, `TodoWrite`) are already human-readable; the existing `toolAlias()` handles MCP collapse. Keep tools out of this map.
- **Re-categorization.** Whether a subtype belongs to `hooks-and-skills` or `system` is owned by `eventClassification.ts`. This ticket only handles display labels, not classification.
- **i18n / localization.** Single-locale English labels only.

## Design

### `event-labels.ts` — new module

`packages/dashboard/src/components/Timeline/event-labels.ts`:

```ts
export const ATTACHMENT_LABELS: Record<string, string> = {
  local_command: 'Local command',
  hook_success: 'Hook',
  hook_additional_context: 'Hook context',
  hook_system_message: 'Hook message',
  hook_non_blocking_error: 'Hook error',
  async_hook_response: 'Hook response',
  hook_cancelled: 'Hook cancelled',
  skill_listing: 'Skills',
  invoked_skills: 'Skill invoked',
  command_permissions: 'Permissions',
  deferred_tools_delta: 'Deferred tools',
  mcp_instructions_delta: 'MCP instructions',
  task_reminder: 'Task reminder',
  todo_reminder: 'Todo reminder',
  nested_memory: 'Memory',
  plan_mode: 'Plan mode',
  plan_mode_exit: 'Plan mode exit',
  plan_mode_reentry: 'Plan mode reentry',
  ultrathink_effort: 'Ultrathink',
  date_change: 'Date change',
  edited_text_file: 'File edit',
  opened_file_in_ide: 'File opened',
  compact_file_reference: 'File ref',
  queued_command: 'Queued command',
  file: 'File',
};

export const SYSTEM_LABELS: Record<string, string> = {
  stop_hook_summary: 'Stop hook',
  turn_duration: 'Turn',
  api_error: 'API error',
};

export function labelForAttachment(type: string): string {
  return ATTACHMENT_LABELS[type] ?? humanize(type);
}

export function labelForSystem(subtype: string): string {
  return SYSTEM_LABELS[subtype] ?? humanize(subtype);
}

/**
 * Convert `snake_case` / `kebab-case` to Title Case.
 *   "unknown_thing" → "Unknown thing"
 *   "api-error"     → "Api error"
 * The first word is capitalized; subsequent words stay lowercase
 * (sentence case, not Title Case) — matches the labels above.
 */
export function humanize(key: string): string {
  if (!key) return '';
  const words = key.split(/[_-]+/).filter(Boolean);
  if (words.length === 0) return '';
  return words.map((w, i) => i === 0 ? capitalize(w) : w.toLowerCase()).join(' ');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
```

### TranscriptRow integration

Two callsites in `packages/dashboard/src/components/Timeline/TranscriptRow.tsx`:

```tsx
// specForSystem — change:
tagLabel: subtype,
// to:
tagLabel: labelForSystem(subtype),

// specForAttachment — change:
tagLabel: type,
// to:
tagLabel: labelForAttachment(type),
```

Plus the import.

### Decisions baked

- **Sentence case for all labels** (`Hook context` not `Hook Context`). Matches how Crew's existing UI text reads (e.g. `Provide input`, not `Provide Input`).
- **Acronyms preserved when in the map** (`API error`, `MCP instructions`). Humanizer fallback can't infer acronyms, so unmapped ones become `Api error` until someone adds the entry. Acceptable — the prompt to add a real entry is the awkward fallback rendering.
- **Plan mode variants get distinct labels** (`Plan mode` / `Plan mode exit` / `Plan mode reentry`) — three closely-related transitions, each meaningful.
- **`file` and `compact_file_reference` distinguished as `File` and `File ref`** — different rendering content, both worth keeping.

## Testing

`packages/dashboard/src/components/Timeline/event-labels.test.ts`:

- `labelForAttachment` returns mapped label for known type (e.g. `local_command` → `Local command`).
- `labelForAttachment` falls back to humanizer for unknown type (e.g. `weird_thing` → `Weird thing`).
- `labelForSystem` same pair of cases.
- `humanize` cases: snake, kebab, mixed, empty string, single word.
- TranscriptRow rendering: at least one assistant→attachment fixture renders the human label in the tag.

## Out of scope

- Adding a runtime guard that errors when a new attachment subtype lands without a mapping. Humanizer fallback is the soft warning; the awkward rendering motivates a real entry.
- ESLint rule enforcing the map stays sync with `HOOKS_AND_SKILLS_ATTACHMENTS` in `eventClassification.ts`. Worth considering if the map drifts, but not for v1.
- Exposing the map via React Context for dynamic per-tenant labels. YAGNI.

## Risks

- **Map drift from real event types.** New attachment subtypes added to the daemon won't auto-appear in the label map. Humanizer fallback prevents crashes; long-term the doc-parity skill could enforce parity. Tracked as a followup if it becomes painful.
- **Label collisions with state labels.** None today — state labels (`Running`, `Waiting`, `Error`) are visually distinct from event-type labels (which appear in a different column with different styling). Worth re-checking when registering a new attachment type.
