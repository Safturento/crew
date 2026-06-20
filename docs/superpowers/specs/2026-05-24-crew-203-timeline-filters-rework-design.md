# Timeline Filters Rework — Inclusion-tree popover

**Ticket:** TBD — to be filed under a new Epic for Timeline filtering & event classification (sibling of CREW-189 polish, post-CREW-187 cleanup)
**Date:** 2026-05-24
**Figma:** [Crew Dashboard / Composites — node `665:864` "Brainstorm — Timeline Filter Rework (Option B)"](https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=665-864)

## Goal

Replace the current two-tier filter dropdown in the drawer Timeline (`packages/dashboard/src/components/Timeline/Filters.tsx`, shipped in CREW-187) with a single inclusion-tree popover whose mental model is consistent across all rows. Fix four user-reported defects in the existing UX and one classification bug that hides events from filtering entirely.

**Defects being addressed:**

1. **Asymmetric semantics.** Categories use positive checkboxes (checked = in `categories` Set); Tools uses inverted checkboxes (checked = NOT in `excludedTools` Set). Same checkbox, opposite mental models.
2. **No "Select all" / "Clear" affordance.** Bulk operations require N clicks.
3. **Incoherent badge count.** Badge = `countDivergences(categories, excludedTools)` — number of category toggles relative to the (mixed-default) "Slim 5" plus `excludedTools.size`. Turning Thinking ON (was off-by-default) and turning Conversation OFF (was on-by-default) both register as `+1`, even though one widens and the other narrows. The number is not a count of anything the user can name.
4. **Tools feel like a separate system.** They're conceptually a *subset* of the Tools category, but the UI presents them as a peer section with their own header. There is no visible relationship between "I unchecked Tools" and "I unchecked Bash".
5. **`tool_result` events orphaned from per-tool filtering.** `eventCategories` correctly tags them as `tools`, but `eventToolNames` walks only `assistant.tool_use` blocks (`eventClassification.ts:170-184`). `user.tool_result` blocks carry only `tool_use_id`, not the tool name. Consequence: when you exclude `MCP:Jira` specifically, all `MCP:Jira` *call* events vanish but every *result* event of those calls is still rendered, because the filter doesn't know they belong to that tool.

CREW-201 adds a new family of `type: 'system'` events with `crew_startup_*` subtypes; today's catch-all `system` category would bury them in the same bucket as low-signal hooks. The rework adds a dedicated `startup` category.

## Non-goals

- **No filter expression language.** Inclusion checkboxes only — no AND/OR, no regex on event content, no per-section "show only".
- **No filter persistence across sessions.** State is in-memory per drawer open. localStorage / per-agent stickiness is a follow-up.
- **No surface change.** The filter remains a popover anchored to a trigger button in the sticky toolbar. No sidebar, no detached panel.
- **No retroactive renaming of existing categories.** Slim 5 → Slim 7 is purely additive (split Hooks/Skills, add Startup) — no labels change.
- **No re-classification of attachment subtypes that aren't being split.** The `HOOKS_AND_SKILLS_ATTACHMENTS` set in `eventClassification.ts` partitions cleanly between hooks and skills already; we use that partition.
- **No Checkbox composite expansion beyond what the popover needs.** `state ∈ {on, off, disabled}` + `Label` text prop. No size variants, no `intermediate` state, no leading-icon slot.

## Design decisions

