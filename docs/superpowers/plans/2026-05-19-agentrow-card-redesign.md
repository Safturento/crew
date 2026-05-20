# AgentRow card redesign — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `AgentRow` from a six-column table row to a flex card matching Figma component `212-910`, surface the active/total count on `ProjectDetailPage`'s `AGENTS` heading, and delete the obsolete `ColumnHeaderRow` component.

**Architecture:** Single-component rewrite (no new primitives). `AgentRow` reshapes from `grid-cols-[100px_90px_90px_70px_1fr_168px]` to `flex` with three children: state pill, title-and-meta vertical stack, right-aligned quick actions. `ProjectSection` gains a `showHeader?: boolean` prop (default `true`); `ProjectDetailPage` passes `false` and renders the active/total count inline next to its existing `AGENTS` heading. Quick-action buttons flip `size="xs"` → `size="sm"` per the 2026-05-19 Figma edit. Existing `STATE_CLASSES` / `STATE_META` tokens, the attention-pulse left-edge stroke, and the data-flow contract (`AgentRowProps`) are all preserved unchanged.

**Tech Stack:** React 18 + Vite + Tailwind v4 + class-variance-authority + lucide-react. Vitest + React Testing Library + jsdom for tests. Visual-fidelity check via `.crew/figma-snapshot/composites/212-910.{json,png}`.

**Inputs:**
- Spec: `docs/superpowers/specs/2026-05-19-agentrow-card-redesign-design.md`
- Figma component: [`212-910`](https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=212-910)
- Followup pre-sizing: `docs/followups.md` entry "2026-05-13 — Agent rows: code renders as table; Figma designs as cards" (this PR moves it to Resolved with a scope correction — see Task 4)

**Prerequisite (hard blocker):** the `crew figma-snapshot` selective-export work (`docs/followups.md` 2026-05-19 entry) must ship and the committed snapshot at `.crew/figma-snapshot/composites/212-910.{json,png}` must be refreshed against the live Figma file *before* the implementing `crew run` is dispatched. The stale snapshot still reflects `xs`-sized action buttons; `visual-fidelity-check` will fail against post-rewrite code unless this lands first.

---

## File structure

| File | Action | Responsibility after change |
|---|---|---|
| `packages/dashboard/src/components/AgentRow.tsx` | Modify (rewrite render shape; helpers preserved) | Renders one agent as a card with title + dot-separated icon meta + state-conditional quick actions |
| `packages/dashboard/src/components/AgentRow.test.tsx` | Modify (drop 2 table-shape tests; add 3 card-shape tests) | Asserts card affordances, not column positions |
| `packages/dashboard/src/components/ProjectSection.tsx` | Modify (add `showHeader` prop; drop `ColumnHeaderRow` render; adjust list gap) | Container for per-project agent list; header is optional |
| `packages/dashboard/src/components/ProjectSection.test.tsx` | Modify (drop 2 column-header tests; add 3 `showHeader` tests) | Covers both header-shown and header-hidden modes |
| `packages/dashboard/src/components/ColumnHeaderRow.tsx` | Delete | — |
| `packages/dashboard/src/routes/ProjectDetailPage.tsx` | Modify (compute counts; render inline next to `AGENTS`; pass `showHeader={false}`) | Project detail page: page-level heading carries the active/total count |
| `packages/dashboard/src/routes/ProjectDetailPage.test.tsx` | Modify (add 2 tests for count + hidden header) | Covers the new heading shape |
| `docs/followups.md` | Modify (move 2026-05-13 AgentRow entry to Resolved + ToC update + scope correction) | Followup tracker reflects shipped state |

No new files. No new packages.

---

## Task 1 — Rewrite `AgentRow` as a card

**Files:**
- Modify: `packages/dashboard/src/components/AgentRow.tsx`
- Test: `packages/dashboard/src/components/AgentRow.test.tsx`

The behavior contract is unchanged (props, click semantics, attention pulse, per-state actions). The render shape changes from a 6-column grid to a flex card with a stacked title+meta block. Three new meta-row icons (`Hash`, `Clock`, `Currency`) replace the columnar key/runtime/tokens cells. Quick-action `size="xs"` flips to `size="sm"` everywhere.

- [ ] **Step 1: Drop the two table-shape tests from `AgentRow.test.tsx`**

The current test file (188 lines) contains two assertions that hard-code the table shape. Delete them — the rewrite has no columns:

