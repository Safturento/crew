# Drawer Sticky Headers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin a condensed agent header and the timeline filter/search toolbar to the top of the agent drawer (and full-page view) while the body scrolls as a single container.

**Architecture:** The drawer body (`AgentBody`) becomes the single scroll container. A new `CondensedHeader` overlays the top once the full `DrawerHeader` scrolls out of view (IntersectionObserver sentinel); `TimelineToolbar` becomes `position: sticky` below it. The timeline's inner scroll viewport is removed, and its three scroll consumers (live-mode autoscroll, minimap section-jump, minimap viewport sizing) are repointed at the outer container via a `scrollContainerRef` prop.

**Tech Stack:** React 18, Tailwind, Vitest + React Testing Library (jsdom), existing `Badge`/`Button`/`StateIcon` primitives. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-09-drawer-sticky-headers-design.md`. Figma source of truth: `CondensedHeader` composite (node `706:1059`) and pinned-state mockup (node `707:1044`) on the Composites page of the Crew file `9FeJPriqdsdA4n9R5Xsrr8`.

**File map:**

| File | Change |
| --- | --- |
| `packages/dashboard/src/components/AgentBody.tsx` | Single scroll container, sentinel, condensed-header overlay |
| `packages/dashboard/src/components/AgentBody.test.tsx` | New — sentinel/overlay behavior |
| `packages/dashboard/src/components/CondensedHeader.tsx` | New component |
| `packages/dashboard/src/components/CondensedHeader.test.tsx` | New — content + close gating |
| `packages/dashboard/src/components/CondensedHeader.figma.tsx` | New — inert Code Connect doc |
| `packages/dashboard/src/components/Timeline/Timeline.tsx` | Sticky toolbar, viewport removal, ref repointing |
| `packages/dashboard/src/components/Timeline/Timeline.test.tsx` | Updated structure/scroll tests |
| `packages/dashboard/src/index.css` | `condensed-in` keyframe |
| `packages/dashboard/src/test/setup.ts` | IntersectionObserver noop stub |

---

### Task 1: Scroll-container baseline

The two one-line changes from the 2026-06-08 session (handed over as an uncommitted working-tree diff; re-derived here so this plan is self-contained).

**Files:**
- Modify: `packages/dashboard/src/components/AgentBody.tsx:37`
- Modify: `packages/dashboard/src/components/Timeline/Timeline.tsx:205`

- [ ] **Step 1: Make AgentBody the scroll container**

In `AgentBody.tsx`, change the root div:

```tsx
// before
<div data-testid="agent-body" className="flex h-full min-h-0 flex-col">
// after
<div data-testid="agent-body" className="flex h-full min-h-0 flex-col overflow-y-auto">
```

- [ ] **Step 2: Let the timeline grow naturally**

In `Timeline.tsx`, change the component's root div (in the main `return`, not the loading branch):

```tsx
// before
<div className="relative flex h-full min-h-0 flex-col">
// after
<div className="relative flex min-h-0 flex-col">
```

- [ ] **Step 3: Run the dashboard test suite**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: PASS (these changes don't break the existing structure tests — the timeline's inner viewport still exists at this point).

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/components/AgentBody.tsx packages/dashboard/src/components/Timeline/Timeline.tsx
git commit -m "feat(dashboard): drawer body scrolls as a single container"
```

---

### Task 2: CondensedHeader component

**Files:**
- Create: `packages/dashboard/src/components/CondensedHeader.tsx`
- Create: `packages/dashboard/src/components/CondensedHeader.test.tsx`
- Create: `packages/dashboard/src/components/CondensedHeader.figma.tsx`
- Modify: `packages/dashboard/src/index.css`

- [ ] **Step 1: Write the failing test**

