# CREW-192 — Per-tool color palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 14 tools + 1 default render with distinct Tailwind colors via a new `toolColor` Pill prop. Non-tool category rows + error overrides unchanged.

**Architecture:** New `data/tool-colors.ts` mirrors `data/state-meta.ts`'s `STATE_CLASSES` shape. `pill-variants.ts` grows a tool-color branch in `pillSurfaceClasses`. Pill / Tag / Badge gain optional `toolColor?: ToolColorKey` prop. `Timeline/event-palette.ts` maps aliased tool names → tool-color keys. TranscriptRow's tool_use branch threads `toolColor` through to the Tag.

**Tech Stack:** TypeScript + Tailwind v4. No new deps.

**Spec:** [`docs/superpowers/specs/2026-05-23-crew-192-tool-palette-design.md`](../specs/2026-05-23-crew-192-tool-palette-design.md)
**Ticket:** [CREW-192](https://safturento.atlassian.net/browse/CREW-192) (Epic [CREW-189](https://safturento.atlassian.net/browse/CREW-189), blocks [CREW-193](https://safturento.atlassian.net/browse/CREW-193))

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `packages/dashboard/src/data/tool-colors.ts` | `TOOL_COLOR_CLASSES` map + `ToolColorKey` type |
| Create | `packages/dashboard/src/data/tool-colors.test.ts` | Coverage of all 15 entries + class string format |
| Modify | `packages/dashboard/src/lib/pill-variants.ts` | `pillSurfaceClasses` accepts `toolColor`; precedence over `color` |
| Modify | `packages/dashboard/src/components/ui/pill-base.tsx` | Forward `toolColor` prop |
| Modify | `packages/dashboard/src/components/ui/badge.tsx`, `button.tsx`, `tag.tsx` | Accept + pass through `toolColor` |
| Modify | `packages/dashboard/src/components/ui/pill-base.test.tsx` | New `toolColor` cases |
| Create | `packages/dashboard/src/components/Timeline/event-palette.ts` | `colorForTool(aliasedName)` map |
| Create | `packages/dashboard/src/components/Timeline/event-palette.test.ts` | Lookup + fallback tests |
| Modify | `packages/dashboard/src/components/Timeline/TranscriptRow.tsx` | Add `toolColor` to `RowSpec`; populate in tool_use branch; thread to `<Tag>` in Row |
| Modify | `packages/dashboard/src/components/Timeline/TranscriptRow.test.tsx` | Assert tool_use Tag receives correct toolColor |
| Modify | `.agents/design-system.md` | Register `tool-colors.ts` data module |

---

## Task 1: `TOOL_COLOR_CLASSES` module + tests

**Files:**
- Create: `packages/dashboard/src/data/tool-colors.ts`
- Create: `packages/dashboard/src/data/tool-colors.test.ts`

- [ ] **Step 1: Write failing tests**

`tool-colors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { TOOL_COLOR_CLASSES, type ToolColorKey } from './tool-colors.js';

const EXPECTED_KEYS: ToolColorKey[] = [
  'bash', 'edit', 'read', 'write', 'grep', 'todoWrite', 'task',
  'mcpJira', 'mcpFigma', 'mcpChrome', 'mcpPlaywright',
  'mcpMemory', 'mcpAtlassian', 'webNet', 'default',
];

describe('TOOL_COLOR_CLASSES', () => {
  it('has all 15 expected keys', () => {
    expect(Object.keys(TOOL_COLOR_CLASSES).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it('every entry has text/bg/border/solidBg/solidBorder fields', () => {
    for (const key of EXPECTED_KEYS) {
      const entry = TOOL_COLOR_CLASSES[key];
      expect(entry.text).toBeTruthy();
      expect(entry.bg).toBeTruthy();
      expect(entry.border).toBeTruthy();
      expect(entry.solidBg).toBeTruthy();
      expect(entry.solidBorder).toBeTruthy();
    }
  });

  it('uses static Tailwind class strings (JIT-discoverable)', () => {
    // Each class string starts with a known Tailwind utility prefix —
    // ensures we're not building runtime template strings the JIT misses.
    const all = Object.values(TOOL_COLOR_CLASSES).flatMap((e) =>
      [e.text, e.bg, e.border, e.solidBg, e.solidBorder]
    );
    for (const cls of all) {
      expect(cls).toMatch(/^(text-|bg-|border-)/);
    }
  });

  it('mcpJira and mcpAtlassian share blue (per palette decision)', () => {
    expect(TOOL_COLOR_CLASSES.mcpJira.text).toBe(TOOL_COLOR_CLASSES.mcpAtlassian.text);
    expect(TOOL_COLOR_CLASSES.mcpJira.border).toBe(TOOL_COLOR_CLASSES.mcpAtlassian.border);
  });
});
```

- [ ] **Step 2: Run to verify fails**

```bash
npm run test:run --workspace=crew-dashboard -- tool-colors
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

`tool-colors.ts`:

(Copy the table from the spec verbatim. See spec for the full 15-entry literal.)

- [ ] **Step 4: Re-run tests**

```bash
npm run test:run --workspace=crew-dashboard -- tool-colors
```

Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/data/tool-colors.ts \
        packages/dashboard/src/data/tool-colors.test.ts
git commit -m "feat(dashboard): TOOL_COLOR_CLASSES — 15-entry tool color palette (CREW-192)

Mirrors STATE_CLASSES shape (text/bg/border/solidBg/solidBorder per
key). Tailwind class strings are static literals so JIT picks them up.
mcpJira and mcpAtlassian intentionally share blue (vendor cluster)."
```

---

## Task 2: Pill anatomy — `toolColor` prop on pill-variants + pill-base

**Files:**
- Modify: `packages/dashboard/src/lib/pill-variants.ts`
- Modify: `packages/dashboard/src/components/ui/pill-base.tsx`
- Modify: `packages/dashboard/src/components/ui/pill-base.test.tsx`

- [ ] **Step 1: Write failing pill-base tests**

Add to `pill-base.test.tsx`:

```tsx
it('applies tool-color classes when toolColor is set', () => {
  const { container } = render(
    <PillBase as="span" toolColor="bash" intensity="mid" shape="">test</PillBase>,
  );
  const el = container.firstChild as HTMLElement;
  expect(el.className).toContain('text-amber-300');
  expect(el.className).toContain('border-amber-500');
});

it('toolColor takes precedence over color when both are passed', () => {
  const { container } = render(
    <PillBase as="span" color="running" toolColor="bash" intensity="mid" shape="">test</PillBase>,
  );
  const el = container.firstChild as HTMLElement;
  // Amber wins (toolColor); blue (running) should be absent
  expect(el.className).toContain('text-amber-300');
  expect(el.className).not.toContain('text-blue');
});

it('default toolColor falls back to slate (the unknown bucket)', () => {
  const { container } = render(
    <PillBase as="span" toolColor="default" intensity="mid" shape="">test</PillBase>,
  );
  const el = container.firstChild as HTMLElement;
  expect(el.className).toContain('text-slate-400');
});
```

- [ ] **Step 2: Run to verify fails**

```bash
npm run test:run --workspace=crew-dashboard -- pill-base
```

Expected: FAIL — `toolColor` prop doesn't exist.

- [ ] **Step 3: Extend `pillSurfaceClasses`**

In `lib/pill-variants.ts`:

```ts
import { TOOL_COLOR_CLASSES, type ToolColorKey } from '../data/tool-colors.js';

export function pillSurfaceClasses(
  color: PillColor | undefined,
  intensity: PillIntensity = 'mid',
  toolColor?: ToolColorKey,
): string {
  const classes = toolColor
    ? TOOL_COLOR_CLASSES[toolColor]
    : STATE_CLASSES[color ?? 'running'];
  return mapIntensityToClasses(classes, intensity);
}
```

In `components/ui/pill-base.tsx`:

```tsx
type PillBaseProps = {
  color?: PillColor;
  toolColor?: ToolColorKey;
  intensity?: PillIntensity;
  // existing props (asChild, shape, icon, children, ...)
};

function PillBase({ color, toolColor, intensity = 'mid', shape, icon, children, ...rest }: PillBaseProps) {
  const surfaceClasses = pillSurfaceClasses(color, intensity, toolColor);
  // ... existing render, with surfaceClasses included in className
}
```

- [ ] **Step 4: Re-run tests**

```bash
npm run test:run --workspace=crew-dashboard -- pill-base
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/lib/pill-variants.ts \
        packages/dashboard/src/components/ui/pill-base.tsx \
        packages/dashboard/src/components/ui/pill-base.test.tsx
git commit -m "feat(dashboard): Pill toolColor prop — tool-color rendering parallel to state colors (CREW-192)

pillSurfaceClasses gains a toolColor branch that looks up
TOOL_COLOR_CLASSES instead of STATE_CLASSES. toolColor takes precedence
if both color + toolColor are passed; existing color consumers
unchanged. PillBase forwards toolColor through to the surface helper."
```

---

## Task 3: Propagate `toolColor` through Tag (and Badge / Button if needed)

**Files:**
- Modify: `packages/dashboard/src/components/ui/tag.tsx`
- Modify: `packages/dashboard/src/components/ui/badge.tsx` (only if you want tool-color badges in some future call site; otherwise leave)
- Modify: `packages/dashboard/src/components/ui/button.tsx` (same conditional)

- [ ] **Step 1: Write failing Tag test**

Add to `tag.test.tsx` (or create if missing):

```tsx
it('forwards toolColor to the pill base', () => {
  const { container } = render(
    <Tag toolColor="grep" intensity="mid">findall</Tag>,
  );
  const el = container.firstChild as HTMLElement;
  expect(el.className).toContain('text-violet-300');
});
```

- [ ] **Step 2: Run to verify fails**

```bash
npm run test:run --workspace=crew-dashboard -- tag
```

Expected: FAIL — `toolColor` not accepted.

- [ ] **Step 3: Add `toolColor` to Tag's prop type and forward**

```tsx
type TagProps = Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'> & {
  color?: PillColor;
  toolColor?: ToolColorKey;
  intensity?: PillIntensity;
  // existing
};

function Tag({ color, toolColor, intensity = 'mid', children, ...rest }: TagProps) {
  return (
    <PillBase {...rest} as="span" color={color} toolColor={toolColor} intensity={intensity} shape={TAG_SHAPE}>
      {children}
    </PillBase>
  );
}
```

(Skip Badge / Button forwarding for now — no consumers need them. Leave the door open via PillBase already supporting it.)

- [ ] **Step 4: Re-run**

```bash
npm run test:run --workspace=crew-dashboard -- tag
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/ui/tag.tsx \
        packages/dashboard/src/components/ui/tag.test.tsx
git commit -m "feat(dashboard): Tag accepts toolColor prop (CREW-192)

Forwards to PillBase. Badge and Button left untouched — no consumers
need tool colors there yet; Pill arch supports them when needed."
```

---

## Task 4: `event-palette.ts` — alias → ToolColorKey lookup

**Files:**
- Create: `packages/dashboard/src/components/Timeline/event-palette.ts`
- Create: `packages/dashboard/src/components/Timeline/event-palette.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';

import { colorForTool } from './event-palette.js';

describe('colorForTool', () => {
  it('returns the correct ToolColorKey for known tools', () => {
    expect(colorForTool('Bash')).toBe('bash');
    expect(colorForTool('Edit')).toBe('edit');
    expect(colorForTool('Read')).toBe('read');
    expect(colorForTool('Write')).toBe('write');
    expect(colorForTool('Grep')).toBe('grep');
    expect(colorForTool('TodoWrite')).toBe('todoWrite');
    expect(colorForTool('Task')).toBe('task');
    expect(colorForTool('MCP:Jira')).toBe('mcpJira');
    expect(colorForTool('MCP:Figma')).toBe('mcpFigma');
    expect(colorForTool('MCP:Chrome')).toBe('mcpChrome');
    expect(colorForTool('MCP:Playwright')).toBe('mcpPlaywright');
    expect(colorForTool('MCP:Memory')).toBe('mcpMemory');
    expect(colorForTool('MCP:Atlassian')).toBe('mcpAtlassian');
    expect(colorForTool('WebFetch')).toBe('webNet');
    expect(colorForTool('WebSearch')).toBe('webNet');
  });

  it('returns "default" for unknown tools', () => {
    expect(colorForTool('SomeFutureTool')).toBe('default');
    expect(colorForTool('')).toBe('default');
  });
});
```

- [ ] **Step 2: Run to verify fails**

```bash
npm run test:run --workspace=crew-dashboard -- event-palette
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`event-palette.ts` (per spec § Architecture):

```ts
import { type ToolColorKey } from '../../data/tool-colors.js';

const TOOL_COLOR_MAP: Record<string, ToolColorKey> = {
  Bash: 'bash',
  Edit: 'edit',
  Read: 'read',
  Write: 'write',
  Grep: 'grep',
  TodoWrite: 'todoWrite',
  Task: 'task',
  'MCP:Jira': 'mcpJira',
  'MCP:Figma': 'mcpFigma',
  'MCP:Chrome': 'mcpChrome',
  'MCP:Playwright': 'mcpPlaywright',
  'MCP:Memory': 'mcpMemory',
  'MCP:Atlassian': 'mcpAtlassian',
  WebFetch: 'webNet',
  WebSearch: 'webNet',
};

export function colorForTool(aliasedName: string): ToolColorKey {
  return TOOL_COLOR_MAP[aliasedName] ?? 'default';
}
```

- [ ] **Step 4: Re-run**

```bash
npm run test:run --workspace=crew-dashboard -- event-palette
```

Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/Timeline/event-palette.ts \
        packages/dashboard/src/components/Timeline/event-palette.test.ts
git commit -m "feat(dashboard): event-palette — alias-name to tool-color lookup (CREW-192)

Maps the 14 known tool aliases to ToolColorKey entries; unknown tools
fall back to 'default' (slate-muted). WebFetch and WebSearch share
the 'webNet' (lime) key."
```

---

## Task 5: Wire `toolColor` into TranscriptRow's tool_use branch

**Files:**
- Modify: `packages/dashboard/src/components/Timeline/TranscriptRow.tsx`
- Modify: `packages/dashboard/src/components/Timeline/TranscriptRow.test.tsx`

- [ ] **Step 1: Write failing tests**

Add to `TranscriptRow.test.tsx`:

```tsx
it('renders tool_use rows with their tool color', () => {
  const event = makeAssistantEvent({
    blocks: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }],
  });
  render(<TranscriptRow event={event} />);
  const tag = screen.getByTestId('transcript-row-tag');
  expect(tag.className).toContain('text-amber-300');
});

it('aliased MCP tool gets the MCP family color', () => {
  const event = makeAssistantEvent({
    blocks: [{ type: 'tool_use', name: 'mcp__atlassian__jira_get_issue', input: {} }],
  });
  render(<TranscriptRow event={event} />);
  const tag = screen.getByTestId('transcript-row-tag');
  expect(tag.className).toContain('text-blue-300');  // MCP:Jira → blue
});

it('error tool_result still renders red regardless of tool color', () => {
  const event = makeUserEvent({
    blocks: [{ type: 'tool_result', is_error: true, content: 'oops' }],
  });
  render(<TranscriptRow event={event} />);
  const tag = screen.getByTestId('transcript-row-tag');
  // Red wins (the error CATEGORY_COLOR override)
  expect(tag.className).toContain('text-red');
});

it('non-tool rows keep their category color', () => {
  const event = makeAssistantEvent({
    blocks: [{ type: 'text', text: 'hi' }],
  });
  render(<TranscriptRow event={event} />);
  const tag = screen.getByTestId('transcript-row-tag');
  expect(tag.className).not.toContain('amber');
});
```

- [ ] **Step 2: Run to verify fails**

```bash
npm run test:run --workspace=crew-dashboard -- TranscriptRow
```

Expected: FAIL — tool_use tag still uses the flat `waiting` (amber) category color, but in a way that doesn't differentiate Bash from Edit etc.

- [ ] **Step 3: Add `toolColor` to `RowSpec` + populate + thread through Row**

```tsx
import { colorForTool } from './event-palette.js';
import { toolAlias } from '../../format/tool-alias.js';
import type { ToolColorKey } from '../../data/tool-colors.js';

interface RowSpec {
  // existing fields
  toolColor?: ToolColorKey;
}

// In specForAssistantBlock, tool_use branch:
if (isToolUse(block)) {
  const alias = toolAlias(block.name);
  const summary = summarizeToolInput(block.input);
  return {
    blockType: 'tool_use',
    category: 'tools',
    tone: 'default',
    tagLabel: alias,
    toolColor: colorForTool(alias),  // ← NEW
    oneLiner: truncate(summary),
    timestamp: event.timestamp,
    tokens,
    expanded: prettyJson(block.input),
  };
}

// In Row component:
function Row({ spec }: { spec: RowSpec }) {
  const [open, setOpen] = useState(false);
  const tagProps = spec.tone === 'error'
    ? { color: 'error' as const }
    : spec.toolColor
      ? { toolColor: spec.toolColor }
      : { color: CATEGORY_COLOR[spec.category] };
  // ...
  return (
    <div ...>
      <button ...>
        <Tag {...tagProps} intensity="mid" data-testid="transcript-row-tag">
          {spec.tagLabel}
        </Tag>
        {/* existing */}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Re-run**

```bash
npm run test:run --workspace=crew-dashboard -- TranscriptRow
```

Expected: PASS (4 new + all existing).

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/Timeline/TranscriptRow.tsx \
        packages/dashboard/src/components/Timeline/TranscriptRow.test.tsx
git commit -m "feat(dashboard): TranscriptRow renders tool_use Tag with per-tool color (CREW-192)

RowSpec gains optional toolColor; specForAssistantBlock's tool_use
branch populates it via colorForTool(alias). Row component threads
either color (state/category), toolColor (tool), or error override
into <Tag>. Non-tool rows + error rows unchanged."
```

---

## Task 6: Doc registration + visual fidelity

**Files:**
- Modify: `.agents/design-system.md`
- Create: `docs/visual-fidelity-reports/CREW-192.md`

- [ ] **Step 1: Register `tool-colors` data module**

In `.agents/design-system.md`, find the section listing data modules (alongside `state-meta.ts`). Add an entry for `tool-colors.ts` describing it as "non-state tool palette mirroring STATE_CLASSES shape, used by Pill `toolColor` prop." Bump `last_updated`.

- [ ] **Step 2: Visual smoke**

Run the dashboard locally. Navigate to CREW-102 fixture. Confirm tool rows in the Timeline render distinct colors per the palette. Compare against the Figma palette preview (`figma node 643:859`).

- [ ] **Step 3: `visual-fidelity-check` skill**

Run against CREW-102 fixture. Expected: 0 high / 0-1 medium findings. Report at `docs/visual-fidelity-reports/CREW-192.md`.

- [ ] **Step 4: Commit**

```bash
git add .agents/design-system.md docs/visual-fidelity-reports/CREW-192.md
git commit -m "docs(crew-192): register tool-colors data module + visual-fidelity report"
```

## Final checklist

- [ ] `npm run lint` green
- [ ] `npm run format:check` green
- [ ] `npm run typecheck` green
- [ ] `npm run test:run` green
- [ ] `npm run build --workspace=crew-dashboard` produces a clean bundle (verifies JIT picked up all TOOL_COLOR_CLASSES strings)
- [ ] `agents-doc-parity-check` skill clean
- [ ] `visual-fidelity-check` report at `docs/visual-fidelity-reports/CREW-192.md` (0 high)

PR title: `feat(dashboard): per-tool color palette inside Tools category (CREW-192)`