```tsx
// DELETE the test starting at line ~26:
//   it('renders cells in v2 column order: state, key, runtime, tokens, title, action', ...)

// DELETE the test starting at line ~181:
//   it('row uses the v2 6-track grid template (state · key · runtime · tokens · title · action)', ...)
```

Every other test in the file (text/role/event assertions, attention tokens, qa-group structure) remains correct against the new shape and stays untouched.

- [ ] **Step 2: Add three card-shape tests to `AgentRow.test.tsx`**

Insert after the existing "renders the state badge" test (around line 47):

```tsx
  it('renders meta-row icons (Hash, Clock, Currency) alongside the key, runtime, and tokens', () => {
    const { container } = render(<AgentRow agent={baseAgent} onSelect={() => {}} />);
    // Each meta cell wraps its lucide icon next to the value in an inline-flex span;
    // we don't assert specific lucide class names, only that three icon SVGs sit
    // alongside the three meta values inside the title-and-meta stack.
    const row = screen.getByRole('button', { name: /KAN-31/ });
    const svgs = row.querySelectorAll('svg');
    // 1 (state pill Circle) + 3 (meta-row Hash/Clock/Currency) = 4 minimum
    expect(svgs.length).toBeGreaterThanOrEqual(4);
  });

  it('truncates the ticket title and keeps the meta row visible alongside it', () => {
    const longTitle = 'A'.repeat(200);
    render(<AgentRow agent={{ ...baseAgent, ticketTitle: longTitle }} onSelect={() => {}} />);
    const title = screen.getByText(longTitle);
    expect(title.className).toContain('truncate');
    // Meta row values still queryable even with a long title above
    expect(screen.getByText('KAN-31')).toBeInTheDocument();
    expect(screen.getByText('48.2k')).toBeInTheDocument();
  });

  it('renders quick-action buttons at sm size (not xs)', () => {
    render(<AgentRow agent={{ ...baseAgent, state: 'idle' }} onSelect={() => {}} />);
    const resume = screen.getByRole('button', { name: 'Resume' });
    // Button component applies a size-keyed class — `sm` height differs from `xs`.
    // We assert the rendered className does NOT contain the xs marker.
    expect(resume.className).not.toMatch(/\bh-6\b/);
  });
```

> The `h-6` check is a guard against accidental `size="xs"` regressions; the `Button` primitive maps `xs` to `h-6` and `sm` to `h-7`/`h-8` in `packages/dashboard/src/components/ui/button.tsx`. If that mapping has changed by implementation time, read the current `button.tsx` and substitute the appropriate marker.

- [ ] **Step 3: Run tests, verify the new test file fails**

```bash
npm run test:run --workspace=crew-dashboard -- AgentRow.test
```

Expected: FAIL. The two deleted tests are gone, the three new tests fail against current implementation (grid layout, no meta icons, `xs` buttons). The remaining behavior tests may still pass against current code (they're shape-agnostic) — that's fine.

- [ ] **Step 4: Rewrite `AgentRow.tsx` to the card shape**

Replace the entire file contents with:

```tsx
import { useEffect, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { Circle, Clock, Currency, GitPullRequest, Hash } from 'lucide-react';

import type { Agent, AgentState } from '../data/types.js';
import { STATE_CLASSES, STATE_META } from '../data/state-meta.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { formatDuration } from '../format/duration.js';
import { formatTokens } from '../format/tokens.js';

export type QuickActionKind = 'resume' | 'finish' | 'view-pr' | 'provide-input' | 'inspect';

interface AgentRowProps {
  agent: Agent;
  onSelect: (key: string) => void;
  onAction?: (kind: QuickActionKind, agent: Agent) => void;
}

const ACTIVE_STATES = new Set<AgentState>(['running', 'initializing']);

const agentRow = cva(
  'group relative flex cursor-pointer items-center h-16 gap-3 rounded border bg-card px-4 py-3 transition-colors hover:bg-popover',
  {
    variants: {
      state: {
        initializing: 'border-white/10',
        running: 'border-white/10',
        idle: 'border-white/10',
        finished: 'border-white/10',
        waiting: `${STATE_CLASSES.waiting.border} ${STATE_CLASSES.waiting.bg}`,
        pr_open: `${STATE_CLASSES.pr_open.border} ${STATE_CLASSES.pr_open.bg}`,
        error: `${STATE_CLASSES.error.border} ${STATE_CLASSES.error.bg}`,
      },
    },
  },
);

export function AgentRow({ agent, onSelect, onAction }: AgentRowProps) {
  const runtime = useLiveRuntime(agent.startedAt, ACTIVE_STATES.has(agent.state));
  const meta = STATE_META[agent.state];
  const stateClasses = STATE_CLASSES[agent.state];
  const attentionAttr = meta.attention ? agent.state : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${agent.key} — ${agent.ticketTitle}`}
      data-attention={attentionAttr}
      onClick={() => onSelect(agent.key)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(agent.key);
        }
      }}
      className={agentRow({ state: agent.state })}
    >
      {meta.attention && (
        <span
          aria-hidden
          className={`absolute inset-y-1.5 left-0 w-1 rounded-full ${stateClasses.solidBg} animate-att-pulse`}
        />
      )}
      <Badge
        role="status"
        aria-label={meta.label}
        color={agent.state}
        intensity="mid"
        icon={<StateIcon />}
        className="shrink-0"
      >
        {meta.label}
      </Badge>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm text-foreground">{agent.ticketTitle}</span>
        <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
          <MetaItem icon={<Hash className="h-3 w-3" aria-hidden />} value={agent.key} />
          <MetaSeparator />
          <MetaItem icon={<Clock className="h-3 w-3" aria-hidden />} value={runtime} />
          <MetaSeparator />
          <MetaItem
            icon={<Currency className="h-3 w-3" aria-hidden />}
            value={formatTokens(agent.tokens)}
          />
        </div>
      </div>
      <QuickActions agent={agent} onAction={onAction} />
    </div>
  );
}