`CondensedHeader.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CondensedHeader } from './CondensedHeader.js';
import type { AgentDetail } from '../data/types.js';

const DETAIL: AgentDetail = {
  key: 'kanban-api/KAN-23',
  project: 'kanban-api',
  ticket_key: 'KAN-23',
  ticket_title: 'Drag-and-drop reordering keeps stale board state',
  state: 'waiting',
  worktree_path: '~/code/kanban-api/.worktrees/KAN-23',
  pr_url: null,
  app_url: 'http://localhost:7421',
  jira_url: 'https://safturento.atlassian.net/browse/KAN-23',
  tokens_by_tool: [],
  model: '',
  runs: [],
  tokens: { total: 48_000, input: 0, output: 0, cache_read: 0, cache_creation: 0 },
  tool_call_count: 0,
};

describe('CondensedHeader', () => {
  it('renders ticket key, title, and state badge', () => {
    render(<CondensedHeader detail={DETAIL} showCloseButton={false} />);
    expect(screen.getByText('KAN-23')).toBeInTheDocument();
    expect(screen.getByText('Drag-and-drop reordering keeps stale board state')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Waiting' })).toBeInTheDocument();
  });

  it('falls back to the ticket key when there is no title', () => {
    render(
      <CondensedHeader detail={{ ...DETAIL, ticket_title: null }} showCloseButton={false} />,
    );
    expect(screen.getAllByText('KAN-23')).toHaveLength(2);
  });

  it('shows the close button only when showCloseButton is set, and wires onClose', async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <CondensedHeader detail={DETAIL} showCloseButton={false} onClose={onClose} />,
    );
    expect(screen.queryByRole('button', { name: 'Close drawer' })).not.toBeInTheDocument();

    rerender(<CondensedHeader detail={DETAIL} showCloseButton onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

> If `AgentDetail` has gained or lost fields since this plan was written, fix the fixture against `packages/dashboard/src/data/types.ts` — the fixture mirrors the one in `DrawerHeader.figma.tsx`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run --workspace=crew-dashboard -- CondensedHeader`
Expected: FAIL — `Cannot find module './CondensedHeader.js'`

- [ ] **Step 3: Implement the component**

`CondensedHeader.tsx`:

```tsx
import { X } from 'lucide-react';

import { STATE_META } from '../data/state-meta.js';
import type { AgentDetail } from '../data/types.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { StateIcon } from './ui/state-icon.js';

/**
 * Pixel height of the condensed header. Also the sticky `top` offset for the
 * pinned TimelineToolbar — keep in sync with the `h-11` class below.
 */
export const CONDENSED_HEADER_PX = 44;

interface CondensedHeaderProps {
  detail: AgentDetail;
  showCloseButton: boolean;
  onClose?: () => void;
}

/**
 * Minimal one-row header that overlays the top of the agent body once the
 * full DrawerHeader has scrolled out of view (see AgentBody's sentinel).
 */
export function CondensedHeader({ detail, showCloseButton, onClose }: CondensedHeaderProps) {
  const meta = STATE_META[detail.state];
  return (
    <div
      data-testid="condensed-header"
      className="absolute inset-x-0 top-0 z-20 flex h-11 animate-condensed-in items-center gap-2 border-b border-slate-800 bg-card pl-6 pr-4"
    >
      <span className="shrink-0 font-mono text-xs text-muted-foreground">{detail.ticket_key}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {detail.ticket_title ?? detail.ticket_key}
      </span>
      <Badge
        role="status"
        aria-label={meta.label}
        color={detail.state}
        intensity="mid"
        icon={<StateIcon />}
      >
        {meta.label}
      </Badge>
      {showCloseButton && (
        <Button
          color="running"
          intensity="ghost"
          size="sm"
          icon={<X aria-hidden />}
          aria-label="Close drawer"
          onClick={onClose}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add the entrance animation keyframe**

In `packages/dashboard/src/index.css`, the repo has **no** tailwindcss-animate plugin — `animate-in` classes are inert (see the comment near `--animate-drawer-in`). Add a custom keyframe instead. In the `@theme` block, after `--animate-overlay-out`:

```css
  --animate-condensed-in: condensed-in 150ms ease-out;