| Q | Decision |
|---|---|
| Mental model | **Inclusion tree.** Every checkbox is positive: checked = visible. Empty selection = nothing visible. Children narrow their parent's category. |
| Tools parent behavior | **Master switch + explicit children.** Tools unchecked → no tool events ever, regardless of child state. Tools checked + zero children checked → still zero tool events. Tools checked + some children → only those tools. Children render in `state=disabled` (dim, no checkmark) while parent is off. |
| New-tool defaults | **Auto-checked while filter is in `'all-known'` mode.** Tool state is `{ mode: 'all-known' | 'explicit', set: Set<string> }`. `all-known` means every currently-discovered alias is visible; new aliases auto-join. The first explicit uncheck flips mode to `'explicit'` and snapshots the current alias list minus the unchecked one into `set`. New aliases default *unchecked* in `'explicit'` mode. `Select all` → `'all-known'`. `Clear` → `'explicit'` with empty set. |
| Badge format | **`visible / total`** — count of effectively-checked leaves over total known leaves. Hidden when `visible === total`. Displayed in the trigger button after the "Filters" label (e.g. `Filters  7 / 11`). |
| Taxonomy | **Slim 7:** `conversation`, `tools`, `thinking`, `hooks`, `skills`, `system`, `startup`. Only `tools` has a subtree (tool aliases). |
| Disabled-child click | **Auto-enable parent + check child.** A click on a `state=disabled` tool row reads as "I want this tool on," which obviously requires the parent on. The single click does both: flip Tools master switch on, transition to `'explicit'` mode with this alias in the set. |

## Architecture

### UI surface

`Filters.tsx` becomes a single inclusion-tree popover. Trigger button uses the existing `Pill` `type=button-sm, color=idle, intensity=mid, font=sans` with the lucide `Filter` icon + dynamic label. Popover contents:

```
┌─────────────────────────────────────┐
│ FILTERS              [Select all] [Clear]    ← popover header
├─────────────────────────────────────┤
│ ☑ Conversation                       │
│ ☑ Tools                  5 / 5  ▾   │   ← parent row, count + chevron
│   ☑ Bash                             │   ← child rows, 28px indent
│   ☑ Edit                             │
│   ☑ Read                             │
│   ☑ MCP:Jira                         │
│   ☑ MCP:Figma                        │
│ ☑ Thinking                           │
│ ☑ Hooks                              │
│ ☑ Skills                             │
│ ☑ System                             │
│ ☑ Startup                            │
└─────────────────────────────────────┘
```

Trigger button states:
- All checked → `[icon] Filters` (no badge).
- Anything unchecked → `[icon] Filters  X / Y`.

### New DS composite — Checkbox

Lives on the `Composites` page in the Crew Dashboard Figma file, next to `Switch`. Already built during brainstorm:

- `COMPONENT_SET` `Checkbox`, variant axis `state` ∈ `{on, off, disabled}`.
- TEXT property `Label` (default `"Label"`).
- 14×14 box: `state=on` filled with `foreground` token + check glyph in `background`; `state=off` outlined with `border`; `state=disabled` outlined + 35% opacity on the whole instance.
- Label is mono `12px`, fills bound to `foreground`.

Ships in this rework's PR alongside the `Filters.tsx` rewrite. A code counterpart (`packages/dashboard/src/components/ui/checkbox.tsx`) is added that mirrors the Figma variant set. Built with Radix UI's `@radix-ui/react-checkbox` primitive to match the existing UI library patterns (`packages/dashboard/src/components/ui/*` already uses Radix for `popover`, `dialog`, etc.).

### State shape

```ts
// packages/dashboard/src/components/Timeline/Filters.tsx
export type CategoryId =
  | 'conversation'
  | 'tools'
  | 'thinking'
  | 'hooks'
  | 'skills'
  | 'system'
  | 'startup';

export type ToolsMode = 'all-known' | 'explicit';

export interface TimelineFilterState {
  /** Positive selection: a category is visible iff it's in this set. */
  categories: ReadonlySet<CategoryId>;
  /**
   * Tools subset. `mode === 'all-known'` means every alias discovered up to
   * this moment is visible; new aliases auto-join. `mode === 'explicit'`
   * means only the aliases in `set` are visible; new aliases default
   * unchecked. Toggling Tools master switch OFF does NOT change this
   * struct — it's the `categories.has('tools')` predicate that gates whether
   * tool events render at all. Master-switch OFF therefore preserves the
   * user's prior selection for restoration when they switch it back ON.
   */
  tools: { mode: ToolsMode; set: ReadonlySet<string> };
}

export const defaultTimelineFilterState: TimelineFilterState = {
  categories: new Set(CATEGORIES.filter(c => c.defaultVisible).map(c => c.id)),
  tools: { mode: 'all-known', set: new Set() },
};
```