function MetaItem({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      {icon}
      <span>{value}</span>
    </span>
  );
}

function MetaSeparator() {
  return <span aria-hidden>·</span>;
}

// Every state-badge instance in the Figma Pill set uses `lucide/circle` as its
// Icon INSTANCE_SWAP — the badge's color, not its glyph, carries the state.
function StateIcon() {
  return <Circle className="p-[2px]" aria-hidden strokeWidth={6} absoluteStrokeWidth />;
}

function QuickActions({
  agent,
  onAction,
}: {
  agent: Agent;
  onAction?: (kind: QuickActionKind, agent: Agent) => void;
}) {
  const stop = (e: MouseEvent) => e.stopPropagation();
  const fire = (kind: QuickActionKind) => (e: MouseEvent) => {
    stop(e);
    onAction?.(kind, agent);
  };

  switch (agent.state) {
    case 'idle':
      return (
        <QaGroup>
          <Button color="running" intensity="mid" size="sm" onClick={fire('resume')}>
            Resume
          </Button>
          <Button color="running" intensity="ghost" size="sm" onClick={fire('finish')}>
            Finish
          </Button>
        </QaGroup>
      );
    case 'waiting':
      return (
        <SingleAction>
          <Button color="waiting" intensity="loud" size="sm" onClick={fire('provide-input')}>
            Provide input
          </Button>
        </SingleAction>
      );
    case 'pr_open':
      return (
        <QaGroup>
          <Button
            color="running"
            intensity="mid"
            size="sm"
            icon={<GitPullRequest aria-hidden />}
            asChild
          >
            <a href={agent.prUrl ?? '#'} target="_blank" rel="noreferrer" onClick={stop}>
              View PR
            </a>
          </Button>
          <Button color="running" intensity="ghost" size="sm" onClick={fire('finish')}>
            Finish
          </Button>
        </QaGroup>
      );
    case 'error':
      return (
        <SingleAction>
          <Button color="error" intensity="mid" size="sm" onClick={fire('inspect')}>
            Inspect
          </Button>
        </SingleAction>
      );
    default:
      return <span aria-hidden />;
  }
}