```

And alongside the existing `@keyframes drawer-in` definitions later in the file:

```css
@keyframes condensed-in {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:run --workspace=crew-dashboard -- CondensedHeader`
Expected: PASS (3 tests)

- [ ] **Step 6: Add the inert Code Connect doc**

`CondensedHeader.figma.tsx` (same pattern as `DrawerHeader.figma.tsx` — not published; crew is on Figma Pro, the file is an on-disk doc for the design-with-figma skill):

```tsx
import { figma } from '@figma/code-connect';

import { CondensedHeader } from '@/components/CondensedHeader';
import type { AgentDetail } from '@/data/types';

// Sample fixture used purely as an in-snippet example for Figma Code Connect.
// Per `project_code_connect_skipped.md`, this file is not published — crew is on
// Figma Pro, so `.figma.tsx` files live as inert docs on disk read by the
// design-with-figma skill.
const SAMPLE_DETAIL: AgentDetail = {
  key: 'kanban-api/KAN-23',
  project: 'kanban-api',
  ticket_key: 'KAN-23',
  ticket_title: 'Drag-and-drop reordering keeps stale board state',
  state: 'waiting',
  worktree_path: '~/code/kanban-api/.worktrees/KAN-23',
  pr_url: null,
  app_url: 'http://localhost:7421',
  jira_url: 'https://safturento.atlassian.net/browse/KAN-23',
  tokens_by_tool: [],
  model: '',
  runs: [],
  tokens: { total: 48_000, input: 0, output: 0, cache_read: 0, cache_creation: 0 },
  tool_call_count: 0,
};

figma.connect(
  CondensedHeader,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=706-1059',
  {
    example: () => <CondensedHeader detail={SAMPLE_DETAIL} showCloseButton />,
  },
);
```

- [ ] **Step 7: Commit**

```bash
git add packages/dashboard/src/components/CondensedHeader.tsx packages/dashboard/src/components/CondensedHeader.test.tsx packages/dashboard/src/components/CondensedHeader.figma.tsx packages/dashboard/src/index.css
git commit -m "feat(dashboard): CondensedHeader component for the agent drawer"
```

---

### Task 3: Sentinel + overlay in AgentBody

**Files:**
- Modify: `packages/dashboard/src/components/AgentBody.tsx`
- Create: `packages/dashboard/src/components/AgentBody.test.tsx`
- Modify: `packages/dashboard/src/test/setup.ts`

- [ ] **Step 1: Add a noop IntersectionObserver stub to test setup**

jsdom ships no IntersectionObserver. In `src/test/setup.ts`, directly below the existing `ResizeObserver` stub, add the same pattern:

```ts
// jsdom doesn't ship IntersectionObserver either. AgentBody observes a
// sentinel to toggle the condensed header; tests that assert that behavior
// install their own controllable mock via vi.stubGlobal.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  class NoopIntersectionObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as unknown as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
    NoopIntersectionObserver as unknown as typeof IntersectionObserver;
}
```

- [ ] **Step 2: Write the failing tests**

`AgentBody.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentBody } from './AgentBody.js';
import { useAgent } from '../data/queries.js';
import type { AgentDetail } from '../data/types.js';

