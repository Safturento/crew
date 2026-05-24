# CREW-193 — Wrap + expand control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TranscriptRow oneliner wraps to 3 lines via `line-clamp-3`. A chevron appears when the line-clamp activates OR the block is structured (JSON-shaped). Expanded `pre` caps at 300px with internal scroll so huge payloads don't make one row eat the viewport.

**Architecture:** `useIsClamped` hook for `scrollHeight > clientHeight` detection (ResizeObserver-backed). `Row` component conditionally renders chevron + `max-h-[300px]` expanded pre. Reserved-space chevron pattern to avoid layout shift on overflow state change.

**Tech Stack:** React 19 + Tailwind v4 (line-clamp + arbitrary `max-h-[300px]`). lucide-react `ChevronRight` / `ChevronDown`. No new deps.

**Spec:** [`docs/superpowers/specs/2026-05-23-crew-193-wrap-expand-design.md`](../specs/2026-05-23-crew-193-wrap-expand-design.md)
**Ticket:** [CREW-193](https://safturento.atlassian.net/browse/CREW-193) (Epic [CREW-189](https://safturento.atlassian.net/browse/CREW-189), blocked by [CREW-192](https://safturento.atlassian.net/browse/CREW-192) — soft)

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Modify | `packages/dashboard/src/components/Timeline/TranscriptRow.tsx` | `useIsClamped` hook (inline), `Row` chevron + wrap + cap |
| Modify | `packages/dashboard/src/components/Timeline/TranscriptRow.test.tsx` | Wrap, chevron-on-overflow, chevron-on-structured, expansion cap tests |

---

## Task 1: line-clamp + chevron + overflow detection

**Files:**
- Modify: `packages/dashboard/src/components/Timeline/TranscriptRow.tsx`
- Modify: `packages/dashboard/src/components/Timeline/TranscriptRow.test.tsx`

- [ ] **Step 1: Write failing tests**

Add to `TranscriptRow.test.tsx`:

```tsx
import { fireEvent } from '@testing-library/react';

it('replaces truncate with line-clamp-3 on the oneliner', () => {
  const event = makeAssistantEvent({ blocks: [{ type: 'text', text: 'medium length' }] });
  render(<TranscriptRow event={event} />);
  const text = screen.getByTestId('transcript-row-text');
  expect(text.className).toContain('line-clamp-3');
  expect(text.className).toContain('whitespace-normal');
  expect(text.className).not.toContain('truncate');
});

it('renders a chevron for structured blocks (tool_use, tool_result, attachment, system)', () => {
  const cases = [
    { type: 'tool_use', name: 'Bash', input: {} },
    { type: 'tool_result', content: 'output', is_error: false },
    // attachment + system are handled by their own spec helpers — covered separately
  ];
  for (const block of cases) {
    const event = makeAssistantEvent({ blocks: [block] });
    const { container, unmount } = render(<TranscriptRow event={event} />);
    expect(screen.getByTestId('transcript-row-chevron')).toBeInTheDocument();
    unmount();
  }
});

it('chevron is invisible (not removed) for short text blocks to prevent layout shift', () => {
  const event = makeAssistantEvent({ blocks: [{ type: 'text', text: 'short' }] });
  render(<TranscriptRow event={event} />);
  // Chevron always in the DOM (reserved space); class controls visibility
  const chevron = screen.getByTestId('transcript-row-chevron');
  expect(chevron.className).toContain('invisible');
});

it('expansion caps at 300px max-height with internal scroll', () => {
  const event = makeAssistantEvent({
    blocks: [{ type: 'tool_use', name: 'Bash', input: { command: 'x'.repeat(2000) } }],
  });
  render(<TranscriptRow event={event} />);
  fireEvent.click(screen.getByRole('button'));
  const expanded = screen.getByTestId('transcript-row-expanded');
  expect(expanded.className).toMatch(/max-h-\[300px\]/);
  expect(expanded.className).toContain('overflow-y-auto');
});

it('clicking the row toggles open/closed', () => {
  const event = makeAssistantEvent({ blocks: [{ type: 'tool_use', name: 'Bash', input: {} }] });
  render(<TranscriptRow event={event} />);
  expect(screen.queryByTestId('transcript-row-expanded')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByTestId('transcript-row-expanded')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button'));
  expect(screen.queryByTestId('transcript-row-expanded')).not.toBeInTheDocument();
});

it('aria-expanded reflects open state', () => {
  const event = makeAssistantEvent({ blocks: [{ type: 'tool_use', name: 'Bash', input: {} }] });
  render(<TranscriptRow event={event} />);
  const button = screen.getByRole('button');
  expect(button).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(button);
  expect(button).toHaveAttribute('aria-expanded', 'true');
});
```

- [ ] **Step 2: Run to verify fails**

```bash
npm run test:run --workspace=crew-dashboard -- TranscriptRow
```

Expected: FAIL — current `truncate` className, no chevron, no max-h on expanded.

- [ ] **Step 3: Implement changes in `Row` component**

In `TranscriptRow.tsx`, near the imports:

```tsx
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { cn } from '../../lib/utils.js';
```

Add the structured-block set + clamp hook:

```tsx
const STRUCTURED_BLOCK_TYPES: ReadonlySet<RowSpec['blockType']> = new Set([
  'tool_use', 'tool_result', 'attachment', 'system',
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
  }, []);
  return clamped;
}
```

Rewrite the `Row` component:

```tsx
function Row({ spec }: { spec: RowSpec }) {
  const [open, setOpen] = useState(false);
  const onelinerRef = useRef<HTMLSpanElement>(null);
  const isClamped = useIsClamped(onelinerRef);
  const isStructured = STRUCTURED_BLOCK_TYPES.has(spec.blockType);
  const showChevron = isClamped || isStructured;

  const color = spec.tone === 'error' ? 'error' : CATEGORY_COLOR[spec.category];
  const meta = formatMeta(spec.timestamp, spec.tokens);
  const ariaLabel = `${spec.tagLabel} · ${spec.oneLiner}`.trim();

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
        <Tag color={color} intensity="mid" data-testid="transcript-row-tag" className="mt-0.5 shrink-0">
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
        {meta && (
          <span
            data-testid="transcript-row-meta"
            className="mt-0.5 shrink-0 font-mono text-xs text-muted-foreground tabular-nums"
          >
            {meta}
          </span>
        )}
        <span
          data-testid="transcript-row-chevron"
          aria-hidden
          className={cn(
            'mt-0.5 shrink-0 text-muted-foreground',
            !showChevron && 'invisible',
          )}
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </span>
      </button>
      {open && (
        <pre
          data-testid="transcript-row-expanded"
          className="mx-2.5 mb-2 max-h-[300px] overflow-x-auto overflow-y-auto rounded-sm bg-black/30 p-2 text-xs whitespace-pre-wrap text-foreground"
        >
          {spec.expanded}
        </pre>
      )}
    </div>
  );
}
```

Notes:
- `items-start` (was `items-center`) so the chevron + meta + tag align to the top when the oneliner wraps to multiple lines.
- `mt-0.5` on Tag/meta/chevron for fine vertical alignment with the first line of text.
- Chevron always in the DOM with `invisible` class when not needed — prevents layout shift.

- [ ] **Step 4: Re-run tests**

```bash
npm run test:run --workspace=crew-dashboard -- TranscriptRow
```

Expected: PASS (5 new + all existing).

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/Timeline/TranscriptRow.tsx \
        packages/dashboard/src/components/Timeline/TranscriptRow.test.tsx
git commit -m "feat(dashboard): TranscriptRow line-clamp-3 + chevron + 300px expansion cap (CREW-193)

- Oneliner wraps to 3 lines (line-clamp-3 + whitespace-normal) instead
  of single-line truncate.
- Chevron renders when oneliner overflows OR block is structured
  (tool_use, tool_result, attachment, system). Reserved-space pattern
  via `invisible` class avoids layout shift on overflow state change.
- Expanded pre caps at max-h-[300px] with internal scroll so huge
  tool_results don't make a row 10 screens tall.
- useIsClamped hook (inline) uses ResizeObserver to track overflow."
```

---

## Task 2: Optional — wire CREW-192 toolColor into the chevron (after C lands)

**Files:**
- Modify: `packages/dashboard/src/components/Timeline/TranscriptRow.tsx`

If CREW-192 hasn't merged yet, **skip this task entirely**. D's chevron stays at `text-muted-foreground` and passes the spec.

If CREW-192 has merged:

- [ ] **Step 1: Write failing test**

Add to `TranscriptRow.test.tsx`:

```tsx
it('chevron picks up the tool color from CREW-192 palette', () => {
  const event = makeAssistantEvent({
    blocks: [{ type: 'tool_use', name: 'Bash', input: {} }],
  });
  render(<TranscriptRow event={event} />);
  const chevron = screen.getByTestId('transcript-row-chevron');
  expect(chevron.className).toContain('text-amber-300');  // Bash → amber
});

it('chevron stays muted-foreground for non-tool rows', () => {
  const event = makeAssistantEvent({ blocks: [{ type: 'text', text: 'long content '.repeat(50) }] });
  render(<TranscriptRow event={event} />);
  const chevron = screen.getByTestId('transcript-row-chevron');
  expect(chevron.className).toContain('text-muted-foreground');
});
```

- [ ] **Step 2: Run to verify fails**

Expected: FAIL — chevron stays muted regardless of toolColor.

- [ ] **Step 3: Color the chevron**

```tsx
import { TOOL_COLOR_CLASSES } from '../../data/tool-colors.js';

// In Row:
const chevronColorClass = spec.tone === 'error'
  ? 'text-red-300'
  : spec.toolColor
    ? TOOL_COLOR_CLASSES[spec.toolColor].text
    : 'text-muted-foreground';

// In JSX:
<span
  data-testid="transcript-row-chevron"
  aria-hidden
  className={cn('mt-0.5 shrink-0', chevronColorClass, !showChevron && 'invisible')}
>
  {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
</span>
```

- [ ] **Step 4: Re-run**

```bash
npm run test:run --workspace=crew-dashboard -- TranscriptRow
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/Timeline/TranscriptRow.tsx \
        packages/dashboard/src/components/Timeline/TranscriptRow.test.tsx
git commit -m "feat(dashboard): chevron color follows CREW-192 tool palette (CREW-193)"
```

---

## Task 3: Final verification

- [ ] `npm run lint` — green
- [ ] `npm run typecheck` — green
- [ ] `npm run test:run --workspace=crew-dashboard` — green
- [ ] Visual smoke: navigate to CREW-102 fixture; confirm:
  - Multi-line oneliner content wraps to 3 lines visibly.
  - Chevron present for tool_use/tool_result rows.
  - Chevron absent (invisible-class) for short text rows.
  - Click on any row reveals the expanded pre.
  - Big payloads scroll inside the 300px box.
- [ ] `visual-fidelity-check` against CREW-102 (light pass — expected 0 high, 0-1 medium).

PR title: `feat(dashboard): TranscriptRow wrap + expansion control (CREW-193)`
