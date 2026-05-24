# Timeline Filters Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the asymmetric two-tier filter dropdown in the drawer Timeline with a single inclusion-tree popover (Tools as a master-switch parent over tool aliases, all positive checkboxes, `visible / total` badge, Slim 7 taxonomy), fix the `tool_result`-orphan classification bug, and add a `Checkbox` UI primitive.

**Architecture:** One `Filters.tsx` component re-architected around a single `TimelineFilterState` shape `{ categories: Set<CategoryId>, tools: { mode: 'all-known' | 'explicit', set: Set<string> } }`. `eventClassification.ts` gains a `eventToolAliases(event, toolNameById)` helper that resolves `user.tool_result` blocks via a `tool_use_id → name` map built per render in `Timeline.tsx`. New `Checkbox` UI primitive at `packages/dashboard/src/components/ui/checkbox.tsx` wraps Radix's primitive and mirrors the new Figma composite.

**Tech Stack:** React 18 + Vite, Radix UI (umbrella `radix-ui` package, already a dep), Tailwind, Vitest + RTL + jsdom, Playwright. Reference spec: `docs/superpowers/specs/2026-05-24-timeline-filters-rework-design.md`.

---

## File Structure

**Create:**
- `packages/dashboard/src/components/ui/checkbox.tsx` — Radix Checkbox primitive wrapper (~40 lines). Mirrors `popover.tsx` shape: `Checkbox` + `CheckboxIndicator` re-exports + a default styled `Checkbox` that matches the Figma `Checkbox` composite's three states (`on`/`off`/`disabled`).
- `packages/dashboard/src/components/ui/checkbox.test.tsx` — primitive smoke tests.
- `packages/dashboard/src/components/ui/checkbox.figma.tsx` — Code Connect doc (inert; not published).

**Modify:**
- `packages/dashboard/src/components/Timeline/eventClassification.ts` — split `hooks-and-skills` into `hooks` + `skills`, add `startup` category branch, replace `eventToolNames` with `eventToolAliases(event, toolNameById)`, add `buildToolNameMap(events)`.
- `packages/dashboard/src/components/Timeline/Filters.tsx` — full rewrite: new state shape, inclusion-tree UX, single popover, bulk controls, Checkbox + Pill composites.
- `packages/dashboard/src/components/Timeline/Filters.test.tsx` — full rewrite to cover new model.
- `packages/dashboard/src/components/Timeline/Timeline.tsx` — pass `TimelineFilterState`, build `toolNameById` map per `events` change, update `matchesFilters` call signature.
- `packages/dashboard/tests/e2e/agent-drawer.spec.ts` (existing or new file under `tests/e2e/`) — E2E coverage for the 4 canonical states + the `tool_result` orphan regression.

**No daemon, no shared, no CLI changes.** Dashboard-only.

---

## Pre-flight

- [ ] **Step P1: Confirm worktree + branch**

```bash
git -C /home/safturento/Repos/crew/.planning-worktrees/timeline-filter-rework status
```

Expected: `On branch docs/timeline-filter-rework-spec`. Spec already committed at `9d631fd`.

- [ ] **Step P2: Confirm umbrella `radix-ui` exports Checkbox**

In the worktree, after `npm install`:

```bash
node -e "console.log(Object.keys(require('radix-ui')).filter(k => /checkbox/i.test(k)))"
```

Expected: `[ 'Checkbox' ]` (or includes `Checkbox`). If the umbrella doesn't re-export, fall back to `@radix-ui/react-checkbox` as a sibling dep. Either path is fine — Task 1 picks whichever works.

---

## Task 1: Add `Checkbox` UI primitive

**Files:**
- Create: `packages/dashboard/src/components/ui/checkbox.tsx`
- Create: `packages/dashboard/src/components/ui/checkbox.test.tsx`
- Create: `packages/dashboard/src/components/ui/checkbox.figma.tsx`

- [ ] **Step 1.1: Write the failing primitive test**

Create `packages/dashboard/src/components/ui/checkbox.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Checkbox } from './checkbox.js';

describe('Checkbox', () => {
  it('renders an unchecked checkbox by default', () => {
    render(<Checkbox aria-label="Toggle thing" />);
    const cb = screen.getByRole('checkbox', { name: 'Toggle thing' });
    expect(cb).toBeInTheDocument();
    expect(cb).not.toBeChecked();
  });

  it('reflects checked=true via aria-checked', () => {
    render(<Checkbox checked aria-label="Toggle" />);
    expect(screen.getByRole('checkbox', { name: 'Toggle' })).toBeChecked();
  });

  it('fires onCheckedChange on click', async () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox onCheckedChange={onCheckedChange} aria-label="Toggle" />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Toggle' }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('disabled prop blocks interaction and renders disabled', async () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox disabled onCheckedChange={onCheckedChange} aria-label="Toggle" />);
    const cb = screen.getByRole('checkbox', { name: 'Toggle' });
    expect(cb).toBeDisabled();
    await userEvent.click(cb);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `npm --workspace crew-dashboard test -- checkbox.test`
Expected: FAIL with `Cannot find module './checkbox.js'` or equivalent.

- [ ] **Step 1.3: Implement the Checkbox primitive**

Create `packages/dashboard/src/components/ui/checkbox.tsx`:

```tsx
import * as React from 'react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer inline-flex size-[14px] shrink-0 items-center justify-center rounded-[3px] border border-border bg-transparent outline-none transition-colors',
        'data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-35',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="flex items-center justify-center text-current">
        <Check className="size-[9px]" strokeWidth={3} aria-hidden />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
```

If `radix-ui` umbrella does not re-export `Checkbox` (verify via Step P2): swap the import to `import * as CheckboxPrimitive from '@radix-ui/react-checkbox';` and add `"@radix-ui/react-checkbox": "^1.x"` to `packages/dashboard/package.json`, then `npm install` in the dashboard workspace.

- [ ] **Step 1.4: Run test to verify it passes**

Run: `npm --workspace crew-dashboard test -- checkbox.test`
Expected: PASS (4 tests).

- [ ] **Step 1.5: Add Code Connect doc**

Create `packages/dashboard/src/components/ui/checkbox.figma.tsx`:

```tsx
import { figma } from '@figma/code-connect';

import { Checkbox } from './checkbox.js';

figma.connect(Checkbox, 'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=663-869', {
  props: {
    state: figma.enum('state', { on: 'checked', off: 'unchecked', disabled: 'disabled' }),
    Label: figma.string('Label'),
  },
  example: ({ state, Label }) =>
    state === 'disabled' ? (
      <label className="opacity-35">
        <Checkbox disabled /> {Label}
      </label>
    ) : (
      <label>
        <Checkbox checked={state === 'checked'} /> {Label}
      </label>
    ),
});
```

(This file is inert — crew is Figma Pro, not Org; no `figma connect publish`. Memory: [project_code_connect_skipped].)

- [ ] **Step 1.6: Commit**

```bash
git add packages/dashboard/src/components/ui/checkbox.tsx \
        packages/dashboard/src/components/ui/checkbox.test.tsx \
        packages/dashboard/src/components/ui/checkbox.figma.tsx