`CATEGORIES` becomes:

```ts
export const CATEGORIES = [
  { id: 'conversation', label: 'Conversation', defaultVisible: true },
  { id: 'tools',        label: 'Tools',        defaultVisible: true },
  { id: 'thinking',     label: 'Thinking',     defaultVisible: false },
  { id: 'hooks',        label: 'Hooks',        defaultVisible: false },
  { id: 'skills',       label: 'Skills',       defaultVisible: false },
  { id: 'system',       label: 'System',       defaultVisible: false },
  { id: 'startup',      label: 'Startup',      defaultVisible: true  },
] as const;
```

`startup` defaults to visible — startup events are useful signal, not noise. The other defaults match today.

### Filter evaluation — `matchesFilters`

```ts
function matchesFilters(
  event: TranscriptEvent,
  state: TimelineFilterState,
  toolNameById: ReadonlyMap<string, string>, // tool_use_id → tool name (built per render)
  needle: string,
): boolean {
  const cats = eventCategories(event);

  // Category gate
  let categoryMatch = false;
  for (const c of cats) {
    if (state.categories.has(c)) { categoryMatch = true; break; }
  }
  if (!categoryMatch) return false;

  // Tools subtree gate — only applies if 'tools' is in selected categories AND
  // the event carries tool aliases
  if (cats.has('tools') && state.categories.has('tools')) {
    const aliases = eventToolAliases(event, toolNameById); // see classification rewrite below
    if (aliases.length > 0) {
      // For the event to pass, AT LEAST ONE alias must be visible
      let anyVisible = false;
      for (const a of aliases) {
        if (isToolVisible(a, state.tools)) { anyVisible = true; break; }
      }
      if (!anyVisible) return false;
    }
  }

  // Search needle (unchanged)
  if (needle && !eventOneLiner(event).toLowerCase().includes(needle)) return false;

  return true;
}

function isToolVisible(alias: string, t: TimelineFilterState['tools']): boolean {
  if (t.mode === 'all-known') return true;
  return t.set.has(alias);
}
```

The `toolNameById` map is rebuilt per `events` change (memoized): walk every `assistant.tool_use` block, record `block.id → block.name`. This is the fix for the `tool_result`-orphan defect.

### Event classification rewrite — `eventClassification.ts`

Two changes:

1. **Split `hooks-and-skills` into `hooks` and `skills`.** The existing `HOOKS_AND_SKILLS_ATTACHMENTS` set partitions cleanly along the `hook_*` / `skill_*` / "other" subtype-prefix lines. New buckets:
   ```ts
   const HOOK_ATTACHMENTS = new Set([
     'hook_success', 'hook_additional_context', 'hook_system_message',
     'hook_non_blocking_error', 'hook_cancelled', 'async_hook_response',
   ]);
   const SKILL_ATTACHMENTS = new Set([
     'skill_listing', 'invoked_skills',
   ]);
   // The remaining attachments stay in 'system'.
   ```

2. **New `eventToolAliases(event, toolNameById)` helper.** Replaces today's `eventToolNames`. For `assistant` events, walks `tool_use` blocks (same as today, but also applies `toolAlias()` to normalize MCP variants into single aliases). For `user` events, walks `tool_result` blocks and resolves `block.tool_use_id` via `toolNameById`, then applies `toolAlias()`. Returns a flat list of alias strings. Empty list = event has no tool linkage.

3. **`startup` category.** A new branch in `eventCategories`: if `event.type === 'system'` and `event.subtype` starts with `'crew_startup_'`, return `Set(['startup'])`. Falls through to today's `'system'` for everything else.

