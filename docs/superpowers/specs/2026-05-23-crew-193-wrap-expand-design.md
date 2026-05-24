# CREW-193 — Multi-line wrap + expansion control for TranscriptRow

**Ticket:** [CREW-193](https://safturento.atlassian.net/browse/CREW-193)
**Epic:** [CREW-189](https://safturento.atlassian.net/browse/CREW-189)
**Date:** 2026-05-23

## Goal

Replace single-line ellipsis truncation in TranscriptRow's oneliner with 3-line wrap. Show an expand chevron when content is longer or structured (JSON), making "there's more to see" discoverable. Cap the expanded payload at ~300px tall with internal scroll so a 1000-line tool_result doesn't make a single row ten screens tall.

## Non-goals

- **Drag-to-scrub or other resize affordances on the expanded block.** Fixed cap, internal scroll.
- **Syntax highlighting / pretty-formatting beyond existing `prettyJson`.** Existing `pre` rendering stays.
- **Modal / side drawer expansion.** Inline only.
- **Per-block-type expansion behavior (different rendering for tool_use vs tool_result vs attachment).** All use the same `pre` block.

## Design decisions (brainstormed 2026-05-23)

| Q | Decision |
|---|---|
| Wrap | `line-clamp-3` + `whitespace-normal` on the oneliner span. Beyond 3 lines, ellipsis takes over inside the line-clamp. |
| Chevron trigger | Show when (a) `scrollHeight > clientHeight` on the oneliner (overflow), OR (b) `blockType ∈ {tool_use, tool_result, attachment, system}` (structured). |
| Chevron position | Right of the meta column, after the timestamp/tokens. |
| Chevron color | Uses the row's tag color from CREW-192 palette (`text-{toolColor}-300` or `text-muted-foreground` fallback if CREW-192 hasn't landed). |
| Click target | Whole row remains clickable (existing behavior). Chevron is a visual affordance only. |
| Expansion cap | Inline `<pre>` rendered with `max-h-[300px] overflow-y-auto` so huge payloads scroll inside the row. |
| Expansion footprint | Inline (pushes other rows down by ≤ 300px + padding). Snap, no animation. |

## Architecture

### Overflow detection hook

New `useIsClamped(ref, openState)` that returns whether the referenced element's `scrollHeight > clientHeight` (i.e. line-clamp has clipped content). Re-runs on resize. When `openState === true`, returns `true` unconditionally (since the line-clamp is irrelevant in expanded state — caller uses overflow flag only for chevron visibility decision).

Lives in `packages/dashboard/src/components/Timeline/useIsClamped.ts` (or fold into TranscriptRow.tsx as a local hook if simpler).

```ts
function useIsClamped(ref: RefObject<HTMLElement | null>): boolean {
  const [clamped, setClamped] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setClamped(el.scrollHeight > el.clientHeight + 1);  // +1 for sub-pixel safety
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return clamped;
}
```

### `Row` component refactor

In `TranscriptRow.tsx`, the `Row` component:

```tsx
function Row({ spec }: { spec: RowSpec }) {
  const [open, setOpen] = useState(false);
  const onelinerRef = useRef<HTMLSpanElement>(null);
  const isClamped = useIsClamped(onelinerRef);
  const isStructured = STRUCTURED_BLOCK_TYPES.has(spec.blockType);
  const showChevron = isClamped || isStructured;

  const color = spec.tone === 'error' ? 'error' : CATEGORY_COLOR[spec.category];
  // (after CREW-192: also support spec.toolColor)

  return (
    <div data-testid="transcript-row" ...>
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} ...>
        <Tag ...>{spec.tagLabel}</Tag>
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
        {meta && <span data-testid="transcript-row-meta" ...>{meta}</span>}
        {showChevron && (
          <span
            data-testid="transcript-row-chevron"
            aria-hidden
            className="shrink-0 text-muted-foreground"  // CREW-192 will swap to per-tool color
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </span>
        )}
      </button>
      {open && (
        <pre
          data-testid="transcript-row-expanded"
          className="mx-2.5 mb-2 max-h-[300px] overflow-y-auto rounded-sm bg-black/30 p-2 text-xs whitespace-pre-wrap text-foreground"
        >
          {spec.expanded}
        </pre>
      )}
    </div>
  );
}

const STRUCTURED_BLOCK_TYPES: ReadonlySet<RowSpec['blockType']> = new Set([
  'tool_use', 'tool_result', 'attachment', 'system',
]);
```

Key differences from current:
- `truncate` → `line-clamp-3 whitespace-normal`
- Add `onelinerRef` + `useIsClamped` hook
- Add chevron conditional render
- Expanded pre gets `max-h-[300px] overflow-y-auto`

### CREW-192 integration

When CREW-192 lands, the chevron color picks up `spec.toolColor` if present:

```tsx
const chevronColorClass = spec.tone === 'error'
  ? 'text-red-300'
  : spec.toolColor
    ? TOOL_COLOR_CLASSES[spec.toolColor].text
    : 'text-muted-foreground';
```

Until then, fallback to `text-muted-foreground` (specified inline in the snippet above). Soft dependency — D can ship without C if needed.

## Testing

`TranscriptRow.test.tsx` additions:

```tsx
it('wraps the oneliner to 3 lines (no truncate)', () => {
  const event = makeAssistantEvent({ blocks: [{ type: 'text', text: 'a very long text that would normally truncate at 80 chars and beyond' }] });
  render(<TranscriptRow event={event} />);
  const text = screen.getByTestId('transcript-row-text');
  expect(text.className).toContain('line-clamp-3');
  expect(text.className).not.toContain('truncate');
});

it('shows a chevron for structured blocks (tool_use) even if oneliner fits', () => {
  const event = makeAssistantEvent({ blocks: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] });
  render(<TranscriptRow event={event} />);
  expect(screen.getByTestId('transcript-row-chevron')).toBeInTheDocument();
});

it('shows a chevron for long text blocks via overflow detection', () => {
  // Mocking scrollHeight > clientHeight in jsdom requires manual setup; alternative:
  // assert the chevron renders when useIsClamped returns true via a wrapper that mocks the hook.
  // See test setup below.
});

it('does not show a chevron for short text blocks', () => {
  const event = makeAssistantEvent({ blocks: [{ type: 'text', text: 'short' }] });
  render(<TranscriptRow event={event} />);
  // jsdom scrollHeight === clientHeight for short content → no overflow → no chevron
  expect(screen.queryByTestId('transcript-row-chevron')).not.toBeInTheDocument();
});

it('expansion caps at 300px max-height with internal scroll', () => {
  const event = makeAssistantEvent({
    blocks: [{ type: 'tool_use', name: 'Bash', input: { command: 'echo ' + 'x'.repeat(1000) } }],
  });
  render(<TranscriptRow event={event} />);
  fireEvent.click(screen.getByRole('button'));
  const expanded = screen.getByTestId('transcript-row-expanded');
  expect(expanded.className).toMatch(/max-h-\[300px\]/);
  expect(expanded.className).toContain('overflow-y-auto');
});

it('clicking the row toggles expansion', () => {
  const event = makeAssistantEvent({ blocks: [{ type: 'tool_use', name: 'Bash', input: {} }] });
  render(<TranscriptRow event={event} />);
  expect(screen.queryByTestId('transcript-row-expanded')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByTestId('transcript-row-expanded')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button'));
  expect(screen.queryByTestId('transcript-row-expanded')).not.toBeInTheDocument();
});
```

**`useIsClamped` test note:** jsdom doesn't compute real layout, so `scrollHeight` / `clientHeight` are stubbed. Tests for overflow detection either (a) mock the hook to return `true`/`false` explicitly, or (b) use a `Object.defineProperty(el, 'scrollHeight', { value: 100 })` style trick. Whatever the existing dashboard test convention uses for similar measurements is fine.

## Out of scope

- Per-block-type styling of the expanded pre (e.g. JSON syntax highlighting).
- A "view in full" link in the expanded block (a way to open the full content elsewhere — modal, side drawer).
- Sticky chevron that floats while user scrolls a long expansion.
- "Auto-expand on first render" for any block type.

## Risks

- **`useIsClamped` perf at scale.** N TranscriptRows each create their own ResizeObserver. For a 200-event timeline that's 200 observers. Acceptable for current scale; revisit if Timeline starts virtualizing (separate ticket).
- **Sub-pixel false negatives.** `scrollHeight > clientHeight` can disagree with `line-clamp` boundary by 1px on certain font metrics. Mitigated by the `+1` slack in the check.
- **Chevron-conditional renders cause layout shift.** Row width changes when chevron toggles in. Mitigated by reserving the chevron's width (always-rendered placeholder div with the chevron's width, conditionally visible via `opacity` instead of `display: none`).

  Actually simpler: just always reserve space via `flex` with the chevron always laid out but with `visibility: hidden` when not needed. Net DOM size is identical; no layout shift on overflow change.

  ```tsx
  <span
    data-testid="transcript-row-chevron"
    aria-hidden
    className={cn(
      'shrink-0 text-muted-foreground',
      !showChevron && 'invisible',
    )}
  >
    {open ? <ChevronDown ... /> : <ChevronRight ... />}
  </span>
  ```