git commit -m "feat(dashboard): Checkbox primitive (Radix wrapper)

Mirrors the Crew DS Checkbox composite (state ∈ {on, off, disabled}
+ Label). Used by the Timeline filter rework. Standard Radix primitive
shape — focused like popover.tsx / dialog.tsx."
```

---

## Task 2: Slim 7 categories (split Hooks/Skills, add Startup)

**Files:**
- Modify: `packages/dashboard/src/components/Timeline/eventClassification.ts:8-26` (CategoryId, CATEGORIES, defaultVisibleCategorySet)
- Modify: `packages/dashboard/src/components/Timeline/eventClassification.ts:48-72` (HOOKS_AND_SKILLS_ATTACHMENTS → HOOK_ATTACHMENTS + SKILL_ATTACHMENTS)
- Modify: `packages/dashboard/src/components/Timeline/eventClassification.ts:148-163` (`system` branch + `attachment` branch in `eventCategories`)
- Test: `packages/dashboard/src/components/Timeline/eventClassification.test.ts` (existing or create if missing)

- [ ] **Step 2.1: Write failing tests for new categories**

In `packages/dashboard/src/components/Timeline/eventClassification.test.ts` (create if needed):

```ts
import { describe, expect, it } from 'vitest';

import { CATEGORIES, eventCategories } from './eventClassification.js';

describe('CATEGORIES (Slim 7)', () => {
  it('exposes the seven canonical category ids', () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual([
      'conversation', 'tools', 'thinking', 'hooks', 'skills', 'system', 'startup',
    ]);
  });

  it('marks conversation, tools, and startup as default-visible', () => {
    const visible = CATEGORIES.filter((c) => c.defaultVisible).map((c) => c.id);
    expect(visible).toEqual(['conversation', 'tools', 'startup']);
  });
});