`isDroppedEvent` is unchanged.

### Component layout

The popover content is roughly:

```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button color="idle" intensity="mid" size="sm" icon={<Filter />}>
      Filters
      {visibleCount < totalLeaves && <span>{visibleCount} / {totalLeaves}</span>}
    </Button>
  </PopoverTrigger>
  <PopoverContent>
    <FilterPopoverHeader onSelectAll={…} onClear={…} />
    <FilterTree state={state} onChange={…} toolAliases={…} />
  </PopoverContent>
</Popover>
```

`FilterTree` is one component that walks `CATEGORIES` and emits one `FilterRow` per category, with an inline-expandable Tools subtree. State is a single `TimelineFilterState`; mutations go through a reducer-style helper (`toggleCategory`, `toggleTool`, `selectAll`, `clearAll`, `expandTools`, `collapseTools`).

### Bulk operations

- **Select all**: `categories ← all CATEGORIES.ids`; `tools ← { mode: 'all-known', set: new Set() }`. Visible badge becomes equal to total → hides.
- **Clear**: `categories ← new Set()`; `tools ← { mode: 'explicit', set: new Set() }`. Visible badge becomes `0 / N`. Empty-state ("No events match your filters") is shown in the body.

Both controls operate on the entire tree. There are no per-section "All" / "Clear" controls — the global controls are enough, and per-section would double the affordance density without proportional value.

## Default state & invariants

- On first popover open after agent load: `defaultTimelineFilterState`.
- "Default state" = `categories` matches `CATEGORIES.filter(defaultVisible)` ∧ `tools.mode === 'all-known'` ∧ `tools.set.size === 0`. Default state does NOT show all leaves (Thinking/Hooks/Skills/System are off-by-default), so the badge IS visible in default state — that's intentional and signals "you're not seeing everything" right out of the gate.
- Badge hidden iff `visible === total` (everything is showing). This is true after `Select all`, never true in default state.
- The trigger button's icon is the lucide `Filter` icon (Figma component `565:577`) in all states.
- `FilterEmptyState` ("No events match your filters") is rendered when `categories.size === 0` OR (`!categories.has('tools')` ∧ all other categories produce zero matching events) — i.e. whenever the post-filter event list is empty.

## Edge cases

| Case | Behavior |
|---|---|
| New tool alias appears mid-session, `tools.mode === 'all-known'` | Auto-visible. No state change needed — `isToolVisible` returns true for any alias when in `'all-known'`. Total-leaf count silently increments. |
| New tool alias appears mid-session, `tools.mode === 'explicit'` | Defaults unchecked. Shows up in the subtree as `state=off` (or `state=disabled` if Tools master is off). Total-leaf count increments; visible-leaf count doesn't. Badge updates from `7 / 11` → `7 / 12`. |
| User clicks a `state=disabled` tool row (Tools master off) | Single click flips Tools master ON, transitions `tools.mode → 'explicit'`, adds the clicked alias to `tools.set`. Children re-render in their normal `state=on/off` representation. |
| User clicks `Clear`, then clicks Conversation back on | `categories` only has `'conversation'`. Tools master is off. Visible leaves = 1. Badge `1 / N`. |
| User unchecks `tools` master, then `Select all` | `Select all` restores `categories` (all 7 including Tools) AND `tools.mode → 'all-known'` (clearing any prior explicit set). Effectively resets the entire popover. |
| Tools subtree is expanded, then `Clear` | Subtree stays expanded (the `expanded` flag is local UI state, not part of `TimelineFilterState`). User sees all 5 children render as `state=off`. |
| Agent has zero tool usage so far (alias list empty) | Tools row shows `0 / 0` (or `—`); subtree is empty when expanded. Tools master can still be toggled; toggling off has no observable effect because there's nothing to hide. |
| `agent.tokens_by_tool` arrives after first popover open | Aliases derived from it append to the local known-alias list. Per the all-known/explicit rule above, they auto-appear in `all-known` mode or default unchecked in `explicit`. |

