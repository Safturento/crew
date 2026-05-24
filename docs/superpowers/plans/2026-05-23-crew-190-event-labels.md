# CREW-190 — Event labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw snake_case subtype identifiers in `TranscriptRow` with human-readable labels from a centralized map, with humanizer fallback for unmapped entries.

**Architecture:** Pure module + two call-site swaps. `event-labels.ts` exports two label maps + two lookup helpers + a `humanize` fallback. `TranscriptRow.specForAttachment` and `specForSystem` consume the helpers in place of raw subtype strings.

**Tech Stack:** TypeScript, vitest. No new deps. No daemon changes.

**Spec:** [`docs/superpowers/specs/2026-05-23-crew-190-event-labels-design.md`](../specs/2026-05-23-crew-190-event-labels-design.md)
**Ticket:** [CREW-190](https://safturento.atlassian.net/browse/CREW-190) (Epic: [CREW-189](https://safturento.atlassian.net/browse/CREW-189))

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `packages/dashboard/src/components/Timeline/event-labels.ts` | Maps + lookups + humanizer |
| Create | `packages/dashboard/src/components/Timeline/event-labels.test.ts` | Unit tests |
| Modify | `packages/dashboard/src/components/Timeline/TranscriptRow.tsx` | Swap raw subtype usage for `labelForAttachment` / `labelForSystem` |
| Modify | `packages/dashboard/src/components/Timeline/TranscriptRow.test.tsx` | Add tag-label rendering case |

---

## Task 1: `event-labels.ts` module + helpers + humanizer

**Files:**
- Create: `packages/dashboard/src/components/Timeline/event-labels.ts`
- Create: `packages/dashboard/src/components/Timeline/event-labels.test.ts`

- [ ] **Step 1: Write the failing tests**

`event-labels.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  ATTACHMENT_LABELS,
  SYSTEM_LABELS,
  humanize,
  labelForAttachment,
  labelForSystem,
} from './event-labels.js';

describe('humanize', () => {
  it('snake_case → Sentence case', () => {
    expect(humanize('hook_success')).toBe('Hook success');
    expect(humanize('plan_mode_reentry')).toBe('Plan mode reentry');
  });
  it('kebab-case → Sentence case', () => {
    expect(humanize('api-error')).toBe('Api error');
  });
  it('single word', () => {
    expect(humanize('file')).toBe('File');
  });
  it('empty string → empty string', () => {
    expect(humanize('')).toBe('');
  });
  it('collapses repeated separators', () => {
    expect(humanize('weird__thing__here')).toBe('Weird thing here');
  });
});

describe('labelForAttachment', () => {
  it('returns mapped label for known type', () => {
    expect(labelForAttachment('local_command')).toBe('Local command');
    expect(labelForAttachment('hook_success')).toBe('Hook');
    expect(labelForAttachment('skill_listing')).toBe('Skills');
    expect(labelForAttachment('compact_file_reference')).toBe('File ref');
  });
  it('falls back to humanize for unknown type', () => {
    expect(labelForAttachment('weird_thing')).toBe('Weird thing');
    expect(labelForAttachment('future_event_type')).toBe('Future event type');
  });
  it('every known classification subtype has a mapping', () => {
    // Touch a few that the eventClassification.HOOKS_AND_SKILLS_ATTACHMENTS set carries
    const KNOWN_HOOKS = [
      'hook_success', 'hook_additional_context', 'hook_system_message',
      'hook_non_blocking_error', 'async_hook_response', 'skill_listing',
      'invoked_skills', 'command_permissions', 'plan_mode', 'date_change',
    ];
    for (const k of KNOWN_HOOKS) {
      expect(ATTACHMENT_LABELS[k]).toBeDefined();
    }
  });
});

describe('labelForSystem', () => {
  it('returns mapped label for known subtype', () => {
    expect(labelForSystem('turn_duration')).toBe('Turn');
    expect(labelForSystem('api_error')).toBe('API error');
    expect(labelForSystem('stop_hook_summary')).toBe('Stop hook');
  });
  it('falls back to humanize for unknown subtype', () => {
    expect(labelForSystem('something_new')).toBe('Something new');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run test:run --workspace=crew-dashboard -- event-labels
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

`event-labels.ts`:

```ts
/**
 * Human-readable labels for the raw snake_case subtype identifiers that
 * attachment and system events carry. Used by TranscriptRow to render
 * a readable tag label instead of the raw key.
 *
 * If a new subtype lands without a mapping, `labelForAttachment` /
 * `labelForSystem` fall back to `humanize()` — the awkward `"Weird thing"`
 * rendering is the prompt to add a real entry here.
 */

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
 * Convert `snake_case` / `kebab-case` to Sentence case:
 *   "unknown_thing" → "Unknown thing"
 *   "api-error"     → "Api error"
 * First word capitalized, rest lowercase. Matches the labels above.
 */
export function humanize(key: string): string {
  if (!key) return '';
  const words = key.split(/[_-]+/).filter(Boolean);
  if (words.length === 0) return '';
  return words.map((w, i) => (i === 0 ? capitalize(w) : w.toLowerCase())).join(' ');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
```

- [ ] **Step 4: Re-run to verify pass**

```bash
npm run test:run --workspace=crew-dashboard -- event-labels
```

Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/Timeline/event-labels.ts \
        packages/dashboard/src/components/Timeline/event-labels.test.ts
git commit -m "feat(dashboard): event-labels module — human-readable subtype labels + humanizer fallback (CREW-190)

ATTACHMENT_LABELS covers 25 known attachment subtypes from
HOOKS_AND_SKILLS_ATTACHMENTS + a few \"system\" attachments. SYSTEM_LABELS
covers the system-event subtypes (api_error, turn_duration, etc.).
humanize() is the snake/kebab → Sentence-case fallback for unmapped keys."
```

---

## Task 2: Wire `TranscriptRow` to consume the label helpers

**Files:**
- Modify: `packages/dashboard/src/components/Timeline/TranscriptRow.tsx`
- Modify: `packages/dashboard/src/components/Timeline/TranscriptRow.test.tsx`

- [ ] **Step 1: Write the failing TranscriptRow tests**

Add to `TranscriptRow.test.tsx` (inside the existing `describe`):

```tsx
import type { AttachmentEvent, SystemEvent } from 'crew-shared';

it('renders human-readable tag labels for attachment events', () => {
  const event: AttachmentEvent = {
    type: 'attachment',
    uuid: 'a1',
    timestamp: '2026-05-23T14:30:00Z',
    attachment: { type: 'hook_success', /* minimum required fields */ },
  } as unknown as AttachmentEvent;
  render(<TranscriptRow event={event} />);
  expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('Hook');
});

it('renders human-readable tag labels for system events', () => {
  const event: SystemEvent = {
    type: 'system',
    uuid: 's1',
    timestamp: '2026-05-23T14:30:00Z',
    subtype: 'turn_duration',
    durationMs: 1500,
    messageCount: 4,
  } as unknown as SystemEvent;
  render(<TranscriptRow event={event} />);
  expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('Turn');
});

it('falls back to humanized label for unknown attachment subtype', () => {
  const event: AttachmentEvent = {
    type: 'attachment',
    uuid: 'a2',
    timestamp: '2026-05-23T14:30:00Z',
    attachment: { type: 'future_unknown_subtype' },
  } as unknown as AttachmentEvent;
  render(<TranscriptRow event={event} />);
  expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('Future unknown subtype');
});
```

(Adapt the event shapes to whatever `crew-shared` exports — the `as unknown as` cast keeps the test compilable while pinning the input.)

- [ ] **Step 2: Run to verify fails**

```bash
npm run test:run --workspace=crew-dashboard -- TranscriptRow.test
```

Expected: FAIL — tags currently render `hook_success` / `turn_duration` / `future_unknown_subtype` raw, not the human labels.

- [ ] **Step 3: Wire `labelForAttachment` / `labelForSystem` into the spec helpers**

In `TranscriptRow.tsx`:

```tsx
// Add to imports at the top:
import { labelForAttachment, labelForSystem } from './event-labels.js';

// In specForSystem (around line 235), change:
const subtype = (event as { subtype?: string }).subtype ?? 'system';
return {
  blockType: 'system',
  category: 'system',
  tone: subtype === 'api_error' ? 'error' : 'default',
  tagLabel: labelForSystem(subtype),  // ← was: tagLabel: subtype,
  oneLiner: truncate(summary),
  // ...
};

// In specForAttachment (around line 258), change:
const type = String(att.type ?? 'attachment');
return {
  blockType: 'attachment',
  category,
  tone: type === 'hook_non_blocking_error' ? 'error' : 'default',
  tagLabel: labelForAttachment(type),  // ← was: tagLabel: type,
  oneLiner: truncate(summarizeAttachment(att)),
  // ...
};
```

- [ ] **Step 4: Re-run the full TranscriptRow suite**

```bash
npm run test:run --workspace=crew-dashboard -- TranscriptRow
```

Expected: PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/Timeline/TranscriptRow.tsx \
        packages/dashboard/src/components/Timeline/TranscriptRow.test.tsx
git commit -m "feat(dashboard): TranscriptRow uses event-labels for attachment/system tag text (CREW-190)

specForAttachment + specForSystem swap raw subtype strings for the
human-readable labels from event-labels. Unmapped subtypes get the
humanized fallback (e.g. \"future_unknown_subtype\" → \"Future unknown
subtype\")."
```

---

## Task 3: Final verification

- [ ] **Step 1: Full test suite**

```bash
npm run lint
npm run typecheck
npm run test:run --workspace=crew-dashboard
```

Expected: all green.

- [ ] **Step 2: Visual smoke against CREW-102 fixture**

Open the dashboard, navigate to the CREW-102 agent drawer, scroll through the Timeline. Confirm the tag column shows `Hook`, `Skills`, `Local command`, `Turn`, `API error`, etc. instead of raw snake_case keys.

- [ ] **Step 3: `visual-fidelity-check` skill (lightweight pass)**

Not strictly required — the change is purely textual, no visual structure changes. If running, expect 0 high / 0 medium findings.

- [ ] **Step 4: Open PR**

```bash
gh pr create --title "feat(dashboard): human-readable labels for raw event subtypes (CREW-190)" --body "..."
```

PR body references spec + plan + Epic.

## Final checklist

- [ ] `npm run lint` green
- [ ] `npm run typecheck` green
- [ ] `npm run test:run` green
- [ ] Visual smoke confirms human labels in tag column
- [ ] `agents-doc-parity-check` skill — clean (no doc registration needed; `event-labels.ts` is feature-internal under `Timeline/`, not a primitive or DS composite)

PR title: `feat(dashboard): human-readable labels for raw event subtypes (CREW-190)`