function QaGroup({ children }: { children: ReactNode }) {
  return (
    <div
      data-qa-group="true"
      className="flex shrink-0 items-center justify-end gap-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

function SingleAction({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 items-center justify-end">{children}</div>;
}

function useLiveRuntime(startedAt: string, live: boolean): string {
  const start = new Date(startedAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [live]);
  return formatDuration(now - start);
}
```

Three meaningful diffs from the current file: (1) outer container moves from `grid grid-cols-[100px_90px_90px_70px_1fr_168px]` to `flex`; (2) inner content reshapes into `<Badge>` + title-and-meta stack `<div>` + `<QuickActions>`, with the meta row using new `MetaItem` + `MetaSeparator` helpers and importing `Hash`, `Clock`, `Currency` from `lucide-react`; (3) every `<Button>` inside `QuickActions` uses `size="sm"` (was `xs`).

- [ ] **Step 5: Run tests, verify all pass**

```bash
npm run test:run --workspace=crew-dashboard -- AgentRow.test
```

Expected: PASS. Every test in `AgentRow.test.tsx` (existing + the three new card-shape tests) is green. If any existing test fails, the rewrite changed observable behavior — inspect, fix, and re-run.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck --workspace=crew-dashboard
```

Expected: clean. New lucide imports (`Hash`, `Clock`, `Currency`) and the helper components carry their own types.

- [ ] **Step 7: Commit**

```bash
git add packages/dashboard/src/components/AgentRow.tsx packages/dashboard/src/components/AgentRow.test.tsx
git commit -m "feat(dashboard): rewrite AgentRow from table row to card"
```

---

## Task 2 — Add `showHeader` to `ProjectSection`, delete `ColumnHeaderRow`

**Files:**
- Modify: `packages/dashboard/src/components/ProjectSection.tsx`
- Modify: `packages/dashboard/src/components/ProjectSection.test.tsx`
- Delete: `packages/dashboard/src/components/ColumnHeaderRow.tsx`
- (Confirm absence: `packages/dashboard/src/components/ColumnHeaderRow.test.tsx` — delete if present)

`ProjectSection` grows an optional `showHeader` prop (default `true`, preserving current behavior at all call sites). When `false`, the header `<div>` (chevron + folder + name + ExternalLink + count + repoPath) is omitted and the body always renders (collapse is meaningless without a toggle). The `<ColumnHeaderRow>` render is removed in both branches.

- [ ] **Step 1: Drop the two column-header tests from `ProjectSection.test.tsx`**

```tsx
// DELETE the test at line ~61:
//   it('renders a per-section column header row above the agents', ...)

// DELETE the test at line ~72:
//   it('does not render the column header row when collapsed', ...)
```

- [ ] **Step 2: Add three `showHeader` tests to `ProjectSection.test.tsx`**

Append to the `describe('ProjectSection', ...)` block:

```tsx
  it('renders the project header by default', () => {
    render(<ProjectSection project={project} agents={agents} onSelectAgent={() => {}} />);
    expect(screen.getByText('kanban-api')).toBeInTheDocument();
    expect(screen.getByText(/1 active · 2 total/)).toBeInTheDocument();
  });

  it('omits the project header when showHeader is false but still renders agents', () => {
    render(
      <ProjectSection
        project={project}
        agents={agents}
        onSelectAgent={() => {}}
        showHeader={false}
      />,
    );
    // No chevron toggle, no project name in section header
    expect(screen.queryByRole('button', { name: /toggle kanban-api/i })).not.toBeInTheDocument();
    expect(screen.queryByText('~/code/kanban-api')).not.toBeInTheDocument();
    // Agent rows still render
    expect(screen.getByText('KAN-1')).toBeInTheDocument();
    expect(screen.getByText('KAN-2')).toBeInTheDocument();
  });

  it('omits the header and still renders the empty state when showHeader is false', () => {
    render(
      <ProjectSection project={project} agents={[]} onSelectAgent={() => {}} showHeader={false} />,
    );
    expect(screen.queryByRole('button', { name: /toggle kanban-api/i })).not.toBeInTheDocument();
    expect(screen.getByText(/No agents yet/)).toBeInTheDocument();
  });
```

The existing "renders the project name, repo path, and counts" test already covers the default `showHeader=true` case via call-site behavior, so the new "renders the project header by default" test is a thin explicit assertion of the default. Keep both — they document the contract.

- [ ] **Step 3: Run tests, verify the new tests fail**

```bash
npm run test:run --workspace=crew-dashboard -- ProjectSection.test
```

Expected: FAIL. The three new tests fail (no `showHeader` prop yet; `queryByRole({ name: /toggle/ })` still finds the header).

- [ ] **Step 4: Update `ProjectSection.tsx`**

Replace the file with:

```tsx
import { useState } from 'react';
import type { MouseEvent } from 'react';
import { ChevronDown, ExternalLink, Folder } from 'lucide-react';

import type { Agent, Project } from '@/data/types';
import { AgentRow, type QuickActionKind } from './AgentRow.js';
import { Button } from './ui/button.js';

interface ProjectSectionProps {
  project: Project;
  agents: Agent[];
  onSelectAgent: (key: string) => void;
  onAgentAction?: (kind: QuickActionKind, agent: Agent) => void;
  onOpenProject?: (name: string) => void;
  showHeader?: boolean;
}

export function ProjectSection({
  project,
  agents,
  onSelectAgent,
  onAgentAction,
  onOpenProject,
  showHeader = true,
}: ProjectSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const active = agents.filter((a) => a.state !== 'finished').length;

  const handleOpenProject = (e: MouseEvent) => {
    e.stopPropagation();
    onOpenProject?.(project.name);
  };

  const body = (
    <div className="flex flex-col gap-2 pt-1">
      {agents.length === 0 ? (
        <div className="rounded border border-dashed border-white/10 px-4 py-6 text-center text-sm text-muted-foreground">
          No agents yet — start one with{' '}
          <span className="font-mono text-muted-foreground">+ New Run</span>
        </div>
      ) : (
        agents.map((a) => (
          <AgentRow key={a.key} agent={a} onSelect={onSelectAgent} onAction={onAgentAction} />
        ))
      )}
    </div>
  );

  if (!showHeader) {
    return <section className="flex flex-col">{body}</section>;
  }

  return (
    <section className="flex flex-col">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setCollapsed((c) => !c)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setCollapsed((c) => !c);
          }
        }}
        aria-label={`Toggle ${project.name}`}
        aria-expanded={!collapsed}
        className="group/header flex cursor-pointer items-center justify-between gap-3 border-b border-white/10 py-2 text-left"
      >
        <span className="flex items-center gap-2">
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${collapsed ? '-rotate-90' : ''}`}
            aria-hidden
          />
          <Folder className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="text-sm font-semibold tracking-tight text-foreground">
            {project.name}
          </span>
          {onOpenProject && (
            <Button
              color="running"
              intensity="ghost"
              size="xs"
              icon={<ExternalLink aria-hidden />}
              aria-label="Open project page"
              title="Open project page"
              onClick={handleOpenProject}
              className="opacity-0 transition-opacity group-hover/header:opacity-100 focus-visible:opacity-100"
            />
          )}
          <span className="text-xs text-muted-foreground">
            {active} active · {agents.length} total
          </span>
        </span>
        <span className="font-mono text-xs text-muted-foreground">{project.repoPath}</span>
      </div>
      {!collapsed && body}
    </section>
  );
}
```

Changes from the current file: (1) new `showHeader?: boolean = true` prop; (2) body extracted to a `body` const so the no-header branch can return just that; (3) `<ColumnHeaderRow>` and its import removed; (4) list gap `gap-1.5` → `gap-2` (cards carry more visual weight than table rows; final value verifiable against `212-910.png` during the visual-fidelity gate); (5) `showHeader={false}` branch short-circuits the entire header block (the `useState(collapsed)` declaration stays — it's cheap and removing it would force a refactor of `collapsed` references; the toggle just isn't reachable without a header).

- [ ] **Step 5: Delete `ColumnHeaderRow.tsx`**

```bash
git rm packages/dashboard/src/components/ColumnHeaderRow.tsx
# If a test file exists (none observed in current tree, but check):
test -f packages/dashboard/src/components/ColumnHeaderRow.test.tsx && \
  git rm packages/dashboard/src/components/ColumnHeaderRow.test.tsx || true