describe('eventCategories (Slim 7)', () => {
  it('hooks attachment subtype classifies as hooks', () => {
    const event = { type: 'attachment', attachment: { type: 'hook_success' } } as never;
    expect(eventCategories(event).has('hooks')).toBe(true);
    expect(eventCategories(event).has('skills')).toBe(false);
  });

  it('skill_listing attachment subtype classifies as skills', () => {
    const event = { type: 'attachment', attachment: { type: 'skill_listing' } } as never;
    expect(eventCategories(event).has('skills')).toBe(true);
    expect(eventCategories(event).has('hooks')).toBe(false);
  });

  it('non-hook non-skill attachment subtypes stay in system', () => {
    const event = { type: 'attachment', attachment: { type: 'edited_text_file' } } as never;
    expect(eventCategories(event).has('system')).toBe(true);
  });

  it('crew_startup_* system subtypes classify as startup', () => {
    const event = { type: 'system', subtype: 'crew_startup_npm_install' } as never;
    expect(eventCategories(event).has('startup')).toBe(true);
    expect(eventCategories(event).has('system')).toBe(false);
  });

  it('other system subtypes stay in system', () => {
    const event = { type: 'system', subtype: 'init' } as never;
    expect(eventCategories(event).has('system')).toBe(true);
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `npm --workspace crew-dashboard test -- eventClassification.test`
Expected: FAIL — `CATEGORIES` does not yet include `hooks`/`skills`/`startup` as separate entries; `eventCategories` still uses `hooks-and-skills`.

- [ ] **Step 2.3: Apply the Slim 7 changes**

Edit `packages/dashboard/src/components/Timeline/eventClassification.ts` lines 8-26:

```ts
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
  { id: 'conversation', label: 'Conversation',  defaultVisible: true  },
  { id: 'tools',        label: 'Tools',         defaultVisible: true  },
  { id: 'thinking',     label: 'Thinking',      defaultVisible: false },
  { id: 'hooks',        label: 'Hooks',         defaultVisible: false },
  { id: 'skills',       label: 'Skills',        defaultVisible: false },
  { id: 'system',       label: 'System',        defaultVisible: false },
  { id: 'startup',      label: 'Startup',       defaultVisible: true  },
] as const;

export const defaultVisibleCategorySet: ReadonlySet<CategoryId> = new Set(
  CATEGORIES.filter((c) => c.defaultVisible).map((c) => c.id),
);
```

Edit lines 48-72 — replace `HOOKS_AND_SKILLS_ATTACHMENTS` with the partition:

```ts
const HOOK_ATTACHMENTS: ReadonlySet<string> = new Set([
  'hook_success',
  'hook_additional_context',
  'hook_system_message',
  'hook_non_blocking_error',
  'hook_cancelled',
  'async_hook_response',
]);

const SKILL_ATTACHMENTS: ReadonlySet<string> = new Set([
  'skill_listing',
  'invoked_skills',
]);

// The remaining attachment subtypes stay in 'system' (no constant — implicit
// fall-through in `eventCategories`).
```

Edit `eventCategories` `case 'attachment'` (around line 151) to route to the new buckets:

```ts
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
```

Edit `case 'system'` (around line 148) to detect startup:

```ts
case 'system': {
  const subtype = (event as { subtype?: string }).subtype ?? '';
  if (subtype.startsWith('crew_startup_')) {
    categories.add('startup');
  } else {
    categories.add('system');
  }
  return categories;
}
```

- [ ] **Step 2.4: Run test to verify it passes**

Run: `npm --workspace crew-dashboard test -- eventClassification.test`
Expected: PASS (all new cases). Existing tests for `eventCategories` may fail if they reference `hooks-and-skills` — Step 2.5 sweeps those.

- [ ] **Step 2.5: Sweep stale references**

```bash
git -C /home/safturento/Repos/crew/.planning-worktrees/timeline-filter-rework grep -n "hooks-and-skills\|HOOKS_AND_SKILLS_ATTACHMENTS"
```

Expected: zero matches. If any remain, update them to use `hooks` or `skills` as appropriate.

- [ ] **Step 2.6: Commit**

```bash
git add packages/dashboard/src/components/Timeline/eventClassification.ts \
        packages/dashboard/src/components/Timeline/eventClassification.test.ts
git commit -m "feat(dashboard): split Hooks/Skills + add Startup category (Slim 7)

Splits the old hooks-and-skills bucket along its natural attachment-subtype
partition. Routes crew_startup_* system subtypes to a dedicated Startup
category (was getting buried in System catch-all). Conversation/Tools/
Startup default-visible; rest default-off."
```

---

## Task 3: `tool_result` orphan fix — `eventToolAliases` + `buildToolNameMap`

**Files:**
- Modify: `packages/dashboard/src/components/Timeline/eventClassification.ts` — replace `eventToolNames` with `eventToolAliases`, add `buildToolNameMap`
- Test: `packages/dashboard/src/components/Timeline/eventClassification.test.ts`

- [ ] **Step 3.1: Write failing tests for the alias resolution**

Append to `packages/dashboard/src/components/Timeline/eventClassification.test.ts`:

```ts
import { buildToolNameMap, eventToolAliases } from './eventClassification.js';

describe('buildToolNameMap', () => {
  it('maps tool_use ids to tool names from assistant events', () => {
    const events = [
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: 'toolu_abc', name: 'Bash', input: {} },
            { type: 'tool_use', id: 'toolu_def', name: 'mcp__atlassian__jira_get_issue', input: {} },
          ],
        },
      },
    ] as never[];
    const map = buildToolNameMap(events);
    expect(map.get('toolu_abc')).toBe('Bash');
    expect(map.get('toolu_def')).toBe('mcp__atlassian__jira_get_issue');
  });

  it('ignores non-assistant events and non-tool_use blocks', () => {
    const events = [
      { type: 'user', message: { content: [{ type: 'text', text: 'hi' }] } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } },
    ] as never[];
    expect(buildToolNameMap(events).size).toBe(0);
  });
});

describe('eventToolAliases', () => {
  const mapWith = (entries: [string, string][]) => new Map(entries);

  it('returns aliases for assistant.tool_use blocks', () => {
    const evt = {
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'tu1', name: 'Bash', input: {} }] },
    } as never;
    expect(eventToolAliases(evt, new Map())).toEqual(['Bash']);
  });

  it('aliases MCP variants into a single MCP:Group alias', () => {
    const evt = {
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', id: 'tu1', name: 'mcp__atlassian__jira_get_issue', input: {} },
        ],
      },
    } as never;
    expect(eventToolAliases(evt, new Map())).toEqual(['MCP:Jira']);
  });

  it('resolves user.tool_result blocks via the tool_use_id map', () => {
    const evt = {
      type: 'user',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tu1' }],
      },
    } as never;
    const map = mapWith([['tu1', 'mcp__atlassian__jira_get_issue']]);
    expect(eventToolAliases(evt, map)).toEqual(['MCP:Jira']);
  });

  it('returns [] for a tool_result whose id is not in the map', () => {
    const evt = {
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'orphan' }] },
    } as never;
    expect(eventToolAliases(evt, new Map())).toEqual([]);
  });

  it('returns [] for events with no tool linkage at all', () => {
    const evt = { type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } } as never;
    expect(eventToolAliases(evt, new Map())).toEqual([]);
  });
});
```

- [ ] **Step 3.2: Run tests to verify they fail**

Run: `npm --workspace crew-dashboard test -- eventClassification.test`
Expected: FAIL — `buildToolNameMap` and `eventToolAliases` are not exported.

- [ ] **Step 3.3: Implement the helpers**

In `packages/dashboard/src/components/Timeline/eventClassification.ts`, REPLACE the existing `eventToolNames` function (around lines 173-184) with:

```ts
import { toolAlias } from '../../format/tool-alias.js';

/**
 * Build a tool_use_id → tool name map for an entire events array. Walk all
 * assistant.tool_use blocks; non-tool events are skipped. Memoize at the
 * call site (typically `useMemo` over the events array in Timeline.tsx) —
 * rebuild per render is cheap because it's O(events × tool_use blocks).
 */
export function buildToolNameMap(events: TranscriptEvent[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of events) {
    if (e.type !== 'assistant') continue;
    const content = (e as AssistantOrUserShape).message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (
        block.type === 'tool_use' &&
        typeof block.name === 'string' &&
        typeof (block as { id?: string }).id === 'string'
      ) {
        map.set((block as { id: string }).id, block.name);
      }
    }
  }
  return map;
}

/**
 * Returns every tool alias an event carries — drawn from BOTH
 * assistant.tool_use blocks (resolved via `block.name`) AND user.tool_result
 * blocks (resolved via `block.tool_use_id` against `toolNameById`). Aliases
 * are normalized via `toolAlias()` so MCP variants collapse to one entry.
 *
 * Returns [] when the event has no tool linkage, or when a tool_result's
 * id is unresolvable (treated as "we don't know" — falls through filters
 * to avoid hiding events we can't classify).
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
          aliases.push(toolAlias(block.name));
        }
      }
    }
  } else if (event.type === 'user') {
    const content = (event as AssistantOrUserShape).message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'tool_result') {
          const id = (block as { tool_use_id?: string }).tool_use_id;
          if (id) {
            const name = toolNameById.get(id);
            if (name) aliases.push(toolAlias(name));
          }
        }
      }
    }
  }
  return aliases;
}
```

Remove the old `eventToolNames` export.

- [ ] **Step 3.4: Sweep callers of `eventToolNames`**

```bash
git -C /home/safturento/Repos/crew/.planning-worktrees/timeline-filter-rework grep -n "eventToolNames"
```

Expected: matches in `Timeline.tsx` (line ~374 in `matchesFilters`). Task 5 will rewrite that — for now, switch the import name in Timeline.tsx so the file still typechecks. Stub:

```ts
// In Timeline.tsx — temporary: use the old logic but new name. Task 5 replaces.
import { eventToolAliases, ... } from './eventClassification.js';
// In matchesFilters:
const aliases = eventToolAliases(event, EMPTY_MAP).map(toolAlias);
```

Where `EMPTY_MAP = new Map<string, string>() as ReadonlyMap<string, string>` — Task 5 wires the real map. The `tool_result`-orphan symptom is preserved at this stage (intentional; one task does one thing).

Drop the redundant `.map(toolAlias)` — `eventToolAliases` already aliases. Final replacement in `matchesFilters`:

```ts
const aliases = eventToolAliases(event, EMPTY_MAP);
```

- [ ] **Step 3.5: Run tests + typecheck**

```bash
npm --workspace crew-dashboard test -- eventClassification.test
npm --workspace crew-dashboard run typecheck
```

Expected: All tests pass. Typecheck clean.

- [ ] **Step 3.6: Commit**

```bash
git add packages/dashboard/src/components/Timeline/eventClassification.ts \
        packages/dashboard/src/components/Timeline/eventClassification.test.ts \
        packages/dashboard/src/components/Timeline/Timeline.tsx
git commit -m "feat(dashboard): eventToolAliases + buildToolNameMap

Replace eventToolNames with a tool-use-id resolving helper so
user.tool_result events can be filtered by the tool they belong to.
buildToolNameMap walks all assistant.tool_use blocks once per events
change. Timeline.tsx temporarily passes an empty map — task 5 wires
the real one in, which is when the tool_result-orphan symptom resolves
end-to-end."
```

---

## Task 4: New `TimelineFilterState` + pure helpers

**Files:**
- Create: `packages/dashboard/src/components/Timeline/filter-state.ts` — types + pure helpers
- Test: `packages/dashboard/src/components/Timeline/filter-state.test.ts`

Splitting into its own file keeps the state model unit-testable without the React renderer.

- [ ] **Step 4.1: Write failing tests for the state helpers**

Create `packages/dashboard/src/components/Timeline/filter-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { CATEGORIES } from './eventClassification.js';
import {
  computeTotalLeaves,
  computeVisibleLeaves,
  defaultTimelineFilterState,
  isToolVisible,
  selectAll,
  clear,
  toggleCategory,
  toggleTool,
  type TimelineFilterState,
} from './filter-state.js';

const knownAliases = ['Bash', 'Edit', 'Read', 'MCP:Jira', 'MCP:Figma'];

describe('defaultTimelineFilterState', () => {
  it('selects conversation, tools, and startup; tools mode is all-known', () => {
    const s = defaultTimelineFilterState;
    expect(Array.from(s.categories)).toEqual(['conversation', 'tools', 'startup']);
    expect(s.tools.mode).toBe('all-known');
    expect(s.tools.set.size).toBe(0);
  });
});

describe('isToolVisible', () => {
  it('returns true for any alias when mode is all-known', () => {
    expect(isToolVisible('AnyNew', { mode: 'all-known', set: new Set() })).toBe(true);
  });
  it('returns true iff alias is in set when mode is explicit', () => {
    const t = { mode: 'explicit' as const, set: new Set(['Bash']) };
    expect(isToolVisible('Bash', t)).toBe(true);
    expect(isToolVisible('Edit', t)).toBe(false);
  });
});

describe('computeVisibleLeaves / computeTotalLeaves', () => {
  it('default state: 2 non-tools categories + 5 tools = 7 visible / 11 total', () => {
    expect(computeVisibleLeaves(defaultTimelineFilterState, knownAliases)).toBe(7);
    expect(computeTotalLeaves(knownAliases)).toBe(11);
  });

  it('Tools master OFF: tool aliases excluded from visible regardless of set', () => {
    const s: TimelineFilterState = {
      categories: new Set(['conversation', 'thinking', 'hooks', 'skills', 'system', 'startup']),
      tools: { mode: 'all-known', set: new Set() },
    };
    expect(computeVisibleLeaves(s, knownAliases)).toBe(6);  // 6 non-tools cats, 0 tools
  });

  it('explicit mode counts only set members for tools', () => {
    const s: TimelineFilterState = {
      categories: new Set(['conversation', 'tools', 'startup']),
      tools: { mode: 'explicit', set: new Set(['Bash', 'Edit']) },
    };
    expect(computeVisibleLeaves(s, knownAliases)).toBe(4);  // 2 non-tools cats + 2 tools
  });
});

describe('selectAll', () => {
  it('puts every category and tools into all-known with empty set', () => {
    const s: TimelineFilterState = {
      categories: new Set(['conversation']),
      tools: { mode: 'explicit', set: new Set(['Bash']) },
    };
    const next = selectAll(s);
    expect(next.categories.size).toBe(CATEGORIES.length);
    expect(next.tools.mode).toBe('all-known');
    expect(next.tools.set.size).toBe(0);
  });
});

describe('clear', () => {
  it('empties categories and puts tools in explicit empty set', () => {
    const next = clear(defaultTimelineFilterState);
    expect(next.categories.size).toBe(0);
    expect(next.tools.mode).toBe('explicit');
    expect(next.tools.set.size).toBe(0);
  });
});

describe('toggleCategory', () => {
  it('removes a category that is currently in the set', () => {
    const next = toggleCategory(defaultTimelineFilterState, 'conversation');
    expect(next.categories.has('conversation')).toBe(false);
  });
  it('adds a category that is currently not in the set', () => {
    const next = toggleCategory(defaultTimelineFilterState, 'thinking');
    expect(next.categories.has('thinking')).toBe(true);
  });
  it('does not mutate the input state', () => {
    const before = new Set(defaultTimelineFilterState.categories);
    toggleCategory(defaultTimelineFilterState, 'conversation');
    expect(defaultTimelineFilterState.categories).toEqual(before);
  });
});

describe('toggleTool', () => {
  it('all-known + uncheck Bash → explicit with all-known-minus-Bash', () => {
    const next = toggleTool(defaultTimelineFilterState, 'Bash', knownAliases);
    expect(next.tools.mode).toBe('explicit');
    expect(next.tools.set.has('Bash')).toBe(false);
    expect(next.tools.set.has('Edit')).toBe(true);
    expect(next.tools.set.size).toBe(4);
  });

  it('explicit + check missing alias → adds to set', () => {
    const s: TimelineFilterState = {
      categories: new Set(['tools']),
      tools: { mode: 'explicit', set: new Set(['Bash']) },
    };
    const next = toggleTool(s, 'Edit', knownAliases);
    expect(next.tools.set.has('Edit')).toBe(true);
  });

  it('explicit + uncheck present alias → removes from set', () => {
    const s: TimelineFilterState = {
      categories: new Set(['tools']),
      tools: { mode: 'explicit', set: new Set(['Bash', 'Edit']) },
    };
    const next = toggleTool(s, 'Bash', knownAliases);
    expect(next.tools.set.has('Bash')).toBe(false);
    expect(next.tools.set.size).toBe(1);
  });

  it('Tools master OFF + click a child → enables master AND checks child', () => {
    const s: TimelineFilterState = {
      categories: new Set(['conversation']),  // tools NOT in set
      tools: { mode: 'explicit', set: new Set() },
    };
    const next = toggleTool(s, 'MCP:Jira', knownAliases);
    expect(next.categories.has('tools')).toBe(true);  // master switch flipped on
    expect(next.tools.mode).toBe('explicit');
    expect(next.tools.set.has('MCP:Jira')).toBe(true);
  });
});
```

- [ ] **Step 4.2: Run tests to verify they fail**

Run: `npm --workspace crew-dashboard test -- filter-state.test`
Expected: FAIL — `filter-state.js` does not exist.

- [ ] **Step 4.3: Implement `filter-state.ts`**

Create `packages/dashboard/src/components/Timeline/filter-state.ts`:

```ts
import { CATEGORIES, type CategoryId } from './eventClassification.js';

export type ToolsMode = 'all-known' | 'explicit';

export interface TimelineFilterState {
  readonly categories: ReadonlySet<CategoryId>;
  readonly tools: { readonly mode: ToolsMode; readonly set: ReadonlySet<string> };
}

export const defaultTimelineFilterState: TimelineFilterState = {
  categories: new Set(CATEGORIES.filter((c) => c.defaultVisible).map((c) => c.id)),
  tools: { mode: 'all-known', set: new Set() },
};

export function isToolVisible(
  alias: string,
  t: TimelineFilterState['tools'],
): boolean {
  if (t.mode === 'all-known') return true;
  return t.set.has(alias);
}

const NON_TOOLS_CATEGORIES = CATEGORIES.filter((c) => c.id !== 'tools').map((c) => c.id);

export function computeTotalLeaves(knownAliases: readonly string[]): number {
  return NON_TOOLS_CATEGORIES.length + knownAliases.length;
}

export function computeVisibleLeaves(
  state: TimelineFilterState,
  knownAliases: readonly string[],
): number {
  let visible = 0;
  for (const id of NON_TOOLS_CATEGORIES) {
    if (state.categories.has(id)) visible += 1;
  }
  if (state.categories.has('tools')) {
    for (const a of knownAliases) {
      if (isToolVisible(a, state.tools)) visible += 1;
    }
  }
  return visible;
}

export function selectAll(_state: TimelineFilterState): TimelineFilterState {
  return {
    categories: new Set(CATEGORIES.map((c) => c.id)),
    tools: { mode: 'all-known', set: new Set() },
  };
}

export function clear(_state: TimelineFilterState): TimelineFilterState {
  return {
    categories: new Set(),
    tools: { mode: 'explicit', set: new Set() },
  };
}

export function toggleCategory(
  state: TimelineFilterState,
  id: CategoryId,
): TimelineFilterState {
  const next = new Set(state.categories);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return { ...state, categories: next };
}

export function toggleTool(
  state: TimelineFilterState,
  alias: string,
  knownAliases: readonly string[],
): TimelineFilterState {
  // Disabled-child click: Tools master is OFF + user clicks a child →
  // enable Tools master AND check the child (single click does both).
  if (!state.categories.has('tools')) {
    const cats = new Set(state.categories);
    cats.add('tools');
    return {
      categories: cats,
      tools: { mode: 'explicit', set: new Set([alias]) },
    };
  }

  // Master is on. Standard toggle within the current mode.
  if (state.tools.mode === 'all-known') {
    // Unchecking from "all checked" → snapshot known-minus-this into explicit set
    const next = new Set(knownAliases.filter((a) => a !== alias));
    return { ...state, tools: { mode: 'explicit', set: next } };
  }
  // explicit mode
  const next = new Set(state.tools.set);
  if (next.has(alias)) next.delete(alias);
  else next.add(alias);
  return { ...state, tools: { mode: 'explicit', set: next } };
}
```

- [ ] **Step 4.4: Run tests to verify they pass**

Run: `npm --workspace crew-dashboard test -- filter-state.test`
Expected: PASS (all cases).

- [ ] **Step 4.5: Commit**

```bash
git add packages/dashboard/src/components/Timeline/filter-state.ts \
        packages/dashboard/src/components/Timeline/filter-state.test.ts
git commit -m "feat(dashboard): TimelineFilterState + pure helpers (filter-state.ts)

State shape for the inclusion-tree filter:
- categories: Set<CategoryId>
- tools: { mode: 'all-known' | 'explicit', set: Set<alias> }

Helpers: isToolVisible, computeVisibleLeaves, computeTotalLeaves,
selectAll, clear, toggleCategory, toggleTool. Disabled-child-click
behavior (auto-enable master + check child) lives in toggleTool."
```

---

## Task 5: Rewrite `Filters.tsx`

**Files:**
- Modify: `packages/dashboard/src/components/Timeline/Filters.tsx` (full rewrite)
- Modify: `packages/dashboard/src/components/Timeline/Filters.test.tsx` (full rewrite)

- [ ] **Step 5.1: Rewrite `Filters.test.tsx` with the new model's failing tests**

REPLACE the contents of `packages/dashboard/src/components/Timeline/Filters.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AgentDetailTokensByTool } from '../../data/types.js';
import { Filters } from './Filters.js';
import { defaultTimelineFilterState, type TimelineFilterState } from './filter-state.js';

const bucket = (output: number) => ({ input: 0, output, cacheCreation: 0, cacheRead: 0 });
const rows: AgentDetailTokensByTool[] = [
  { tool: 'Bash', tokens: bucket(12_600_000), totalTokens: 12_600_000 },
  { tool: 'Edit', tokens: bucket(3_400_000), totalTokens: 3_400_000 },
  { tool: 'mcp__atlassian__jira_get_issue', tokens: bucket(400_000), totalTokens: 400_000 },
  { tool: 'mcp__atlassian__jira_transition_issue', tokens: bucket(200_000), totalTokens: 200_000 },
  { tool: 'mcp__plugin_figma_figma__use_figma', tokens: bucket(309_000), totalTokens: 309_000 },
];

describe('Filters (inclusion-tree)', () => {
  it('opens the popover and shows the seven categories', async () => {
    render(<Filters state={defaultTimelineFilterState} onChange={() => {}} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    for (const label of ['Conversation', 'Tools', 'Thinking', 'Hooks', 'Skills', 'System', 'Startup']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('Tools row shows "5 / 5" count and a right-chevron when collapsed', async () => {
    render(<Filters state={defaultTimelineFilterState} onChange={() => {}} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    const toolsRow = screen.getByTestId('filter-row-tools');
    expect(toolsRow).toHaveTextContent('5 / 5');
    // Sub-tree children hidden by default
    expect(screen.queryByLabelText('Bash')).toBeNull();
  });

  it('clicking the Tools chevron expands the alias subtree', async () => {
    render(<Filters state={defaultTimelineFilterState} onChange={() => {}} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    await userEvent.click(screen.getByTestId('tools-disclosure'));
    for (const a of ['Bash', 'Edit', 'MCP:Jira', 'MCP:Figma']) {
      expect(screen.getByLabelText(a)).toBeInTheDocument();
    }
  });

  it('badge hidden when visible === total (Select all just clicked)', async () => {
    const everythingState: TimelineFilterState = {
      categories: new Set(['conversation', 'tools', 'thinking', 'hooks', 'skills', 'system', 'startup']),
      tools: { mode: 'all-known', set: new Set() },
    };
    render(<Filters state={everythingState} onChange={() => {}} tokensByTool={rows} />);
    expect(screen.queryByTestId('filters-badge')).toBeNull();
  });

  it('badge shows visible/total in default state', () => {
    render(<Filters state={defaultTimelineFilterState} onChange={() => {}} tokensByTool={rows} />);
    // Default: conv + tools + startup categories ON, tools all-known with 5 aliases
    // Visible = 2 (conv + startup) + 5 (tools) = 7; Total = 6 + 5 = 11
    expect(screen.getByTestId('filters-badge')).toHaveTextContent('7 / 11');
  });

  it('clicking a category leaf calls onChange with toggled state', async () => {
    const onChange = vi.fn<(s: TimelineFilterState) => void>();
    render(<Filters state={defaultTimelineFilterState} onChange={onChange} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    await userEvent.click(screen.getByLabelText('Thinking'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].categories.has('thinking')).toBe(true);
  });

  it('clicking Select all puts state into the all-checked all-known shape', async () => {
    const onChange = vi.fn<(s: TimelineFilterState) => void>();
    render(<Filters state={defaultTimelineFilterState} onChange={onChange} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    await userEvent.click(screen.getByRole('button', { name: /select all/i }));
    const next = onChange.mock.calls[0]![0];
    expect(next.categories.size).toBe(7);
    expect(next.tools.mode).toBe('all-known');
    expect(next.tools.set.size).toBe(0);
  });

  it('clicking Clear puts state into empty-categories explicit-empty-tools', async () => {
    const onChange = vi.fn<(s: TimelineFilterState) => void>();
    render(<Filters state={defaultTimelineFilterState} onChange={onChange} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    await userEvent.click(screen.getByRole('button', { name: /clear/i }));
    const next = onChange.mock.calls[0]![0];
    expect(next.categories.size).toBe(0);
    expect(next.tools.mode).toBe('explicit');
  });

  it('clicking a disabled-looking tool child (master off) auto-enables master AND checks child', async () => {
    const onChange = vi.fn<(s: TimelineFilterState) => void>();
    const master_off: TimelineFilterState = {
      categories: new Set(['conversation']),  // tools NOT in set
      tools: { mode: 'explicit', set: new Set() },
    };
    render(<Filters state={master_off} onChange={onChange} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    await userEvent.click(screen.getByTestId('tools-disclosure'));
    await userEvent.click(screen.getByLabelText('Bash'));
    const next = onChange.mock.calls[0]![0];
    expect(next.categories.has('tools')).toBe(true);
    expect(next.tools.set.has('Bash')).toBe(true);
  });

  it('renders alias-aggregated tool rows in descending order', async () => {
    render(<Filters state={defaultTimelineFilterState} onChange={() => {}} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    await userEvent.click(screen.getByTestId('tools-disclosure'));
    const inputs = document.querySelectorAll('input[id^="filter-tool-"]');
    expect(Array.from(inputs).map((el) => el.id)).toEqual([
      'filter-tool-Bash',
      'filter-tool-Edit',
      'filter-tool-MCP:Jira',
      'filter-tool-MCP:Figma',
    ]);
  });

  it('empty tokensByTool: subtree expansion shows an empty-state hint', async () => {
    render(<Filters state={defaultTimelineFilterState} onChange={() => {}} tokensByTool={[]} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    await userEvent.click(screen.getByTestId('tools-disclosure'));
    expect(screen.getByText(/no tool usage yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5.2: Run tests to verify they fail**

Run: `npm --workspace crew-dashboard test -- Filters.test`
Expected: FAIL — `Filters.tsx` is still the old impl.

- [ ] **Step 5.3: Rewrite `Filters.tsx`**

REPLACE the contents of `packages/dashboard/src/components/Timeline/Filters.tsx`:

```tsx
import { ChevronDown, ChevronRight, Filter } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { AgentDetailTokensByTool } from '../../data/types.js';
import { aggregateByAlias } from '../../format/tool-alias.js';
import { Button } from '../ui/button.js';
import { Checkbox } from '../ui/checkbox.js';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.js';
import { CATEGORIES, type CategoryId } from './eventClassification.js';
import {
  clear,
  computeTotalLeaves,
  computeVisibleLeaves,
  isToolVisible,
  selectAll,
  toggleCategory,
  toggleTool,
  type TimelineFilterState,
} from './filter-state.js';

interface FiltersProps {
  state: TimelineFilterState;
  onChange: (next: TimelineFilterState) => void;
  tokensByTool: AgentDetailTokensByTool[];
}

export function Filters({ state, onChange, tokensByTool }: FiltersProps) {
  const [open, setOpen] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(false);

  const aliasRows = useMemo(
    () =>
      aggregateByAlias(
        tokensByTool.map(({ tool, totalTokens }) => ({ tool, tokens: totalTokens })),
      ).map((row) => ({
        ...row,
        title: `${row.alias} (${row.raw.join(', ')})`,
      })),
    [tokensByTool],
  );
  const knownAliases = useMemo(() => aliasRows.map((r) => r.alias), [aliasRows]);

  const visible = computeVisibleLeaves(state, knownAliases);
  const total = computeTotalLeaves(knownAliases);
  const showBadge = visible < total;

  // Per-section count for the Tools parent row
  const toolsChecked = state.categories.has('tools');
  const visibleToolCount = toolsChecked
    ? knownAliases.filter((a) => isToolVisible(a, state.tools)).length
    : 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          color="idle"
          intensity="mid"
          size="sm"
          icon={<Filter aria-hidden />}
          aria-label="Open timeline filters"
        >
          <span>Filters</span>
          {showBadge && (
            <span
              data-testid="filters-badge"
              className="ml-1 inline-flex h-4 items-center justify-center rounded-full bg-foreground/15 px-1.5 font-mono text-[10px] leading-none text-foreground"
            >
              {visible} / {total}
            </span>
          )}
          <ChevronDown aria-hidden className="ml-0.5 size-3.5 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="flex flex-col">
          <PopoverHeader
            onSelectAll={() => onChange(selectAll(state))}
            onClear={() => onChange(clear(state))}
          />
          <div className="border-t border-border" />
          <div className="flex flex-col gap-0.5 p-2">
            {CATEGORIES.map((c) =>
              c.id === 'tools' ? (
                <ToolsParentRow
                  key="tools"
                  checked={toolsChecked}
                  expanded={toolsExpanded}
                  onToggleExpanded={() => setToolsExpanded((e) => !e)}
                  onToggleChecked={() => onChange(toggleCategory(state, 'tools'))}
                  visibleCount={visibleToolCount}
                  totalCount={knownAliases.length}
                />
              ) : (
                <FilterRow
                  key={c.id}
                  id={`filter-cat-${c.id}`}
                  label={c.label}
                  checked={state.categories.has(c.id)}
                  onToggle={() => onChange(toggleCategory(state, c.id))}
                />
              ),
            )}
            {toolsExpanded && (
              <ToolsSubtree
                aliasRows={aliasRows}
                state={state}
                knownAliases={knownAliases}
                onChange={onChange}
                masterOn={toolsChecked}
              />
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface PopoverHeaderProps {
  onSelectAll: () => void;
  onClear: () => void;
}
function PopoverHeader({ onSelectAll, onClear }: PopoverHeaderProps) {
  return (
    <div className="flex items-center gap-1 px-3 py-2.5">
      <p className="flex-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        Filters
      </p>
      <Button color="idle" intensity="ghost" size="xs" onClick={onSelectAll}>
        Select all
      </Button>
      <Button color="idle" intensity="ghost" size="xs" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}

interface FilterRowProps {
  id: string;
  label: string;
  title?: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  indent?: boolean;
}
function FilterRow({ id, label, title, checked, disabled, onToggle, indent }: FilterRowProps) {
  return (
    <label
      htmlFor={id}
      title={title}
      className={`flex cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 text-sm text-foreground hover:bg-accent ${
        indent ? 'pl-7 pr-2' : 'px-2'
      } ${disabled ? 'opacity-35' : ''}`}
    >
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={() => onToggle()} />
      <span className="font-mono text-xs">{label}</span>
    </label>
  );
}

interface ToolsParentRowProps {
  checked: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleChecked: () => void;
  visibleCount: number;
  totalCount: number;
}
function ToolsParentRow({
  checked, expanded, onToggleExpanded, onToggleChecked, visibleCount, totalCount,
}: ToolsParentRowProps) {
  return (
    <div
      data-testid="filter-row-tools"
      className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent"
    >
      <Checkbox id="filter-cat-tools" checked={checked} onCheckedChange={() => onToggleChecked()} />
      <label htmlFor="filter-cat-tools" className="flex-1 cursor-pointer select-none font-mono text-xs">
        Tools
      </label>
      <span className="font-mono text-[10px] text-muted-foreground">
        {visibleCount} / {totalCount}
      </span>
      <button
        type="button"
        data-testid="tools-disclosure"
        aria-label={expanded ? 'Collapse tools' : 'Expand tools'}
        onClick={onToggleExpanded}
        className="grid size-4 place-items-center text-muted-foreground hover:text-foreground"
      >
        {expanded ? <ChevronDown className="size-3" aria-hidden /> : <ChevronRight className="size-3" aria-hidden />}
      </button>
    </div>
  );
}

interface ToolsSubtreeProps {
  aliasRows: Array<{ alias: string; raw: string[]; tokens: number; title: string }>;
  state: TimelineFilterState;
  knownAliases: string[];
  onChange: (next: TimelineFilterState) => void;
  masterOn: boolean;
}
function ToolsSubtree({ aliasRows, state, knownAliases, onChange, masterOn }: ToolsSubtreeProps) {
  if (aliasRows.length === 0) {
    return (
      <p className="px-7 py-1.5 font-mono text-xs italic text-muted-foreground">
        No tool usage yet.
      </p>
    );
  }
  return (
    <>
      {aliasRows.map((row) => (
        <FilterRow
          key={row.alias}
          id={`filter-tool-${row.alias}`}
          label={row.alias}
          title={row.title}
          checked={masterOn ? isToolVisible(row.alias, state.tools) : false}
          disabled={!masterOn}
          indent
          onToggle={() => onChange(toggleTool(state, row.alias, knownAliases))}
        />
      ))}
    </>
  );
}
```

- [ ] **Step 5.4: Run tests to verify they pass**

Run: `npm --workspace crew-dashboard test -- Filters.test filter-state.test eventClassification.test`
Expected: All PASS.

- [ ] **Step 5.5: Commit**

```bash
git add packages/dashboard/src/components/Timeline/Filters.tsx \
        packages/dashboard/src/components/Timeline/Filters.test.tsx
git commit -m "feat(dashboard): inclusion-tree filter popover (Filters.tsx rewrite)

Replace the asymmetric two-tier popover with a single inclusion tree.
- All checkboxes positive (checked = visible)
- Tools row is the parent of an inline-collapsible alias subtree
- Tools master switch unchecked → children render in disabled state
- Select all / Clear bulk controls in the popover header
- Trigger badge shows visible/total (hidden when visible === total)
- Click a disabled child → master flips on and child checks (one click)"
```

---

## Task 6: Wire `Timeline.tsx` to the new model

**Files:**
- Modify: `packages/dashboard/src/components/Timeline/Timeline.tsx`
- Modify: `packages/dashboard/src/components/Timeline/Timeline.test.tsx` (if existing references the old state shape)

- [ ] **Step 6.1: Write a regression test for the tool_result orphan fix**

Append to `packages/dashboard/src/components/Timeline/Timeline.test.tsx` (or create the file if missing — follow the existing test scaffold):

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Timeline } from './Timeline.js';

// Test data: one tool_use event + its matching tool_result event for MCP:Jira.
// Filter state excludes MCP:Jira tool. Expected: BOTH events hidden (today's
// bug: only the tool_use is hidden; the tool_result still renders).

// Mock useTimeline / useStateHistory via the React Query client wrapper used
// by other Timeline tests — see Timeline.test.tsx existing scaffold for the
// wrapAndProvideTimeline helper. Use it to feed the events below.

const events = [
  {
    type: 'assistant',
    uuid: 'a1',
    message: {
      content: [
        { type: 'tool_use', id: 'tu1', name: 'mcp__atlassian__jira_get_issue', input: {} },
      ],
    },
  },
  {
    type: 'user',
    uuid: 'u1',
    message: {
      content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'ok' }],
    },
  },
];

it('regression: tool_result events filter out alongside their tool_use', async () => {
  // (Adapt to the existing scaffold — render Timeline with the events above,
  // open Filters, expand Tools, uncheck MCP:Jira, assert that BOTH 'a1' and
  // 'u1' rows are removed from the timeline body.)
});
```

If `Timeline.test.tsx` does not yet exist, write a minimal version that mocks the React Query queries — see existing patterns in `packages/dashboard/src/components/AgentRow.test.tsx` or `packages/dashboard/src/routes/ProjectDetailPage.test.tsx` for the wrap pattern.

- [ ] **Step 6.2: Run test to verify it fails**

Run: `npm --workspace crew-dashboard test -- Timeline.test`
Expected: FAIL — the `u1` tool_result row still renders even after MCP:Jira is unchecked (because `Timeline.tsx` passes an empty `toolNameById` map from Task 3).

- [ ] **Step 6.3: Wire the real `toolNameById` map + new state**

In `packages/dashboard/src/components/Timeline/Timeline.tsx`:

1. Change the import from `./Filters.js`:

```ts
import { Filters } from './Filters.js';
import { defaultTimelineFilterState, isToolVisible, type TimelineFilterState } from './filter-state.js';
```

2. Change the `useState` (around line 63):

```ts
const [filterState, setFilterState] = useState<TimelineFilterState>(() => defaultTimelineFilterState);
```

3. Build `toolNameById` memoized off `events` (alongside the existing useMemo blocks, around line 71):

```ts
import { buildToolNameMap, eventCategories, eventOneLiner, eventToolAliases, isDroppedEvent } from './eventClassification.js';

const toolNameById = useMemo(() => buildToolNameMap(events), [events]);
```

4. Replace `matchesFilters` (around line 354) with the new shape:

```ts
function matchesFilters(
  event: TranscriptEvent,
  state: TimelineFilterState,
  toolNameById: ReadonlyMap<string, string>,
  needle: string,
): boolean {
  const cats = eventCategories(event);
  let categoryMatch = false;
  for (const c of cats) {
    if (state.categories.has(c)) { categoryMatch = true; break; }
  }
  if (!categoryMatch) return false;

  if (cats.has('tools') && state.categories.has('tools')) {
    const aliases = eventToolAliases(event, toolNameById);
    if (aliases.length > 0) {
      let anyVisible = false;
      for (const a of aliases) {
        if (isToolVisible(a, state.tools)) { anyVisible = true; break; }
      }
      if (!anyVisible) return false;
    }
  }

  if (needle && !eventOneLiner(event).toLowerCase().includes(needle)) return false;
  return true;
}
```

5. Update the `filteredEvents` useMemo (around line 75) to pass `toolNameById`:

```ts
const filteredEvents = useMemo(() => {
  const needle = deferredSearch.trim().toLowerCase();
  return events.filter((evt) => matchesFilters(evt, filterState, toolNameById, needle));
}, [events, filterState, toolNameById, deferredSearch]);
```

- [ ] **Step 6.4: Run tests + typecheck + lint**

```bash
npm --workspace crew-dashboard test
npm --workspace crew-dashboard run typecheck
npm --workspace crew-dashboard run lint
```

Expected: All green. Regression test from Step 6.1 passes.

- [ ] **Step 6.5: Commit**

```bash
git add packages/dashboard/src/components/Timeline/Timeline.tsx \
        packages/dashboard/src/components/Timeline/Timeline.test.tsx
git commit -m "feat(dashboard): wire Timeline to new filter state + toolNameById

- TimelineFilterState replaces the old categories/excludedTools shape
- toolNameById map built once per events change via buildToolNameMap
- matchesFilters consults the map so tool_result events filter out with
  their tool_use (orphan fix)"
```

---

## Task 7: E2E coverage for the four canonical states

**Files:**
- Modify or create: `packages/dashboard/tests/e2e/agent-drawer.spec.ts` (extend if exists; create otherwise — confirm with `git -C ... ls-files packages/dashboard/tests/e2e/`)

- [ ] **Step 7.1: Add a Playwright spec for the four states**

Append to `packages/dashboard/tests/e2e/agent-drawer.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('Timeline filters — inclusion tree', () => {
  test('default state renders 7/11 badge and Tools row shows 5/5', async ({ page }) => {
    await page.goto('/projects/seed-project/agents/seed-agent');
    await page.getByRole('button', { name: /open timeline filters/i }).click();
    await expect(page.getByTestId('filters-badge')).toHaveText('7 / 11');
    await expect(page.getByTestId('filter-row-tools')).toContainText('5 / 5');
  });

  test('expanding Tools shows alias children', async ({ page }) => {
    await page.goto('/projects/seed-project/agents/seed-agent');
    await page.getByRole('button', { name: /open timeline filters/i }).click();
    await page.getByTestId('tools-disclosure').click();
    for (const a of ['Bash', 'Edit', 'MCP:Jira', 'MCP:Figma']) {
      await expect(page.getByLabel(a)).toBeVisible();
    }
  });

  test('unchecking MCP:Jira removes its tool_use AND tool_result rows', async ({ page }) => {
    await page.goto('/projects/seed-project/agents/seed-agent');
    await page.getByRole('button', { name: /open timeline filters/i }).click();
    await page.getByTestId('tools-disclosure').click();
    const beforeCount = await page.getByTestId('transcript-row').count();
    await page.getByLabel('MCP:Jira').click();
    await page.waitForTimeout(150);
    const afterCount = await page.getByTestId('transcript-row').count();
    expect(afterCount).toBeLessThan(beforeCount);
    // Specific assertion against the seed (depends on the seed having a
    // matched tool_use/tool_result pair for MCP:Jira)
    await expect(page.locator('[data-event-tool="MCP:Jira"]')).toHaveCount(0);
  });

  test('Tools master OFF disables children visually', async ({ page }) => {
    await page.goto('/projects/seed-project/agents/seed-agent');
    await page.getByRole('button', { name: /open timeline filters/i }).click();
    await page.getByTestId('tools-disclosure').click();
    await page.getByLabel('Tools').click();  // uncheck master
    const bashRow = page.getByLabel('Bash');
    await expect(bashRow).toBeDisabled();
  });
});
```

Confirm the seed fixture (`packages/daemon/seeds/dev.ts`) emits at least one matched `tool_use`/`tool_result` pair for `MCP:Jira` — if it doesn't, add one in the same commit. The current seed already has tool calls; verify with:

```bash
grep -n "tool_use\|tool_result\|MCP\|mcp__" packages/daemon/seeds/dev.ts | head -20
```

If the seed is light on tool events, add fixtures rather than fake them in the test.

- [ ] **Step 7.2: Run the e2e spec**

```bash
npm --workspace crew-dashboard run test:e2e -- agent-drawer.spec
```

Expected: All four cases PASS. Adjust selectors only if existing tests use a different convention (`data-testid="transcript-row"` is the convention per `TranscriptRow.tsx`).

- [ ] **Step 7.3: Commit**

```bash
git add packages/dashboard/tests/e2e/agent-drawer.spec.ts \
        packages/daemon/seeds/dev.ts  # if seed updated
git commit -m "test(e2e): Timeline filter inclusion-tree canonical states

- Default 7/11 + Tools 5/5
- Tools-expanded reveals alias children
- Unchecking MCP:Jira drops both tool_use and tool_result rows (regression)
- Tools master OFF disables child checkboxes"
```

---

## Task 8: Verification — gate skills + visual fidelity

- [ ] **Step 8.1: Run the full workspace verification**

```bash
npm --workspace crew-dashboard run lint
npm --workspace crew-dashboard run typecheck
npm --workspace crew-dashboard run test
npm --workspace crew-dashboard run test:e2e
```

All green. Fix anything red before proceeding.

- [ ] **Step 8.2: Run `agents-doc-parity-check`**

Per repo gate. The change touches `packages/dashboard/src/components/Timeline/**` and `packages/dashboard/src/components/ui/**`. Check whether `.agents/design-system.md`, `.agents/architecture.md`, or any other `.agents/<topic>.md` covers these paths — if so, update them to reflect the Checkbox composite addition and the new filter model.

- [ ] **Step 8.3: Run `visual-fidelity-check`**

Per repo gate. Compare the rendered Filters popover against the Figma reference node `665:864`. Iterate until each of the four canonical states matches.

- [ ] **Step 8.4: Final commit (if doc changes are needed)**

```bash
git add .agents/<changed>.md  # whichever updated
git commit -m "docs(agents): timeline filter rework + Checkbox composite parity"
```

- [ ] **Step 8.5: Push branch + open PR**

```bash
git -C /home/safturento/Repos/crew/.planning-worktrees/timeline-filter-rework \
  push -u origin docs/timeline-filter-rework-spec
```

Then open a PR via `gh pr create` referencing the spec + the new Epic ticket once filed.

---

## Self-review (post-write)

**Spec coverage:**
- Slim 7 categories → Task 2 ✓
- Tools subtree as inclusion tree → Task 5 ✓
- Master-switch behavior → Task 5 (UI), Task 4 (state helper) ✓
- New-tool defaults (all-known vs explicit) → Task 4 (toggleTool snapshots known-minus-this) ✓
- `visible / total` badge → Task 5 ✓
- Disabled-child auto-enable → Task 4 (toggleTool) + Task 5 (test) ✓
- `tool_result` orphan fix → Task 3 (helpers) + Task 6 (wire to Timeline.tsx) ✓
- New Checkbox composite → Task 1 (code), Figma version already built ✓
- Hooks/Skills split → Task 2 ✓
- Startup category → Task 2 ✓
- Bulk Select all / Clear → Task 4 + Task 5 ✓
- Testing → Tasks 1, 2, 3, 4, 5, 6, 7 ✓
- Visual fidelity vs Figma → Task 8 ✓

**Placeholder scan:** None of "TBD", "TODO", "implement later", "add appropriate error handling". The Playwright test at Step 7.1 has a comment "Adapt to the existing scaffold" — that's because the existing test file's wrap helper must be reused; the engineer follows the existing pattern. Acceptable.

**Type consistency:** `TimelineFilterState`, `ToolsMode`, `CategoryId`, `Checkbox`, `eventToolAliases`, `buildToolNameMap`, `isToolVisible`, `computeVisibleLeaves`, `computeTotalLeaves`, `selectAll`, `clear`, `toggleCategory`, `toggleTool` — all defined in Tasks 1-4 and referenced consistently in Tasks 5-6.