## Visual reference

The Figma brainstorm node `665:864` ("Brainstorm — Timeline Filter Rework (Option B)") on the `Composites` page shows four canonical states side by side:

1. **Default · everything on.** Trigger = "Filters" (no badge). Tools subtree collapsed.
2. **Tools expanded · all on.** Chevron rotates `▾`; five alias children indented.
3. **Narrowed · 7 / 11.** Bash + MCP:Figma off; Thinking + System off; Tools shows `3 / 5 ▾`; trigger shows `Filters  7 / 11`.
4. **Tools off · children disabled.** Master switch unchecked; children in `state=disabled`; Tools shows `0 / 5 ▾`; trigger shows `Filters  6 / 11`.

These are the four states the implementation should reproduce verbatim. Visual-fidelity check is required pre-merge.

## Testing

| Layer | Coverage |
|---|---|
| `Filters.tsx` unit tests | Open popover. Click each leaf — verify `onChange` emits expected `TimelineFilterState`. Click `Select all` from a narrowed state — verify it lands on default. Click `Clear` — verify `categories` empty and `tools.mode === 'explicit'`. Click a tool row while Tools master is off — verify the single-click auto-enable behavior. New-alias-arrival simulation (re-render with expanded `tokensByTool`) in both modes. |
| `matchesFilters` unit tests | Cover all category combos × tool-mode combos. Specifically: an event with a `tool_result` block whose `tool_use_id` resolves to an unchecked alias must be filtered out (the orphan-fix regression test). An event with mixed content (text + tool_use) must classify into multiple categories and pass if any selected. |
| `eventClassification` unit tests | The hooks/skills split — every attachment subtype lands in the right bucket. `crew_startup_*` subtypes land in `'startup'`. Other `system` subtypes still land in `'system'`. `eventToolAliases` returns the right thing for `assistant.tool_use`, for `user.tool_result` with a resolvable id, and for `user.tool_result` with an unresolvable id (fall back to empty so the event isn't accidentally hidden). |
| `Checkbox` composite tests | Render with each `state`, label override. |
| E2E Playwright | Open drawer. Open Filters. Toggle the four canonical states. Verify visible event count matches expectation against a seed-fixed transcript. |

The current `Filters.test.tsx` tests should be rewritten — they describe the old asymmetric-checkbox model and no longer apply.

## Migration / rollout

- The `Filters.tsx` rewrite is a single PR. State shape changes are internal to the component + helpers in `eventClassification.ts`; no API change to consumers (`Timeline.tsx` just passes through `TimelineFilterState`). No daemon changes. No migration.
- The new Checkbox composite (Figma + `ui/checkbox.tsx` + Radix dep) is part of the same PR.
- `defaultVisibleCategorySet` export is retained as a derived getter from the new `CATEGORIES` array; tests import it. No rename.
- No feature flag — the new UX is a strict improvement over the current one with no behavioral overlap during transition.

## Out of scope (potential follow-ups)

- **Filter persistence** — sticky preferences across drawer opens, per-project or per-agent. Worth a small ticket once we have multi-agent usage data.
- **"Recent" smart group** — a transient pseudo-category showing only events from the last N seconds while live mode is on. Different concern (temporal vs taxonomic); deferred.
- **Search-and-filter interplay** — when search needle is set, should filters still apply, or should search be a wider net? Today they compose AND; this rework keeps that semantics. Worth revisiting.
- **Tool subtrees for Hooks & Skills.** Once skill invocations and hook firings are tracked individually (they aren't today), the same parent-with-children pattern could apply. Not now.
- **Per-section "All" / "Clear" inside the Tools subtree.** Could be useful with 20+ aliases. Deferred until we see real long-run sessions complaining about it.
