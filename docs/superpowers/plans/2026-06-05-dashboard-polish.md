# Dashboard Polish Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five dashboard/daemon defects — Skill category coalescing, per-worktree APP_URL, startup-row flicker, drawer filter persistence + popover guard, and the fix-pr/lifecycle state-and-timeline problem.

**Architecture:** Four items are self-contained dashboard/daemon fixes. The fifth (#8) refactors the agent-state badge to be a projection of the existing `state_transitions` log (which IngestService already maintains correctly) instead of the divergent SQL-flag recompute in `AgentsService.deriveState`, then verifies the full-lifecycle timeline that log already drives.

**Tech Stack:** TypeScript, React + Vite + Tailwind (dashboard), Fastify + Kysely + better-sqlite3 (daemon), Vitest + React Testing Library (tests).

**Spec:** `docs/superpowers/specs/2026-06-05-dashboard-polish-design.md`

**Verification commands** (per `.agents/commands.md`):
- Dashboard tests: `npm run test --workspace crew-dashboard`
- Daemon tests: `npm run test --workspace crew-daemon`
- CLI tests: `npm run test --workspace crew-cli`
- Lint/typecheck (repo root): `npm run lint && npm run typecheck`
- Before any PR: run the `agents-doc-parity-check` skill + `superpowers:verification-before-completion`.

---

## File Structure

| Item | Files |
| --- | --- |
| #5 | `packages/dashboard/src/components/Timeline/Timeline.tsx` (eventKey) + test |
| #2 | `packages/dashboard/src/components/Timeline/eventClassification.ts`, `TranscriptRow.tsx`, `event-labels.ts` (+ tests) |
| #6 persist | Create `packages/dashboard/src/components/Timeline/filter-persistence.ts`; modify `Timeline.tsx` (+ tests) |
| #6 popover | Create `packages/dashboard/src/routes/overlay-guard.ts` (context); modify `AgentDrawer.tsx`, `Timeline/Filters.tsx` (+ tests) |
| #4 | Create `packages/daemon/src/migrations/0008_agent_app_url.ts`; modify `routes/runs.ts`, `services/AgentsService.ts`, `db.ts`, CLI `commands/run.ts` + `commands/fix-pr.ts`, dashboard `HttpDaemonClient.ts` (+ tests) |
| #8a | `packages/daemon/src/services/AgentsService.ts` (state derivation), `state-derivation.ts` (+ tests) |
| #8 verify | Investigation notes in `docs/tickets/CREW-NNN.md`; `IngestService.ts` / `resolveJsonlPath.ts` only if investigation requires |

> The Epic + child-ticket mapping is in the "Ticket mapping" section at the end. Tasks are ordered for a clean dependency chain, not strict ticket order.

---

## Task 1: #5 — Stable timeline event keys

**Files:**
- Modify: `packages/dashboard/src/components/Timeline/Timeline.tsx` (the `eventKey` helper, currently ~line 327)
- Test: `packages/dashboard/src/components/Timeline/Timeline.test.tsx`

Root cause: `eventKey` returns `Math.random()` for events lacking `uuid`/`timestamp`. `crew_startup_*` events carry `startedAt`, so they get a fresh key every render; the active-section 1 s `setNow` tick remounts them and wipes each row's `open` state.

- [ ] **Step 1: Write the failing test**

Add to `Timeline.test.tsx`:

```tsx
import { eventKey } from './Timeline.js'; // export it (see Step 3)

describe('eventKey', () => {
  it('is stable across calls for a startup event (no uuid/timestamp, has startedAt)', () => {
    const startupEvent = {
      type: 'system',
      subtype: 'crew_startup_docker',
      status: 'completed',
      startedAt: '2026-06-05T12:00:00.000Z',
      summary: 'docker up',
    } as unknown as Parameters<typeof eventKey>[0];
    expect(eventKey(startupEvent, 3)).toBe(eventKey(startupEvent, 3));
    expect(eventKey(startupEvent, 3)).not.toContain('0.'); // no Math.random fragment
  });

  it('prefers uuid, then timestamp, then startedAt', () => {
    expect(eventKey({ uuid: 'u1', timestamp: 't1' } as never, 0)).toBe('u1');
    expect(eventKey({ timestamp: 't1' } as never, 0)).toBe('t1');
    expect(eventKey({ startedAt: 's1' } as never, 0)).toBe('s1');
  });

  it('falls back to a deterministic type:index key when no id field exists', () => {
    expect(eventKey({ type: 'unknown' } as never, 7)).toBe('unknown:7');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace crew-dashboard -- Timeline.test`
Expected: FAIL — `eventKey` not exported / `Math.random` branch present.

- [ ] **Step 3: Implement the fix**

In `Timeline.tsx`, export `eventKey` and add the `startedAt` + deterministic fallback; thread the section-relative index from the render loop:

```ts
export function eventKey(event: TranscriptEvent, index: number): string {
  const r = event as unknown as {
    uuid?: string;
    timestamp?: string;
    startedAt?: string;
    type?: string;
  };
  return r.uuid ?? r.timestamp ?? r.startedAt ?? `${r.type ?? 'event'}:${index}`;
}
```

Update the call site (the `s.events.map(...)` inside the section render) to pass the index:

```tsx
{s.events.map((event, evIdx) => (
  <TranscriptRow key={eventKey(event, evIdx)} event={event} />
))}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace crew-dashboard -- Timeline.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/Timeline/Timeline.tsx packages/dashboard/src/components/Timeline/Timeline.test.tsx
git commit -m "fix(dashboard): stable timeline event keys for startup rows"
```

---

## Task 2: #2 — Coalesce the `Skill` tool into the Skills category

**Files:**
- Modify: `packages/dashboard/src/components/Timeline/eventClassification.ts` (`eventCategories`, `eventToolAliases`)
- Modify: `packages/dashboard/src/components/Timeline/TranscriptRow.tsx` (`specForAssistantBlock`, helpers)
- Test: `eventClassification.test.ts`, `TranscriptRow.test.tsx`

Decision (from spec): a `Skill` tool invocation joins the **Skills** lens and is excluded from the Tools tool-name list; the row renders with the same label/palette as skill attachments.

> Note: `toolAlias('Skill')` returns `'Skill'` unchanged (no `mcp__` prefix). Match on the literal `'Skill'`.

- [ ] **Step 1: Write the failing tests**

In `eventClassification.test.ts`:

```ts
import { eventCategories, eventToolAliases, buildToolNameMap } from './eventClassification.js';

it('classifies a Skill tool_use under skills, not tools', () => {
  const evt = {
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'Skill', id: 't1', input: {} }] },
  } as never;
  expect([...eventCategories(evt)]).toEqual(['skills']);
});

it('still classifies a non-Skill tool_use under tools', () => {
  const evt = {
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'Bash', id: 't2', input: {} }] },
  } as never;
  expect([...eventCategories(evt)]).toEqual(['tools']);
});

it('a mixed turn with text + Skill lands in conversation AND skills', () => {
  const evt = {
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'hi' },
        { type: 'tool_use', name: 'Skill', id: 't3', input: {} },
      ],
    },
  } as never;
  expect(new Set(eventCategories(evt))).toEqual(new Set(['conversation', 'skills']));
});

it('excludes Skill from the tool-name alias list', () => {
  const evt = {
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'Skill', id: 't4', input: {} }] },
  } as never;
  expect(eventToolAliases(evt, buildToolNameMap([evt]))).toEqual([]);
});
```

In `TranscriptRow.test.tsx`:

```tsx
it('renders a Skill tool_use with the Skills tag label', () => {
  render(
    <TranscriptRow
      event={{
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Skill', id: 't1', input: { command: 'brainstorming' } }] },
      } as never}
    />,
  );
  expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('Skill invoked');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace crew-dashboard -- eventClassification TranscriptRow`
Expected: FAIL (Skill currently → tools; tag is the alias `Skill` with tool palette).

- [ ] **Step 3: Implement in `eventClassification.ts`**

Add a constant and branch in `eventCategories` (the `assistant` and `user` cases). Define near the top:

```ts
/** Tool name that represents a skill invocation — coalesced into the Skills lens. */
const SKILL_TOOL_NAME = 'Skill';
```

In the `assistant` case, replace the `tool_use` branch:

```ts
if (block.type === 'tool_use') {
  categories.add(block.name === SKILL_TOOL_NAME ? 'skills' : 'tools');
} else if (block.type === 'text') categories.add('conversation');
else if (block.type === 'thinking') categories.add('thinking');
else categories.add('system');
```

In the `user` case `tool_result` branch, resolve the name and route Skill results to skills. Because `eventCategories` has no `toolNameById`, key off the structural signal available: a `tool_result` cannot know its tool name without the map, so leave `tool_result` → `tools` here (the matching `tool_use` already contributes `skills`; results are visually paired and low-volume). Document this with a comment so it's a deliberate choice, not an oversight:

```ts
// tool_result blocks have no tool name without the id→name map; they stay
// under `tools`. The paired tool_use already contributes `skills`, so a Skill
// invocation is still reachable via the Skills filter.
if (block.type === 'tool_result') categories.add('tools');
```

In `eventToolAliases`, skip `Skill` so it never appears as a selectable tool:

```ts
if (block.type === 'tool_use' && typeof block.name === 'string') {
  if (block.name === SKILL_TOOL_NAME) continue;
  aliases.push(toolAlias(block.name));
}
```

…and in the `user`/`tool_result` branch of `eventToolAliases`:

```ts
const name = toolNameById.get(block.tool_use_id);
if (name && name !== SKILL_TOOL_NAME) aliases.push(toolAlias(name));
```

- [ ] **Step 4: Implement in `TranscriptRow.tsx`**

In `specForAssistantBlock`, special-case the Skill tool before the generic tool branch so it reads like a skill attachment (label `Skill invoked`, the hooks-and-skills palette):

```ts
if (isToolUse(block) && block.name === 'Skill') {
  const summary = summarizeToolInput(block.input);
  return {
    blockType: 'tool_use',
    category: 'hooks-and-skills',
    tone: 'default',
    tagLabel: 'Skill invoked', // matches ATTACHMENT_LABELS.invoked_skills
    oneLiner: truncate(summary),
    timestamp: event.timestamp,
    tokens,
    expanded: prettyJson(block.input),
  };
}
```

> `RowSpec.category` uses the older `'hooks-and-skills'` enum here, which maps to the `initializing` palette via `CATEGORY_COLOR` — the same color skill attachments already render with. No new color needed.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test --workspace crew-dashboard -- eventClassification TranscriptRow`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/src/components/Timeline/eventClassification.ts packages/dashboard/src/components/Timeline/eventClassification.test.ts packages/dashboard/src/components/Timeline/TranscriptRow.tsx packages/dashboard/src/components/Timeline/TranscriptRow.test.tsx
git commit -m "fix(dashboard): coalesce Skill tool-use into the Skills category"
```

---

## Task 3: #6 (part A) — Persist drawer filters per-agent

**Files:**
- Create: `packages/dashboard/src/components/Timeline/filter-persistence.ts`
- Create: `packages/dashboard/src/components/Timeline/filter-persistence.test.ts`
- Modify: `packages/dashboard/src/components/Timeline/Timeline.tsx`

Persist `{ categories, tools, search }` to `sessionStorage` keyed by agent key. `liveMode` and section-collapse state are intentionally **not** persisted.

- [ ] **Step 1: Write the failing test**

`filter-persistence.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { loadFilters, saveFilters, filterStorageKey } from './filter-persistence.js';
import { defaultTimelineFilterState } from './filter-state.js';

beforeEach(() => sessionStorage.clear());

describe('filter-persistence', () => {
  it('round-trips filter state + search through sessionStorage by agent key', () => {
    const state = {
      categories: new Set(['tools', 'skills'] as const),
      tools: { mode: 'explicit' as const, set: new Set(['Bash']) },
    };
    saveFilters('CREW-1', state, 'needle');
    const loaded = loadFilters('CREW-1');
    expect(loaded).not.toBeNull();
    expect([...loaded!.state.categories].sort()).toEqual(['skills', 'tools']);
    expect(loaded!.state.tools).toEqual({ mode: 'explicit', set: new Set(['Bash']) });
    expect(loaded!.search).toBe('needle');
  });

  it('isolates by agent key', () => {
    saveFilters('CREW-1', defaultTimelineFilterState, 'a');
    expect(loadFilters('CREW-2')).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    sessionStorage.setItem(filterStorageKey('CREW-3'), '{not json');
    expect(loadFilters('CREW-3')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace crew-dashboard -- filter-persistence`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `filter-persistence.ts`**

```ts
import type { CategoryId } from './eventClassification.js';
import type { TimelineFilterState, ToolsMode } from './filter-state.js';

export function filterStorageKey(agentKey: string): string {
  return `crew:timeline-filters:${agentKey}`;
}

interface Serialized {
  categories: CategoryId[];
  tools: { mode: ToolsMode; set: string[] };
  search: string;
}

export function saveFilters(agentKey: string, state: TimelineFilterState, search: string): void {
  const payload: Serialized = {
    categories: [...state.categories],
    tools: { mode: state.tools.mode, set: [...state.tools.set] },
    search,
  };
  try {
    sessionStorage.setItem(filterStorageKey(agentKey), JSON.stringify(payload));
  } catch {
    // sessionStorage unavailable/full — persistence is best-effort.
  }
}

export function loadFilters(
  agentKey: string,
): { state: TimelineFilterState; search: string } | null {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(filterStorageKey(agentKey));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Serialized;
    if (!Array.isArray(p.categories) || !p.tools || !Array.isArray(p.tools.set)) return null;
    return {
      state: {
        categories: new Set(p.categories),
        tools: { mode: p.tools.mode, set: new Set(p.tools.set) },
      },
      search: typeof p.search === 'string' ? p.search : '',
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace crew-dashboard -- filter-persistence`
Expected: PASS.

- [ ] **Step 5: Wire into `Timeline.tsx`**

Seed the `useState` initializers from persisted state and write through on change. Replace the two `useState` declarations:

```ts
const persisted = useMemo(() => loadFilters(agentKey), [agentKey]);
const [filterState, setFilterState] = useState<TimelineFilterState>(
  () => persisted?.state ?? defaultTimelineFilterState,
);
const [searchInput, setSearchInput] = useState(() => persisted?.search ?? '');
```

Add a write-through effect (after the existing state hooks):

```ts
useEffect(() => {
  saveFilters(agentKey, filterState, searchInput);
}, [agentKey, filterState, searchInput]);
```

Add the import: `import { loadFilters, saveFilters } from './filter-persistence.js';`

- [ ] **Step 6: Write the Timeline persistence integration test**

In `Timeline.test.tsx`, render with a stubbed `useTimeline`, toggle a filter, unmount, re-render with the same `agentKey`, assert the toggled state survives; re-render with a different key, assert defaults. (Follow the existing `Timeline.test.tsx` mocking pattern for `useTimeline`/`useStateHistory`.)

- [ ] **Step 7: Run tests + commit**

Run: `npm run test --workspace crew-dashboard -- filter-persistence Timeline.test`
Expected: PASS.

```bash
git add packages/dashboard/src/components/Timeline/filter-persistence.ts packages/dashboard/src/components/Timeline/filter-persistence.test.ts packages/dashboard/src/components/Timeline/Timeline.tsx packages/dashboard/src/components/Timeline/Timeline.test.tsx
git commit -m "feat(dashboard): persist drawer timeline filters per agent"
```

---

## Task 4: #6 (part B) — Filter popover outside-click guard

**Files:**
- Create: `packages/dashboard/src/routes/overlay-guard.ts`
- Modify: `packages/dashboard/src/routes/AgentDrawer.tsx`
- Modify: `packages/dashboard/src/components/Timeline/Filters.tsx`
- Test: `AgentDrawer.test.tsx`, `Filters.test.tsx`

Problem: the Filters popover renders in a Radix portal; clicking outside it (to dismiss) lands on the drawer backdrop, whose `onClick` navigates away — closing the whole drawer. Fix: a context flag the backdrop respects while any overlay is open.

- [ ] **Step 1: Create the context**

`overlay-guard.ts`:

```ts
import { createContext, useContext } from 'react';

/** Lets nested overlays (e.g. the Filters popover) tell the drawer backdrop to
 *  ignore the click that dismissed them, so dismissing an overlay doesn't also
 *  close the drawer. No-op default so components work outside a drawer. */
export interface OverlayGuard {
  setOverlayOpen: (open: boolean) => void;
  isOverlayOpen: () => boolean;
}

export const OverlayGuardContext = createContext<OverlayGuard>({
  setOverlayOpen: () => {},
  isOverlayOpen: () => false,
});

export const useOverlayGuard = (): OverlayGuard => useContext(OverlayGuardContext);
```

- [ ] **Step 2: Write the failing test**

In `AgentDrawer.test.tsx`:

```tsx
it('does not close when a backdrop click immediately follows an overlay dismiss', () => {
  // Render AgentDrawer, simulate overlayGuard.setOverlayOpen(true) via a child,
  // click the backdrop, assert navigate('/') was NOT called.
});
```

In `Filters.test.tsx`:

```tsx
it('reports overlay open/closed through the guard as the popover toggles', () => {
  const setOverlayOpen = vi.fn();
  render(
    <OverlayGuardContext.Provider value={{ setOverlayOpen, isOverlayOpen: () => false }}>
      <Filters state={defaultTimelineFilterState} onChange={() => {}} tokensByTool={[]} />
    </OverlayGuardContext.Provider>,
  );
  fireEvent.click(screen.getByLabelText('Open timeline filters'));
  expect(setOverlayOpen).toHaveBeenCalledWith(true);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test --workspace crew-dashboard -- AgentDrawer Filters`
Expected: FAIL.

- [ ] **Step 4: Provide the guard in `AgentDrawer.tsx`**

Track overlay-open with a ref (so a click handler reads the latest value synchronously) and have the backdrop consult it:

```tsx
import { useRef } from 'react';
import { OverlayGuardContext, type OverlayGuard } from './overlay-guard.js';

// inside AgentDrawer:
const overlayOpenRef = useRef(false);
const guard: OverlayGuard = {
  setOverlayOpen: (open) => {
    overlayOpenRef.current = open;
  },
  isOverlayOpen: () => overlayOpenRef.current,
};

const onBackdrop = () => {
  // If an overlay was open when this click landed, treat the click as the
  // overlay's dismiss and keep the drawer open. The overlay's own onOpenChange
  // has already flipped the ref false on its close, so guard with a short defer.
  if (overlayOpenRef.current) return;
  navigate('/');
};
```

Wrap the subtree and use `onBackdrop`:

```tsx
<OverlayGuardContext.Provider value={guard}>
  <div data-testid="drawer-backdrop" aria-hidden onClick={onBackdrop} className="..." />
  <aside ...><AgentBody .../></aside>
</OverlayGuardContext.Provider>
```

> Implementation note (verify empirically per spec): Radix closes the popover on `pointerdown` outside, firing `onOpenChange(false)` — which would flip the ref false *before* the backdrop's `click` fires, defeating the guard. To avoid that race, in `Filters` defer the `setOverlayOpen(false)` to the next tick (`setTimeout(() => guard.setOverlayOpen(false), 0)`), so the synchronous backdrop `click` still sees `true`. Confirm against the running drawer; if Radix's `onInteractOutside` is a cleaner hook, prefer wiring there.

- [ ] **Step 5: Report open-state from `Filters.tsx`**

```tsx
const guard = useOverlayGuard();
// existing: const [open, setOpen] = useState(false);
<Popover
  open={open}
  onOpenChange={(next) => {
    setOpen(next);
    if (next) guard.setOverlayOpen(true);
    else setTimeout(() => guard.setOverlayOpen(false), 0);
  }}
>
```

Add import: `import { useOverlayGuard } from '../../routes/overlay-guard.js';`

- [ ] **Step 6: Run tests + commit**

Run: `npm run test --workspace crew-dashboard -- AgentDrawer Filters`
Expected: PASS.

```bash
git add packages/dashboard/src/routes/overlay-guard.ts packages/dashboard/src/routes/AgentDrawer.tsx packages/dashboard/src/routes/AgentDrawer.test.tsx packages/dashboard/src/components/Timeline/Filters.tsx packages/dashboard/src/components/Timeline/Filters.test.tsx
git commit -m "fix(dashboard): keep drawer open when dismissing the filters popover"
```

---

## Task 5: #4 — Per-worktree APP_URL on the drawer

**Files:**
- Create: `packages/daemon/src/migrations/0008_agent_app_url.ts`
- Modify: `packages/daemon/src/db.ts` (`AgentsTable`)
- Modify: `packages/daemon/src/routes/runs.ts` (`RegisterRunBody` + upsert)
- Modify: `packages/daemon/src/services/AgentsService.ts` (`getByKey` app_url source + log swallow)
- Modify: `packages/cli/src/commands/run.ts`, `packages/cli/src/commands/fix-pr.ts` (pass `appUrl`)
- Modify: `packages/dashboard/src/data/HttpDaemonClient.ts` (`registerRun` body type)
- Tests: `AgentsService.test.ts`, `runs.test.ts`, CLI client test

> Confirm the next migration number before writing: `ls packages/daemon/src/migrations/`. Use the next integer (shown here as `0008`).

- [ ] **Step 1: Write the migration**

`0008_agent_app_url.ts` (follow the shape of an existing migration in that dir):

```ts
import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('agents').addColumn('app_url', 'text').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('agents').dropColumn('app_url').execute();
}
```

Add `app_url: string | null;` to `AgentsTable` in `db.ts`.

- [ ] **Step 2: Write the failing service test**

In `AgentsService.test.ts`, seed an agent row with `app_url = 'http://localhost:51234'` and assert `getByKey(...).app_url === 'http://localhost:51234'` (the stored per-worktree value wins over `deriveAppUrl(cfg)`). Add a second test: when `app_url` is null, it falls back to `deriveAppUrl(cfg)`.

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test --workspace crew-daemon -- AgentsService`
Expected: FAIL — `getByKey` ignores the column.

- [ ] **Step 4: Thread `appUrl` through registration**

In `runs.ts`, add to `RegisterRunBody`:

```ts
appUrl: z.string().nullable().optional(),
```

In the agents upsert, set `app_url` from the body (preserve an existing non-null value when the new one is null, mirroring the `ticket_title` COALESCE pattern):

```ts
// in the upsert values:
app_url: body.appUrl ?? null,
// in onConflict doUpdateSet:
app_url: sql`COALESCE(excluded.app_url, agents.app_url)`,
```

- [ ] **Step 5: Use the stored value in `getByKey`**

Select `app_url` in the `agent` query, then:

```ts
let appUrl: string | null = agent?.app_url ?? null;
let jiraUrl: string | null = null;
if (project) {
  try {
    const cfg = loadProjectConfigByName(project, this.projectsDir);
    if (appUrl === null) appUrl = deriveAppUrl(cfg); // fall back to static config
    jiraUrl = deriveJiraUrl(cfg, key);
  } catch (err) {
    this.logger.warn({ err, project, key }, 'project config load failed; URL pills degraded');
  }
}
```

> This requires a `logger` on `AgentsService`. Check the constructor — if absent, inject the pino logger via the DI container (`container.ts`) the same way other services receive it. If wiring a logger is heavier than expected, the minimum viable fix is `console.warn`; prefer the pino logger for consistency.

- [ ] **Step 6: Pass `appUrl` from the CLI**

In `run.ts`, the env materialization result exposes the value as `result.base.APP_URL` (see the summary line at ~`run.ts:327`). Capture it and pass to `registerRun`:

```ts
const registration = await daemonClient.registerRun({
  key,
  projectName: config.name,
  ticketTitle,
  worktreePath: worktree,
  branch: key,
  sessionId,
  command: 'run',
  startedAt,
  appUrl: materializedAppUrl ?? null, // from the materialize() result.base.APP_URL
});
```

> Plumb `materializedAppUrl` from wherever `materialize()` is called in the run setup (around `run.ts:104`) down to this registration site. In `fix-pr.ts`, do the same at its `registerRun` call (~`:299`).

- [ ] **Step 7: Update the dashboard client + types**

In `HttpDaemonClient.ts`, add `appUrl?: string | null` to the `registerRun` request type (keep it optional — the dashboard never calls register, but the shared type should match).

- [ ] **Step 8: Run all affected tests + commit**

Run: `npm run test --workspace crew-daemon -- AgentsService runs` then `npm run test --workspace crew-cli`
Expected: PASS. Then add a Bruno endpoint check if the agent-detail payload shape is asserted there (`.agents/testing.md`).

```bash
git add packages/daemon packages/cli packages/dashboard/src/data/HttpDaemonClient.ts
git commit -m "feat(daemon): surface per-worktree APP_URL on the agent drawer (CREW-NNN)"
```

---

## Task 6: #8 (investigation) — Root-cause the lifecycle behavior

**This is a non-code spike. Record findings in `docs/tickets/<key>.md` before writing 8a/8b code.**

Established by code reading (no need to re-verify):
- IngestService maintains a correct transition log via `computeNextState` (pr_open→running on a new run; running→pr_open on `gh pr create` / fix-pr completion) → `state_transitions` + `agentStateCache`.
- `AgentsService.deriveState` recomputes the badge **independently** from a forever-true `has_pr_create` MAX flag — this is the stuck-badge cause (high confidence).
- fix-pr resumes the **same session id**, so its events append to the original JSONL; `groupEventsByState` slices that single file by the transition log.

- [ ] **Step 1: Reproduce a real `run → fix-pr` cycle** against the dev daemon, or use an existing agent in the dev DB that has been through fix-pr.

- [ ] **Step 2: Inspect the transition log** for that agent:

```bash
# adjust to the daemon's sqlite path
sqlite3 <daemon.db> "SELECT from_state,to_state,ts FROM state_transitions WHERE agent_key='<KEY>' ORDER BY ts;"
```

Decision gate:
- **If** the log shows `… pr_open → running → pr_open …` (the fix-pr cycle present) → **L1 is fine**; segmentation already works once the badge is fixed. Proceed to 8a only; skip 8b.
- **If** the cycle is missing → the tail isn't re-flipping on resume (the new-runId tail re-reading the same JSONL). Add a 8b sub-task to fix the re-flip in `IngestService`/`runTail` (the CREW-198 priming exists at `runTail` ~`:604`; confirm `lastRunIdCache` priming + offset handling for a re-attached same-path tail).

- [ ] **Step 3: Confirm events are present** for both phases by loading the agent's timeline (`GET /api/agents/:key/timeline`) and checking events exist after the `pr_open` transition timestamp. If a run ever used a **distinct** session id (L2), note it — only then is multi-file aggregation (resolveJsonlPath `LIMIT 1` drop) in scope.

- [ ] **Step 4: Write findings** into the ticket file: which of H1/H2/H3 and L1/L2 hold, and the resulting task list (expected: 8a required; 8b only if Step 2/3 surface a gap).

- [ ] **Step 5: Commit the ticket notes**

```bash
git add docs/tickets/
git commit -m "docs(CREW-NNN): #8 lifecycle root-cause findings"
```

---

## Task 7: #8a — Make the agent-state badge a projection of the transition log

**Files:**
- Modify: `packages/daemon/src/services/AgentsService.ts` (`list`, `getByKey` state derivation)
- Modify/extend: `packages/daemon/src/services/state-derivation.ts` (add a pure helper)
- Test: `AgentsService.test.ts`, `state-derivation.test.ts`

The fix: current state = the `to_state` of the latest `state_transitions` row (mapped to `AgentState`), falling back to `initializing` when none exist. This unifies the badge onto the same log IngestService writes and `getStateHistory` exposes, so the fix-pr "running" phase is reflected for free.

- [ ] **Step 1: Write the failing unit test for the pure helper**

In `state-derivation.test.ts`:

```ts
import { currentStateFromTransitions } from './state-derivation.js';

it('returns initializing when there are no transitions', () => {
  expect(currentStateFromTransitions([])).toBe('initializing');
});

it('returns the latest transition target, mapped to AgentState', () => {
  expect(
    currentStateFromTransitions([
      { to: 'init', ts: 1 },
      { to: 'running', ts: 2 },
      { to: 'pr_open', ts: 3 },
      { to: 'running', ts: 4 }, // fix-pr cycle
    ]),
  ).toBe('running');
});

it('maps init → initializing', () => {
  expect(currentStateFromTransitions([{ to: 'init', ts: 1 }])).toBe('initializing');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace crew-daemon -- state-derivation`
Expected: FAIL — helper does not exist.

- [ ] **Step 3: Implement the helper**

In `state-derivation.ts` (reuse the existing `TransitionState` → `AgentState` mapping; `init` → `initializing`):

```ts
import type { AgentState } from './…'; // wherever AgentState lives for the daemon

const TRANSITION_TO_AGENT_STATE: Record<TransitionState, AgentState> = {
  init: 'initializing',
  running: 'running',
  pr_open: 'pr_open',
  pr_merged: 'pr_merged',
  finished: 'finished',
  error: 'error',
};

export function currentStateFromTransitions(
  transitions: ReadonlyArray<{ to: TransitionState; ts: number }>,
): AgentState {
  if (transitions.length === 0) return 'initializing';
  const latest = transitions.reduce((a, b) => (b.ts >= a.ts ? b : a));
  return TRANSITION_TO_AGENT_STATE[latest.to];
}
```

> Confirm `AgentState` includes `idle`/`waiting`; those are produced only by explicit transitions, which this helper naturally passes through if present. Extend the map if the type requires all keys.

- [ ] **Step 4: Use the helper in `AgentsService`**

In `getByKey`, replace the `deriveState({...})` call with a read of the transition log + helper:

```ts
const transitions = await this.db
  .selectFrom('state_transitions')
  .select(['to_state as to', 'ts'])
  .where('agent_key', '=', key)
  .orderBy('ts', 'asc')
  .orderBy('id', 'asc')
  .execute();
const state = currentStateFromTransitions(
  transitions.map((t) => ({ to: t.to as TransitionState, ts: Number(t.ts) })),
);
```

In `list()`, replace the per-row `deriveState({...})` with a per-agent latest-transition lookup. Add a left join selecting the latest transition's `to_state` (a correlated subquery mirroring the existing `pr_merged` MAX join), then map via the helper. Remove the now-unused `has_pr_create` / `finishCompletedOk` / `prMerged` plumbing **only if** nothing else consumes it.

> Keep `deriveState` and its `DeriveStateInput` until all consumers are migrated, then delete in the same PR to avoid dead code. The `deriveStateFromToolCalls` export (used by IngestService + the migration backfill) is unrelated — **do not** touch it.

- [ ] **Step 5: Update `AgentsService.test.ts`**

The existing list/detail state tests seed `runs`/`tool_calls` and assert states. Re-point them to seed `state_transitions` rows instead (or in addition). Add the key case: an agent with `[running, pr_open, running]` transitions → `getByKey().state === 'running'` (the fix-pr-in-flight case that was stuck on `pr_open`).

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test --workspace crew-daemon -- AgentsService state-derivation`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/daemon/src/services/AgentsService.ts packages/daemon/src/services/state-derivation.ts packages/daemon/src/services/AgentsService.test.ts packages/daemon/src/services/state-derivation.test.ts
git commit -m "fix(daemon): derive agent state from the transition log (CREW-NNN)"
```

---

## Task 8: #8 (segmentation) — Verify lifecycle timeline; fix gaps if found

**Gated on Task 6 findings.** Expected outcome: with 8a shipped, the badge is correct and `groupEventsByState` already segments the same-session timeline by the transition log. This task confirms that end-to-end and only adds code if Task 6 surfaced a gap.

- [ ] **Step 1: Add a component test** in `Timeline.test.tsx` proving multi-phase segmentation renders: given events spanning a `running → pr_open → running` transition set, assert three `timeline-section` elements render with states `running`, `pr_open`, `running`, each containing its phase's events. (Stub `useTimeline`/`useStateHistory` per the existing pattern.)

- [ ] **Step 2: If Task 6 found the re-flip missing (L1 gap):** fix `IngestService.runTail` / offset handling so a re-attached same-path tail for a new `runId` correctly triggers the `pr_open → running` cycle (the `lastRunIdCache` priming at `runTail` ~`:604` is the intended mechanism — confirm it primes from the *previous* run and that the new tail re-reads from offset 0 so the first post-resume tool_call is seen). Add a service test reproducing the cycle. **Skip this step entirely if the cycle was present in Task 6.**

- [ ] **Step 3: If Task 6 found distinct session ids (L2 gap):** extend `resolveJsonlPathForAgent` → `resolveAllRunTranscripts` returning every `run`/`fix-pr` transcript in order, and have `TimelineService.getTimeline` read+concatenate them, tagging events with their run. **Skip if all runs share a session (the fix-pr default).** If implemented, add a `runId`/ordinal field to the event tag and a per-segment header in `TimelineSection` showing the run/phase boundary.

- [ ] **Step 4: Run tests + commit**

Run: `npm run test --workspace crew-dashboard -- Timeline.test` (+ `crew-daemon` if Step 2/3 ran)
Expected: PASS.

```bash
git add packages/dashboard/src/components/Timeline/Timeline.test.tsx
git commit -m "test(dashboard): verify multi-phase lifecycle timeline segmentation"
```

---

## Ticket mapping (Epic: "Dashboard polish batch")

| Ticket | Covers | Tasks | Depends on |
| --- | --- | --- | --- |
| **A — Timeline classification & keys** | #5 + #2 | 1, 2 | — |
| **B — Drawer filter UX** | #6 persist + popover | 3, 4 | — |
| **C — Per-worktree APP_URL** | #4 | 5 | — |
| **D — Lifecycle state & timeline** | #8 | 6, 7, 8 | 6 gates 7/8 |

- A, B, C, D are independent and buildable in parallel.
- **Merge ordering (per the parallel-merge convention):** A and D both touch `Timeline`-area files (`Timeline.tsx`, `Timeline.test.tsx`) → don't merge simultaneously; merge one, rebase the other. C and D both touch `AgentsService.ts` → same rule. C adds the only migration in this batch — land it without a competing migration-adder.
- Within D: Task 6 (spike) first; 7 and 8 follow its findings (7 is required, 8 is mostly verification + conditional fixes).
- **#5 standalone option:** Task 1 is a one-function XS fix and can ship first/alone if a fast win is wanted, even though it's bundled into ticket A here.

---

## Self-Review

**Spec coverage:** #5 → Task 1. #2 → Task 2. #6 persist → Task 3; #6 popover → Task 4. #4 → Task 5. #8 badge → Tasks 6+7; #8 segmentation/aggregation → Tasks 6+8. All spec sections map to tasks.

**Placeholder scan:** `CREW-NNN` is intentional (Epic/tickets created after plan approval). Tasks 6/8 are deliberately investigation-gated — they carry concrete commands + a decision matrix rather than speculative code for paths the evidence says are unlikely (same-session resume means events are already loaded; the badge is the high-confidence fix). This is the honest structure for a root-cause-first item, per the spec's explicit direction.

**Type consistency:** `eventKey(event, index)`, `loadFilters`/`saveFilters`/`filterStorageKey`, `OverlayGuard.setOverlayOpen`/`isOverlayOpen`, `currentStateFromTransitions`, `SKILL_TOOL_NAME` are used consistently across their tasks.