```

- [ ] **Step 6: Run tests, verify all pass**

```bash
npm run test:run --workspace=crew-dashboard -- ProjectSection.test
```

Expected: PASS — six tests total (four existing minus the two deleted, plus three new = seven; the existing "renders the project name, repo path, and counts" stays, so total is 11 existing − 2 deleted + 3 added = 12).

- [ ] **Step 7: Typecheck + run the full dashboard suite**

```bash
npm run typecheck --workspace=crew-dashboard
npm run test:run --workspace=crew-dashboard
```

Expected: both clean. The `AgentsList.tsx` call site (which doesn't pass `showHeader`) keeps working because the prop defaults to `true`.

- [ ] **Step 8: Commit**

```bash
git add packages/dashboard/src/components/ProjectSection.tsx \
        packages/dashboard/src/components/ProjectSection.test.tsx
git commit -m "feat(dashboard): ProjectSection.showHeader + drop ColumnHeaderRow"
```

The `git rm` from Step 5 is included in the same commit because the deletion is staged automatically by `git rm`.

---

## Task 3 — Surface active/total count on `ProjectDetailPage`'s `AGENTS` heading

**Files:**
- Modify: `packages/dashboard/src/routes/ProjectDetailPage.tsx`
- Test: `packages/dashboard/src/routes/ProjectDetailPage.test.tsx`

Pass `showHeader={false}` to the inner `<ProjectSection>` and render the active/total count alongside the page-level `AGENTS` heading. Count derivation: `active = filteredAgents.filter((a) => a.state !== 'finished').length`, `total = filteredAgents.length`. Same `active` semantics the inner section header uses on `AgentsListPage`, so the same project shows the same count on both pages.

- [ ] **Step 1: Add two tests to `ProjectDetailPage.test.tsx`**

Append to the `describe('ProjectDetailPage', ...)` block:

```tsx
  it('renders the active/total count next to the AGENTS heading', async () => {
    vi.spyOn(defaultClient, 'getProject').mockResolvedValue(FIXTURE_PROJECT_DETAILS['kanban-api']!);
    vi.spyOn(defaultClient, 'listAgents').mockResolvedValue(FIXTURE_AGENTS);

    renderWithQuery(<ProjectDetailPage slug="kanban-api" />);

    await screen.findByRole('heading', { name: 'kanban-api' });
    // Count text appears in the same row as the AGENTS heading.
    const countText = await screen.findByText(/\d+ active · \d+ total/);
    expect(countText).toBeInTheDocument();
  });

  it('hides the inner ProjectSection header (no per-section toggle on the project page)', async () => {
    vi.spyOn(defaultClient, 'getProject').mockResolvedValue(FIXTURE_PROJECT_DETAILS['kanban-api']!);
    vi.spyOn(defaultClient, 'listAgents').mockResolvedValue(FIXTURE_AGENTS);

    renderWithQuery(<ProjectDetailPage slug="kanban-api" />);

    await screen.findByRole('heading', { name: 'kanban-api' });
    // The toggle button that the inner ProjectSection renders when showHeader=true
    // must not appear on this page — the page-level ProjectHeader already names the project.
    expect(
      screen.queryByRole('button', { name: /toggle kanban-api/i }),
    ).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests, verify the new tests fail**

```bash
npm run test:run --workspace=crew-dashboard -- ProjectDetailPage.test
```

Expected: FAIL on both new tests. The count isn't rendered; the inner section header is still present (showHeader defaults to true).

- [ ] **Step 3: Update `ProjectDetailPage.tsx`**

Replace the page body with:

```tsx
import { useQuery } from '@tanstack/react-query';

import { ProjectConfigBlock } from '../components/ProjectConfigBlock.js';
import { ProjectHeader } from '../components/ProjectHeader.js';
import { ProjectSection } from '../components/ProjectSection.js';
import { defaultClient, useProject } from '../data/queries.js';
import { navigate } from '../routing/useHashRoute.js';

interface ProjectDetailPageProps {
  slug: string;
}

export function ProjectDetailPage({ slug }: ProjectDetailPageProps) {
  const detailQuery = useProject(slug);
  const agentsQuery = useQuery({
    queryKey: ['agents'],
    queryFn: () => defaultClient.listAgents(),
    refetchInterval: 2000,
  });

  if (detailQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-7xl p-6 text-sm text-muted-foreground">
        Loading project…
      </div>
    );
  }

  if (detailQuery.error || !detailQuery.data) {
    return (
      <div className="mx-auto w-full max-w-7xl p-6 text-sm text-muted-foreground">
        Project not found.
      </div>
    );
  }

  const { project, configPath } = detailQuery.data;
  const filteredAgents = (agentsQuery.data ?? []).filter((a) => a.projectName === project.name);
  const total = filteredAgents.length;
  const active = filteredAgents.filter((a) => a.state !== 'finished').length;

  return (
    <div className="mx-auto w-full max-w-7xl p-6">
      <ProjectHeader name={project.name} configPath={configPath} />
      <ProjectConfigBlock config={project} />
      <div className="mt-8 mb-2 flex items-center gap-2">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted-foreground">AGENTS</h2>
        <span className="text-xs text-muted-foreground">
          {active} active · {total} total
        </span>
      </div>
      <ProjectSection
        project={{
          name: project.name,
          repoPath: project.repo_path,
          branch: project.default_branch,
          jiraKey: project.jira.project_key,
          activeCount: active,
        }}
        agents={filteredAgents}
        onSelectAgent={(key) => navigate(`/agent/${encodeURIComponent(key)}`)}
        showHeader={false}
      />
    </div>
  );
}
```

Three diffs from the current file: (1) compute `total` and `active` from `filteredAgents` (replacing the inline `filteredAgents.filter(...).length` in the `activeCount` prop); (2) replace the bare `<h2>AGENTS</h2>` block with a flex row carrying the count span next to the heading; (3) pass `showHeader={false}` to `<ProjectSection>`. The `activeCount` field still passes the same value — `Project.activeCount` is consumed elsewhere (it's part of the shared `Project` type) so it stays.

- [ ] **Step 4: Run tests, verify all pass**

```bash
npm run test:run --workspace=crew-dashboard -- ProjectDetailPage.test
```

Expected: PASS — three existing tests still green, two new tests green.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck --workspace=crew-dashboard
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/src/routes/ProjectDetailPage.tsx \
        packages/dashboard/src/routes/ProjectDetailPage.test.tsx
git commit -m "feat(dashboard): surface active/total count on ProjectDetailPage"
```

---

## Task 4 — Resolve the 2026-05-13 AgentRow followup

**Files:**
- Modify: `docs/followups.md`

The 2026-05-13 entry "Agent rows: code renders as table; Figma designs as cards" pre-sized this work but contained a scope error (claimed three consuming screens; actually two — `AgentFullPage` doesn't list other agents). Move it to **Resolved** with a one-line corrected scope note. Update the ToC.

- [ ] **Step 1: Move the entry from `## Active` to `## Resolved`**

In `docs/followups.md`:

1. Locate the `### 2026-05-13 — Agent rows: code renders as table; Figma designs as cards (architectural layout drift, affects 3 screens)` heading and its body (ends just before the next `###` heading).
2. Cut the entire entry (heading + body).
3. Paste it into the `## Resolved` section, just under the section heading at the top of that block.
4. Append a `**Resolved YYYY-MM-DD:**` line to the body (replace `YYYY-MM-DD` with the date the implementing PR lands — use the agent's current date at execution time). Example:

```markdown
**Resolved 2026-05-19:** AgentRow rewritten from 6-column table grid to flex card matching Figma `212-910`; ProjectSection grew a `showHeader` prop so ProjectDetailPage can hide the inner section header and surface the active/total count next to its AGENTS heading; ColumnHeaderRow deleted. Scope correction: only two consuming screens (AgentsListPage + ProjectDetailPage), not three — AgentFullPage does not list other agents. Spec: `docs/superpowers/specs/2026-05-19-agentrow-card-redesign-design.md`; plan: `docs/superpowers/plans/2026-05-19-agentrow-card-redesign.md`.
```

- [ ] **Step 2: Update the ToC**

In the `## Contents` section, move the corresponding bullet from the `Active` sub-list to the `Resolved` sub-list. Preserve the existing anchor slug (GitHub generates it from the heading text; since the heading text is unchanged, the link still resolves).

- [ ] **Step 3: Verify the file renders correctly**

```bash
grep -n '2026-05-13 — Agent rows' docs/followups.md
```

Expected: exactly one heading line (`### 2026-05-13 — Agent rows: ...`) plus one ToC line, both now under their respective `Resolved` sections.

- [ ] **Step 4: Commit**

```bash
git add docs/followups.md
git commit -m "docs(followups): resolve 2026-05-13 AgentRow table-vs-card entry"
```

---

## Task 5 — Verification + visual-fidelity gate

**Files:** none (verification only)

- [ ] **Step 1: Run the full dashboard test suite**

```bash
npm run test:run --workspace=crew-dashboard
```

Expected: PASS. Every existing test plus the eight added in tasks 1–3 is green.

- [ ] **Step 2: Run typecheck on the dashboard**

```bash
npm run typecheck --workspace=crew-dashboard
```

Expected: clean — no `any`, no implicit-any errors, no missing imports.

- [ ] **Step 3: Run lint from the repo root**

```bash
npm run lint
```

Expected: clean. If `lint:agents` flags `.agents/` frontmatter, the issue is unrelated to this change.

- [ ] **Step 4: Run the `agents-doc-parity-check` skill**

Invoke the `agents-doc-parity-check` skill. It scans staged + committed changes against every `.agents/<topic>.md`'s `covers:` glob. The changes in this plan touch `packages/dashboard/src/components/**` and `packages/dashboard/src/routes/**`; `.agents/design-system.md` and `.agents/architecture.md` are candidate matches. Read both: if either documents AgentRow's table shape, the column header row, or the page-level layout in a way that contradicts the new card model, update it inline. If neither documents the specific shape (likely — these docs cover patterns, not specific components), no edit needed; record the check result as "no doc edits required" in the PR description.

- [ ] **Step 5: Run the `visual-fidelity-check` skill**

Invoke the `visual-fidelity-check` skill against `.crew/figma-snapshot/composites/212-910.{json,png}`. The skill compares the rewritten code's structural shape and component-property usage to the snapshot. Expected: green on all caller-check and structural-check items. The skill is required for any UI-touching PR; visual fidelity is part of acceptance.

> The prerequisite at the top of this plan covers this: the snapshot must be freshly regenerated against the live Figma file before this task runs. If the snapshot is stale (`crew figma-snapshot --check` reports stale), the prerequisite was skipped — stop and resolve it before proceeding.

- [ ] **Step 6: Manual dev-server smoke**

```bash
npm run dev --workspace=crew-dashboard
```

Open the dashboard, exercise:

1. The Agents List page — all seven agent states render the card shape; waiting / pr_open / error cards show the animated left-edge pulse stroke on top of the colored card border.
2. The Project detail page — no inner `ProjectSection` header (no chevron toggle, no project name in the section heading); the active/total count appears next to the page's `AGENTS` heading and matches the count the same project shows on the Agents List.
3. Hover, focus, click, and keyboard activation (Tab to focus, Enter/Space to fire `onSelect`) behave identically to the pre-rewrite version.
4. Live runtime ticks every second on `running` / `initializing` cards and is static elsewhere.

- [ ] **Step 7: Open the PR**

```bash
git push -u origin <branch-name>
gh pr create --title "feat(dashboard): AgentRow card redesign (CREW-XXX)" --body "$(cat <<'EOF'
## Summary

- Rewrite AgentRow from 6-column table grid to flex card matching Figma 212-910 (state pill + title-and-meta stack + right-aligned actions)
- Quick-action buttons flip xs → sm per the 2026-05-19 Figma edit
- ProjectSection gains showHeader prop; ProjectDetailPage hides the inner header and surfaces the active/total count next to its AGENTS heading
- ColumnHeaderRow deleted (no other consumer)
- 2026-05-13 followup moved to Resolved with corrected consumer-scope note

Spec: docs/superpowers/specs/2026-05-19-agentrow-card-redesign-design.md
Plan: docs/superpowers/plans/2026-05-19-agentrow-card-redesign.md

## Test plan

- [x] `npm run test:run --workspace=crew-dashboard` — full dashboard suite green
- [x] `npm run typecheck --workspace=crew-dashboard` — clean
- [x] `npm run lint` — clean
- [x] `agents-doc-parity-check` — no doc edits required
- [x] `visual-fidelity-check` — green against `.crew/figma-snapshot/composites/212-910`
- [x] Manual smoke on Agents List and Project detail (all 7 states, attention pulse, keyboard nav, live runtime)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

> Replace `<branch-name>` and `CREW-XXX` with the actual feature branch and Jira ticket key created at dispatch time. The branch is created by `crew run`'s preflight against the Jira ticket; the ticket key matches the dispatched ticket.

---

## Self-review

Spec coverage (each spec change → task):

| Spec section | Implementing task |
|---|---|
| §1 `AgentRow.tsx` rewrite | Task 1 |
| §2 `ProjectSection.showHeader` + drop `ColumnHeaderRow` | Task 2 |
| §3 `ProjectDetailPage` page-level count | Task 3 |
| §4 Delete `ColumnHeaderRow.tsx` | Task 2 Step 5 |
| §5 Test updates (all four files) | Tasks 1, 2, 3 |
| Followup correction | Task 4 |
| Verification (tests, typecheck, lint, agents-doc-parity, visual-fidelity, manual smoke) | Task 5 |
| Prerequisite (selective-export + snapshot refresh) | Plan header — runs before Task 1, outside this plan |

No placeholders. Every code change shows the actual code; every command is exact; every expected output is named.

Type consistency: `QuickActionKind`, `STATE_CLASSES`, `STATE_META`, `AgentState`, `Agent` all flow unchanged through the new render shape. New helpers (`MetaItem`, `MetaSeparator`) are local to `AgentRow.tsx`; `showHeader` is added to `ProjectSectionProps`; `total` / `active` are local in `ProjectDetailPage`. No naming inconsistencies between tasks.