vi.mock('../data/queries.js', () => ({
  useAgent: vi.fn(),
  useRefreshPrStatus: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));
vi.mock('../data/useFinishSteps.js', () => ({
  useFinishSteps: vi.fn(() => []),
}));
// Timeline pulls its own queries; its internals are covered by Timeline.test.tsx.
vi.mock('./Timeline/Timeline.js', () => ({
  Timeline: () => <div data-testid="timeline-stub" />,
}));

const mockUseAgent = vi.mocked(useAgent);

const DETAIL: AgentDetail = {
  key: 'kanban-api/KAN-23',
  project: 'kanban-api',
  ticket_key: 'KAN-23',
  ticket_title: 'Drag-and-drop reordering keeps stale board state',
  state: 'running',
  worktree_path: '~/code/kanban-api/.worktrees/KAN-23',
  pr_url: null,
  app_url: 'http://localhost:7421',
  jira_url: 'https://safturento.atlassian.net/browse/KAN-23',
  tokens_by_tool: [],
  model: '',
  runs: [],
  tokens: { total: 48_000, input: 0, output: 0, cache_read: 0, cache_creation: 0 },
  tool_call_count: 0,
};

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly callback: IntersectionObserverCallback;
  readonly options?: IntersectionObserverInit;
  observed: Element[] = [];
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    MockIntersectionObserver.instances.push(this);
  }
  observe(el: Element): void {
    this.observed.push(el);
  }
  unobserve(): void {}
  disconnect(): void {}
  fire(isIntersecting: boolean): void {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

describe('AgentBody condensed header', () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    mockUseAgent.mockReturnValue({
      data: DETAIL,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useAgent>);
  });

  const lastObserver = () => MockIntersectionObserver.instances.at(-1)!;

  it('observes the drawer-header sentinel with the scroll container as root', () => {
    render(<AgentBody agentKey="kanban-api/KAN-23" mode="drawer" />);
    const io = lastObserver();
    expect(io.observed).toContain(screen.getByTestId('drawer-header-sentinel'));
    expect(io.options?.root).toBe(screen.getByTestId('agent-scroll-container'));
  });

  it('is hidden at rest and appears once the sentinel scrolls out of view', () => {
    render(<AgentBody agentKey="kanban-api/KAN-23" mode="drawer" />);
    expect(screen.queryByTestId('condensed-header')).not.toBeInTheDocument();

    act(() => lastObserver().fire(false));
    expect(screen.getByTestId('condensed-header')).toBeInTheDocument();

    act(() => lastObserver().fire(true));
    expect(screen.queryByTestId('condensed-header')).not.toBeInTheDocument();
  });

  it('gates the close button by mode', () => {
    const { rerender } = render(<AgentBody agentKey="kanban-api/KAN-23" mode="full" />);
    act(() => lastObserver().fire(false));
    expect(
      screen.queryByRole('button', { name: 'Close drawer' }),
    ).not.toBeInTheDocument();

    rerender(<AgentBody agentKey="kanban-api/KAN-23" mode="drawer" />);
    act(() => lastObserver().fire(false));
    // Both the full DrawerHeader and the condensed header render one
    expect(screen.getAllByRole('button', { name: 'Close drawer' }).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:run --workspace=crew-dashboard -- AgentBody`
Expected: FAIL — `drawer-header-sentinel` / `agent-scroll-container` test ids don't exist yet.

- [ ] **Step 4: Restructure AgentBody**

Replace `AgentBody.tsx` body with:

```tsx
import { useEffect, useRef, useState } from 'react';

import { useAgent } from '../data/queries.js';
import { useFinishSteps } from '../data/useFinishSteps.js';
import { CondensedHeader } from './CondensedHeader.js';
import { DrawerHeader } from './DrawerHeader.js';
import { FinishSteps } from './FinishSteps.js';
import { TokensByTool } from './TokensByTool.js';
import { Timeline } from './Timeline/Timeline.js';

export type AgentBodyMode = 'drawer' | 'full';

interface AgentBodyProps {
  agentKey: string;
  mode: AgentBodyMode;
  onClose?: () => void;
}

export function AgentBody({ agentKey, mode, onClose }: AgentBodyProps) {
  const { data, isLoading, error } = useAgent(agentKey);
  const finishSteps = useFinishSteps(agentKey);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [showCondensed, setShowCondensed] = useState(false);
  const ready = !isLoading && !error && Boolean(data);

  // The condensed header appears once the full DrawerHeader has scrolled out
  // of the drawer viewport. A zero-height sentinel at the header's bottom edge
  // is watched relative to the scroll container — no scroll listeners.
  useEffect(() => {
    if (!ready) return;
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => setShowCondensed(!entry.isIntersecting),
      { root },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [ready]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Loading agent…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Failed to load agent.
      </div>
    );
  }

  return (
    <div data-testid="agent-body" className="relative flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        data-testid="agent-scroll-container"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        <DrawerHeader
          detail={data}
          showCloseButton={mode === 'drawer'}
          showOpenAsPage={mode === 'drawer'}
          onClose={onClose}
        />
        <div ref={sentinelRef} data-testid="drawer-header-sentinel" aria-hidden className="h-0 shrink-0" />
        <div
          data-testid="agent-body-container"
          className="flex min-h-0 flex-1 flex-col gap-7 px-6 pb-8 pt-5"
        >
          <TokensByTool
            tokensByTool={data.tokens_by_tool}
            total={data.tokens.total}
            model={data.model}
          />
          <FinishSteps steps={finishSteps} />
          <div className="min-h-0 flex-1">
            <Timeline
              agentKey={agentKey}
              agentState={data.state}
              tokensByTool={data.tokens_by_tool}
              scrollContainerRef={scrollRef}
            />
          </div>
        </div>
      </div>
      {showCondensed && (
        <CondensedHeader detail={data} showCloseButton={mode === 'drawer'} onClose={onClose} />
      )}
    </div>
  );
}
```

Notes:
- `overflow-y-auto` moves from the root (Task 1) to the inner `agent-scroll-container` div; the root turns `relative` so the condensed header overlay positions against it.
- `scrollContainerRef` doesn't exist on `Timeline` yet — that's Task 4. Until then this line is a type error; **do Tasks 3 and 4 in the same session, in order, and only run the full sweep after Task 4.** (The AgentBody tests pass because the Timeline module is mocked.)

- [ ] **Step 5: Run the AgentBody tests**

Run: `npm run test:run --workspace=crew-dashboard -- AgentBody`
Expected: PASS (3 tests). The `tsc` error about `scrollContainerRef` is expected until Task 4.

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/src/components/AgentBody.tsx packages/dashboard/src/components/AgentBody.test.tsx packages/dashboard/src/test/setup.ts
git commit -m "feat(dashboard): condensed header overlay via IntersectionObserver sentinel"
```

---

### Task 4: Timeline — sticky toolbar, single scroll container, autoscroll repointing

**Files:**
- Modify: `packages/dashboard/src/components/Timeline/Timeline.tsx`
- Modify: `packages/dashboard/src/components/Timeline/Timeline.test.tsx`

- [ ] **Step 1: Update the structure tests (failing first)**

In `Timeline.test.tsx`, replace the two tests at ~line 631 (`'renders the toolbar outside the scroll viewport and not sticky'`) and ~line 646 (`'keeps exactly one scroll viewport with the toolbar lifted above it'`) with:

```tsx
  it('pins the toolbar with position: sticky below the condensed header', () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({ data: { events: [evt(1)] }, isSuccess: true }),
    );
    mockUseStateHistory.mockReturnValue(stateHistoryResult([]));
    render(<Timeline agentKey="a/K-1" agentState="running" />);
    const toolbar = screen.getByTestId('timeline-toolbar');
    expect(toolbar.className).toContain('sticky');
    expect(toolbar.className).toContain('bg-card');
  });

  it('owns no scroll viewport — the drawer body is the single scroll container', () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({ data: { events: [evt(1)] }, isSuccess: true }),
    );
    mockUseStateHistory.mockReturnValue(stateHistoryResult([]));
    const { container } = render(<Timeline agentKey="a/K-1" agentState="running" />);
    expect(container.querySelectorAll('[class*="overflow-y-auto"]').length).toBe(0);
  });
```

(Adapt the mock-setup lines to whatever the surrounding tests in that describe block actually use — the existing tests at those line numbers show the exact pattern.)

- [ ] **Step 2: Add an autoscroll test against the outer container**

In the same describe block, add:

```tsx
  it('live mode autoscrolls the outer scroll container when new events arrive', () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({ data: { events: [evt(1)] }, isSuccess: true }),
    );
    mockUseStateHistory.mockReturnValue(stateHistoryResult([]));

    const scrollRef = { current: null as HTMLDivElement | null };
    const ui = (events: TranscriptEvent[]) => (
      <div
        ref={(el) => {
          scrollRef.current = el;
        }}
        style={{ overflowY: 'auto', height: 800 }}
      >
        <Timeline agentKey="a/K-1" agentState="running" scrollContainerRef={scrollRef} />
      </div>
    );

    const { rerender } = render(ui([evt(1)]));
    const el = scrollRef.current!;
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 4000 });
    let scrollTop = 0;
    Object.defineProperty(el, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = v;
      },
    });

    mockUseTimeline.mockReturnValue(
      timelineResult({ data: { events: [evt(1), evt(2)] }, isSuccess: true }),
    );
    rerender(ui([evt(1), evt(2)]));
    expect(scrollTop).toBe(4000);
  });
```

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `npm run test:run --workspace=crew-dashboard -- Timeline/Timeline`
Expected: FAIL — `scrollContainerRef` prop unknown, toolbar not sticky, inner viewport still present.

- [ ] **Step 4: Implement the Timeline changes**

In `Timeline.tsx`:

**4a — props + constants.** Add to imports and the props interface:

```tsx
import type { CSSProperties, RefObject } from 'react';

import { CONDENSED_HEADER_PX } from '../CondensedHeader.js';

/** Enforced height of the pinned toolbar row (`h-12`). */
export const TOOLBAR_PX = 48;
/** Total pinned chrome above the scrolling timeline content. */
export const PINNED_CHROME_PX = CONDENSED_HEADER_PX + TOOLBAR_PX;
```

```tsx
interface TimelineProps {
  agentKey: string;
  agentState?: AgentState;
  tokensByTool?: AgentDetailTokensByTool[];
  /**
   * The drawer-body scroll container (owned by AgentBody). Drives live-mode
   * autoscroll, minimap section-jump, and minimap viewport sizing. Optional so
   * the component can be rendered standalone in tests.
   */
  scrollContainerRef?: RefObject<HTMLElement | null>;
}
```

…and destructure it: `export function Timeline({ agentKey, agentState, tokensByTool = [], scrollContainerRef }: TimelineProps) {`.

**4b — remove the inner viewport.** Delete `const scrollRef = useRef<HTMLDivElement | null>(null);`. Replace the main return's JSX with:

```tsx
  return (
    <div className="relative flex min-h-0 flex-col">
      <TimelineToolbar
        data-testid="timeline-toolbar"
        className="sticky z-10 h-12 bg-card"
        style={{ top: CONDENSED_HEADER_PX }}
        filterState={filterState}
        onFilterStateChange={setFilterState}
        tokensByTool={tokensByTool}
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        liveMode={liveMode}
        onLiveModeChange={setLiveMode}
        onCollapseAll={collapseAll}
        canCollapseAll={sections.length > 0}
      />
      <div className="relative">
        {filteredEvents.length > 0 && sections.length > 0 && (
          /* Zero-height sticky anchor that pins the minimap stripe just below
             the pinned chrome while the timeline content scrolls past. */
          <div className="sticky z-10 h-0" style={{ top: PINNED_CHROME_PX }}>
            <div className="relative" style={{ height: stripeHeight }}>
              <MinimapStripe
                sections={minimapSections}
                stripeHeight={stripeHeight}
                onSectionJump={onSectionJump}
              />
            </div>
          </div>
        )}
        {events.length === 0 ? (
          <div
            data-testid="timeline-empty"
            className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground"
          >
            No timeline events yet.
          </div>
        ) : filteredEvents.length === 0 ? (
          <FilterEmptyState onShowAll={resetFilters} />
        ) : (
          // pr-6 reserves a gutter so content clears the MinimapStripe
          // (right: SCROLLBAR_GUTTER 14px + width STRIPE_WIDTH 8px).
          <div className="flex flex-col gap-2 py-1 pl-1 pr-6">
            {sections.map((s, i) => {
              const key = sectionKey(s, i);
              const isOpen = !collapsed[key];
              const elapsedMs = (s.endedAt ?? now) - s.startedAt;
              const tokenSum = s.events.reduce((sum, e) => sum + eventTokens(e), 0);
              return (
                <div key={key} ref={sectionRefFor(i)}>
                  <TimelineSection
                    state={s.state}
                    startedAt={s.startedAt}
                    elapsedMs={elapsedMs}
                    eventCount={s.events.length}
                    tokenSum={tokenSum}
                    isOpen={isOpen}
                    onToggle={() => toggleSection(key)}
                  >
                    {s.events.map((event, evIdx) => (
                      <TranscriptRow
                        key={eventKey(event, evIdx)}
                        event={event}
                        toolNameById={toolNameById}
                      />
                    ))}
                  </TimelineSection>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
```

**4c — TimelineToolbar style prop.** Add `style?: CSSProperties;` to `TimelineToolbarProps`, destructure `style`, and pass it through to the root div (`<div data-testid={testId} style={style} className={cn(...)}>`).

**4d — repoint autoscroll.** Replace the autoscroll effect:

```tsx
  const lastSeenVisibleLengthRef = useRef<number>(filteredEvents.length);
  useEffect(() => {
    const prev = lastSeenVisibleLengthRef.current;
    const next = filteredEvents.length;
    const el = scrollContainerRef?.current;
    if (liveMode && next > prev && el) {
      el.scrollTop = el.scrollHeight;
    }
    lastSeenVisibleLengthRef.current = next;
  }, [filteredEvents.length, liveMode, scrollContainerRef]);
```

**4e — repoint the viewport ResizeObserver** (the minimap sticky anchor consumes `stripeHeight`; the full minimap behavior lands in Task 5, but the observer moves now so nothing references the deleted `scrollRef`):

```tsx
  useEffect(() => {
    if (isLoading) return;
    const el = scrollContainerRef?.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      setStripeHeight(Math.max(0, entry.contentRect.height - PINNED_CHROME_PX));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isLoading, scrollContainerRef]);
```

**4f — repoint section jump:**

```tsx
  const onSectionJump = useCallback(
    (idx: number) => {
      // Jumping is manual navigation — break live-follow even if the
      // scroll container isn't wired (standalone test renders).
      if (liveMode) setLiveMode(false);
      const viewport = scrollContainerRef?.current;
      if (!viewport) return;
      const sectionEls = viewport.querySelectorAll<HTMLElement>('[data-testid="timeline-section"]');
      const target = sectionEls[idx];
      if (!target) return;
      // Position relative to the scroll container, minus the pinned chrome so
      // the section header lands just below the sticky toolbar.
      const top =
        target.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top +
        viewport.scrollTop -
        PINNED_CHROME_PX;
      if (typeof viewport.scrollTo === 'function') {
        viewport.scrollTo({ top, behavior: 'smooth' });
      } else {
        viewport.scrollTop = top;
      }
    },
    [liveMode, scrollContainerRef],
  );
```

- [ ] **Step 5: Run the Timeline suite, fix fallout**

Run: `npm run test:run --workspace=crew-dashboard -- Timeline/Timeline`
Expected: PASS. The minimap-mount test (~line 661) and live-mode-break test (~line 685) should pass unchanged — if an assertion still references the removed inner viewport, update it to query the new structure (the toolbar test in Step 1 shows the pattern).

- [ ] **Step 6: Run the full dashboard suite + typecheck**

Run: `npm run test:run --workspace=crew-dashboard && npm run typecheck`
Expected: PASS — this also clears the Task 3 type error on `scrollContainerRef`.

- [ ] **Step 7: Commit**

```bash
git add packages/dashboard/src/components/Timeline/Timeline.tsx packages/dashboard/src/components/Timeline/Timeline.test.tsx
git commit -m "feat(dashboard): sticky timeline toolbar, scroll machinery repointed at drawer container"
```

---

### Task 5: Minimap pinned-anchor verification

The structural pieces (sticky anchor, `stripeHeight` derivation) landed in Task 4. This task locks the behavior in with tests.

**Files:**
- Modify: `packages/dashboard/src/components/Timeline/Timeline.test.tsx`

- [ ] **Step 1: Write tests for the pinned minimap**

Add to the main describe block in `Timeline.test.tsx`:

```tsx
  it('wraps the minimap in a zero-height sticky anchor pinned below the chrome', () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({ data: { events: [evt(1)] }, isSuccess: true }),
    );
    mockUseStateHistory.mockReturnValue(stateHistoryResult([]));
    render(<Timeline agentKey="a/K-1" agentState="running" />);
    const stripe = screen.getByTestId('minimap-stripe');
    const anchor = stripe.parentElement?.parentElement;
    expect(anchor?.className).toContain('sticky');
    expect(anchor?.className).toContain('h-0');
    expect(anchor?.style.top).toBe(`${PINNED_CHROME_PX}px`);
  });

  it('sizes the stripe to the scroll container height minus pinned chrome', () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({ data: { events: [evt(1)] }, isSuccess: true }),
    );
    mockUseStateHistory.mockReturnValue(stateHistoryResult([]));

    const observed: Element[] = [];
    let fireResize: (height: number) => void = () => {};
    class CapturingResizeObserver {
      private readonly cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
        fireResize = (height: number) =>
          this.cb(
            [{ contentRect: { height } } as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
      }
      observe(el: Element): void {
        observed.push(el);
      }
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', CapturingResizeObserver);

    const scrollRef = { current: null as HTMLDivElement | null };
    render(
      <div ref={(el) => { scrollRef.current = el; }}>
        <Timeline agentKey="a/K-1" agentState="running" scrollContainerRef={scrollRef} />
      </div>,
    );
    expect(observed).toContain(scrollRef.current);

    act(() => fireResize(800));
    const stripe = screen.getByTestId('minimap-stripe');
    expect(stripe.parentElement?.style.height).toBe(`${800 - PINNED_CHROME_PX}px`);

    vi.unstubAllGlobals();
  });
```

Import `PINNED_CHROME_PX` from `./Timeline.js` and `act` from `@testing-library/react` at the top of the file.

Also add a jump test asserting the outer container is the scroll target (the prototype-level `getBoundingClientRect` stub in this file returns `top: 0` for every element, so the expected offset is `0 - 0 + 0 - PINNED_CHROME_PX`):

```tsx
  it('minimap section-jump scrolls the outer container, offset by the pinned chrome', async () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({ data: { events: [evt(1)] }, isSuccess: true }),
    );
    mockUseStateHistory.mockReturnValue(stateHistoryResult([]));

    const scrollRef = { current: null as HTMLDivElement | null };
    render(
      <div ref={(el) => { scrollRef.current = el; }}>
        <Timeline agentKey="a/K-1" agentState="running" scrollContainerRef={scrollRef} />
      </div>,
    );
    const scrollTo = vi.fn();
    scrollRef.current!.scrollTo = scrollTo as unknown as typeof scrollRef.current.scrollTo;

    await userEvent.click(screen.getAllByTestId('minimap-segment')[0]);
    expect(scrollTo).toHaveBeenCalledWith({ top: -PINNED_CHROME_PX, behavior: 'smooth' });
  });
```

- [ ] **Step 2: Run, expect pass (Task 4 implemented the behavior)**

Run: `npm run test:run --workspace=crew-dashboard -- Timeline/Timeline`
Expected: PASS. If the anchor-structure assertions fail on the exact parent chain, fix the *test* to match the Task 4 JSX (anchor div → relative sizing div → MinimapStripe), not the implementation.

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/Timeline/Timeline.test.tsx
git commit -m "test(dashboard): pin minimap stripe to drawer viewport below sticky chrome"
```

---

### Task 6: Verification sweep + visual check

**Files:** none new — verification only.

- [ ] **Step 1: Cleanliness sweep**

```bash
npm run lint && npm run format:check && npm run typecheck && npm run test:run
```

Expected: all PASS. (Run `npm run format` first if `format:check` complains about the new files.)

- [ ] **Step 2: Manual scroll behavior check**

With the worktree stack up (`docker compose up --build --wait`, seeded dev fixtures), open an agent with a long timeline in the dashboard:

1. At rest: no condensed header; full DrawerHeader visible.
2. Scroll down: once the full header clears the top, the condensed header (key · title · badge · ✕) fades in.
3. Keep scrolling: the timeline toolbar pins directly below the condensed header; filters/search stay usable.
4. The minimap stripe stays pinned to the right edge of the visible area, sized to the viewport.
5. Click a minimap segment: the target section lands just below the pinned toolbar; live mode switches off.
6. Live mode ON with a running agent: new events keep the view pinned to the bottom.
7. Repeat 1–4 on the full-page view (`#/agent/<key>/full`) — identical, minus the close button.

- [ ] **Step 3: Visual fidelity + doc parity gates**

Run the `visual-fidelity-check` skill (componentDir changed; Figma source: `CondensedHeader` node `706:1059`, mockup `707:1044`) and the `agents-doc-parity-check` skill (`.agents/design-system.md` covers the components dir — the new composite likely needs a row wherever components are enumerated). Both are required before claiming completion, per repo AGENTS.md.

- [ ] **Step 4: Commit any resulting doc updates**

```bash
git add -A && git commit -m "docs(agents): record CondensedHeader composite"
```

(Skip if the parity check found nothing to update.)
