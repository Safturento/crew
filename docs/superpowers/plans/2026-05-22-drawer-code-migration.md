# Drawer code migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> 
> **Project-specific note (overrides skill default):** per `~/.claude/CLAUDE.md` the user triggers implementation via `crew run <KEY>` once tickets exist. Do not auto-dispatch.

**Goal:** Migrate the dashboard agent drawer code onto the 2026-05-21 Figma redesign with full data plumbing for the new sections (no mock data).

**Architecture:** Vertical slice from backend up. One Epic with five child tickets. Ticket 1 extends `AgentsService.getByKey` + `AgentDetail` with `app_url`, `jira_url`, `tokens_by_tool`, and adds a `tool_calls.changed` listener to `useAgent`. Tickets 2-4 build the new composites (`DrawerHeader`, `TokensByTool`+`TokenBarRow`, `TimelineSection` with state grouping + Collapse-all). Ticket 5 deletes `StateHistoryBar` + `TokenTable`, finalises AgentPage, lands the e2e test, and resolves the 2026-05-08 + 2026-05-13 followups.

**Spec:** [`docs/superpowers/specs/2026-05-22-drawer-code-migration-design.md`](../specs/2026-05-22-drawer-code-migration-design.md)

**Tech Stack:** TypeScript, Fastify + Kysely + better-sqlite3 (daemon), React + Vite + Tailwind + React Query + Vitest + RTL + jsdom (dashboard), Playwright (e2e), Figma Code Connect (`.figma.tsx` mappings).

**Verification spine:** Each frontend ticket runs `visual-fidelity-check` against the refreshed Figma snapshot in `.crew/figma-snapshot/` (committed earlier on this branch). The snapshot is the ground truth diff target.

**Pre-flight reading** (do once before starting any ticket):

- [`AGENTS.md`](../../../AGENTS.md) at repo root + topic docs in [`.agents/`](../../../.agents/) it links to.
- Package AGENTS.md for the package you're touching: [`packages/daemon/AGENTS.md`](../../../packages/daemon/AGENTS.md), [`packages/dashboard/AGENTS.md`](../../../packages/dashboard/AGENTS.md), [`packages/shared/AGENTS.md`](../../../packages/shared/AGENTS.md).
- [`.agents/dispatch.md`](../../../.agents/dispatch.md) if running via `crew run`.

---

## File structure

### New files

```
packages/dashboard/src/components/
├── DrawerHeader.tsx              # ticket 2
├── DrawerHeader.test.tsx
├── DrawerHeader.figma.tsx        # ticket 2 / Code Connect
├── TokensByTool.tsx              # ticket 3
├── TokensByTool.test.tsx
├── TokensByTool.figma.tsx
├── TokenBarRow.tsx               # ticket 3
├── TokenBarRow.test.tsx
├── TokenBarRow.figma.tsx
└── Timeline/
    ├── TimelineSection.tsx        # ticket 4
    ├── TimelineSection.test.tsx
    ├── TimelineSection.figma.tsx
    ├── groupEventsByState.ts      # ticket 4 — pure function
    └── groupEventsByState.test.ts

packages/dashboard/e2e/
└── agent-drawer-redesign.spec.ts # ticket 5
```

### Modified files

| Path | Tickets | Why |
|---|---|---|
| `packages/daemon/src/services/AgentsService.ts` | 1 | Extend `AgentDetail` interface + `getByKey` to compose `app_url`, `jira_url`, `tokens_by_tool` |
| `packages/daemon/src/services/AgentsService.test.ts` | 1 | New test cases for the three new fields |
| `packages/daemon/src/container.ts` | 1 | Inject `projectsDir` into `AgentsService` (needed for project-config lookup) |
| `packages/daemon/src/routes/agents.ts` (or similar — verify path) | 1 | Extend zod response schema to include the three new fields |
| `packages/dashboard/src/data/types.ts` | 1 | Mirror the new fields on the client `AgentDetail` interface |
| `packages/dashboard/src/data/queries.ts` | 1 | Add `tool_calls.changed` invalidation to `useAgent` |
| `packages/dashboard/src/components/AgentBody.tsx` | 2, 3, 4 | Replace inline `AgentHeader` → `<DrawerHeader/>`; insert `<TokensByTool/>`; wrap body with `BodyContainer` padding; drop `RunMetrics` |
| `packages/dashboard/src/routes/AgentDrawer.tsx` | 2 | Remove standalone Unicode-✕ close button; close passes through DrawerHeader's X pill |
| `packages/dashboard/src/components/Timeline/Timeline.tsx` | 4 | Replace flat list with section-grouped sections; add Collapse-all to toolbar |

### Deleted files (ticket 5)

```
packages/dashboard/src/components/StateHistoryBar.tsx
packages/dashboard/src/components/StateHistoryBar.test.tsx
packages/dashboard/src/components/StateHistoryBar.figma.tsx
packages/dashboard/src/components/TokenTable.tsx
packages/dashboard/src/components/TokenTable.test.tsx
packages/dashboard/src/components/TokenTable.figma.tsx
```

---

## Ticket 1 — Backend AgentDetail extensions

**Scope:** Backend (daemon) extension + tiny frontend SSE wire. Blocks tickets 2 + 3.

**Branch naming:** `feat/agent-detail-extensions-CREW-XXX` (replace XXX with ticket key).

### Task 1.1 — Update `ProjectConfig` derivation helpers (shared)

> If a helper already covers this in `packages/shared`, prefer reusing. Search first: `grep -rn "deriveAppUrl\|deriveJiraUrl" packages/shared/src/`.

**Files:**
- Create: `packages/shared/src/config/derive-urls.ts`
- Test: `packages/shared/src/config/derive-urls.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/config/derive-urls.test.ts
import { describe, it, expect } from 'vitest';
import { deriveAppUrl, deriveJiraUrl } from './derive-urls.js';
import type { ProjectConfig } from './schema.js';

function makeConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    name: 'kanban-api',
    repo_path: '~/code/kanban-api',
    default_branch: 'main',
    jira: { project_key: 'KAN', site: 'https://safturento.atlassian.net' },
    github: { repo: 'safturento/kanban-api' },
    db_clone: {
      postgres_service: 'postgres',
      postgres_user: 'postgres',
      postgres_database: 'postgres',
      required_tables: [],
      exclude_tables: ['kysely_migration*'],
    },
    ...overrides,
  } as ProjectConfig;
}

describe('deriveAppUrl', () => {
  it('returns playwright.app_url when present', () => {
    const cfg = makeConfig({ playwright: { app_url: 'http://localhost:7421' } as any });
    expect(deriveAppUrl(cfg)).toBe('http://localhost:7421');
  });

  it('falls back to bruno_smoke.base_url when playwright missing', () => {
    const cfg = makeConfig({ bruno_smoke: { base_url: 'http://localhost:7421/api' } as any });
    expect(deriveAppUrl(cfg)).toBe('http://localhost:7421/api');
  });

  it('returns null when neither is configured', () => {
    expect(deriveAppUrl(makeConfig())).toBeNull();
  });
});

describe('deriveJiraUrl', () => {
  it('composes site + /browse/ + ticket key', () => {
    const cfg = makeConfig();
    expect(deriveJiraUrl(cfg, 'KAN-23')).toBe('https://safturento.atlassian.net/browse/KAN-23');
  });

  it('returns null when ticket_key is empty', () => {
    expect(deriveJiraUrl(makeConfig(), '')).toBeNull();
  });

  it('strips trailing slash from site', () => {
    const cfg = makeConfig({ jira: { project_key: 'KAN', site: 'https://safturento.atlassian.net/' } });
    expect(deriveJiraUrl(cfg, 'KAN-23')).toBe('https://safturento.atlassian.net/browse/KAN-23');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```
npm -w crew-shared test -- derive-urls
```
Expected: FAIL — `derive-urls.ts` doesn't exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/shared/src/config/derive-urls.ts
import type { ProjectConfig } from './schema.js';

export function deriveAppUrl(cfg: ProjectConfig): string | null {
  if (cfg.playwright?.app_url) return cfg.playwright.app_url;
  if (cfg.bruno_smoke?.base_url) return cfg.bruno_smoke.base_url;
  return null;
}

export function deriveJiraUrl(cfg: ProjectConfig, ticketKey: string): string | null {
  if (!ticketKey) return null;
  const site = cfg.jira.site.replace(/\/$/, '');
  return `${site}/browse/${ticketKey}`;
}
```

- [ ] **Step 4: Run, verify pass**

```
npm -w crew-shared test -- derive-urls
```
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```
git add packages/shared/src/config/derive-urls.ts packages/shared/src/config/derive-urls.test.ts
git commit -m "feat(shared): deriveAppUrl + deriveJiraUrl helpers (CREW-XXX)"
```

### Task 1.2 — Extend the daemon `AgentDetail` interface

**Files:**
- Modify: `packages/daemon/src/services/AgentsService.ts:37-48`

- [ ] **Step 1: Add interface field**

```ts
// packages/daemon/src/services/AgentsService.ts (around line 29-48)
export interface AgentDetailTokensByTool {
  tool: string;
  tokens: number;
  percent: number;
}

export interface AgentDetail {
  key: string;
  project: string;
  ticket_key: string;
  ticket_title: string | null;
  state: AgentState;
  worktree_path: string;
  pr_url: string | null;
  // NEW (CREW-XXX) — drawer redesign 2026-05-22
  app_url: string | null;
  jira_url: string | null;
  tokens_by_tool: AgentDetailTokensByTool[];
  // EXISTING
  runs: AgentDetailRun[];
  tokens: AgentDetailTokens;
  tool_call_count: number;
}
```

- [ ] **Step 2: Verify typecheck fails**

```
npm -w crew-daemon run typecheck
```
Expected: FAIL — `getByKey` return value missing the three new fields.

(Compile errors are the test scaffolding here — typecheck is the "test" for the interface extension.)

- [ ] **Step 3: Provide stub values in `getByKey` to make typecheck pass**

In `AgentsService.ts:265-...`, extend the returned object with stub values so typecheck passes; real values arrive in 1.4:

```ts
return {
  // ...existing fields
  app_url: null,
  jira_url: null,
  tokens_by_tool: [],
  // ...existing runs/tokens/tool_call_count
};
```

- [ ] **Step 4: Run typecheck**

```
npm -w crew-daemon run typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add packages/daemon/src/services/AgentsService.ts
git commit -m "feat(daemon): extend AgentDetail with app_url/jira_url/tokens_by_tool fields (stub values) (CREW-XXX)"
```

### Task 1.3 — Inject `projectsDir` into AgentsService

> AgentsService currently only depends on `db`. We need project-config access without a service cycle (ProjectsService already depends on AgentsService — see `container.ts:71`).

**Files:**
- Modify: `packages/daemon/src/services/AgentsService.ts:69-78`
- Modify: `packages/daemon/src/container.ts` (verify line — search for `new AgentsService(`)
- Modify: `packages/daemon/src/services/AgentsService.test.ts` (the existing test-fixtures helper that constructs the service)

- [ ] **Step 1: Write a failing test that exercises the new dep**

Look for the existing `makeService` / `setupService` helper in `AgentsService.test.ts`. Add a test that confirms `projectsDir` is honoured:

```ts
// packages/daemon/src/services/AgentsService.test.ts (in the existing describe('getByKey', …) block)
it('reads project config from injected projectsDir', async () => {
  // arrange: write a project TOML to a tmpdir, point service at it
  const tmp = await mkdtemp(join(tmpdir(), 'crew-projects-'));
  await writeFile(join(tmp, 'kanban-api.toml'), `
name = "kanban-api"
repo_path = "~/code/kanban-api"
[jira]
project_key = "KAN"
site = "https://safturento.atlassian.net"
[github]
repo = "safturento/kanban-api"
[playwright]
app_url = "http://localhost:7421"
[playwright.smoke]
enabled = true
`);
  const svc = new AgentsService({ db, projectsDir: tmp });
  // ... seed agent + runs (reuse existing helpers in the test file)
  const detail = await svc.getByKey('KAN-23');
  expect(detail?.app_url).toBe('http://localhost:7421');
  expect(detail?.jira_url).toBe('https://safturento.atlassian.net/browse/KAN-23');
});
```

- [ ] **Step 2: Run, verify failure**

```
npm -w crew-daemon test -- AgentsService
```
Expected: FAIL — `projectsDir` not on `AgentsServiceDeps`.

- [ ] **Step 3: Add the dep**

```ts
// packages/daemon/src/services/AgentsService.ts:69-78
export interface AgentsServiceDeps {
  db: Kysely<DaemonDatabase>;
  /** Absolute path to per-project TOML configs. The daemon reads
   *  `<projectsDir>/<projectName>.toml` to resolve app_url + jira site
   *  for `AgentDetail`. */
  projectsDir: string;
}

export class AgentsService {
  private readonly db: Kysely<DaemonDatabase>;
  private readonly projectsDir: string;

  constructor(deps: AgentsServiceDeps) {
    this.db = deps.db;
    this.projectsDir = deps.projectsDir;
  }
  // ...
}
```

- [ ] **Step 4: Wire in container**

Open `packages/daemon/src/container.ts`, find the `new AgentsService(…)` call, pass `projectsDir: config.configDir` (matches the value already passed to `ProjectsService` at line 71).

- [ ] **Step 5: Run test, verify failure shifts to "deriveAppUrl returns null"**

The test should now compile but still fail because `getByKey` doesn't yet call the derivers. This confirms the dep wiring is correct.

- [ ] **Step 6: Commit (red — interface added, behaviour follows in 1.4)**

```
git add packages/daemon/src/services/AgentsService.ts packages/daemon/src/services/AgentsService.test.ts packages/daemon/src/container.ts
git commit -m "feat(daemon): inject projectsDir into AgentsService (CREW-XXX)"
```

### Task 1.4 — Compose `app_url` + `jira_url` in `getByKey`

**Files:**
- Modify: `packages/daemon/src/services/AgentsService.ts:184-283` (the `getByKey` method)

- [ ] **Step 1: Import the derivers and the config loader**

At the top of `AgentsService.ts`:

```ts
import { loadProjectConfigByName } from 'crew-shared/config/loader';
import { deriveAppUrl, deriveJiraUrl } from 'crew-shared/config/derive-urls';
```

(Verify the package's existing import path style — search for an existing `from 'crew-shared/...'` in the file to match.)

- [ ] **Step 2: Read project config in `getByKey`**

Inside `getByKey`, after `const project = agent?.project_name ?? '';`:

```ts
let appUrl: string | null = null;
let jiraUrl: string | null = null;
if (project) {
  try {
    const cfg = loadProjectConfigByName(project, this.projectsDir);
    appUrl = deriveAppUrl(cfg);
    jiraUrl = deriveJiraUrl(cfg, key);
  } catch {
    // Missing or invalid project config: leave the URLs null; the drawer
    // hides the corresponding pills rather than failing the request.
  }
}
```

Then in the return object, replace the stub `app_url: null, jira_url: null` with `app_url: appUrl, jira_url: jiraUrl`.

- [ ] **Step 3: Run the test from 1.3**

```
npm -w crew-daemon test -- AgentsService
```
Expected: PASS for `app_url` + `jira_url` assertions.

- [ ] **Step 4: Add null-path tests**

```ts
it('returns null app_url + jira_url when project config missing', async () => {
  const svc = new AgentsService({ db, projectsDir: '/nonexistent' });
  // seed agent...
  const detail = await svc.getByKey('KAN-23');
  expect(detail?.app_url).toBeNull();
  expect(detail?.jira_url).toBeNull();
});

it('returns null app_url when neither playwright nor bruno_smoke configured', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'crew-projects-'));
  await writeFile(join(tmp, 'kanban-api.toml'), `
name = "kanban-api"
repo_path = "~/code/kanban-api"
[jira]
project_key = "KAN"
site = "https://safturento.atlassian.net"
[github]
repo = "safturento/kanban-api"
`);
  const svc = new AgentsService({ db, projectsDir: tmp });
  // seed agent...
  const detail = await svc.getByKey('KAN-23');
  expect(detail?.app_url).toBeNull();
  expect(detail?.jira_url).toBe('https://safturento.atlassian.net/browse/KAN-23');
});
```

- [ ] **Step 5: Run, verify all pass**

```
npm -w crew-daemon test -- AgentsService
```

- [ ] **Step 6: Commit**

```
git add packages/daemon/src/services/AgentsService.ts packages/daemon/src/services/AgentsService.test.ts
git commit -m "feat(daemon): compose app_url + jira_url on AgentDetail (CREW-XXX)"
```

### Task 1.5 — Aggregate `tokens_by_tool`

**Files:**
- Modify: `packages/daemon/src/services/AgentsService.ts` — extend `getByKey` with a second aggregate query
- Modify: `packages/daemon/src/services/AgentsService.test.ts`

- [ ] **Step 1: Write failing test**

```ts
it('aggregates tokens_by_tool across all of the agent\'s runs', async () => {
  // seed: one agent, two runs; tool_calls:
  //   run1: Bash×2 (1000 + 500 tokens), Read×1 (200 tokens)
  //   run2: Bash×1 (300 tokens), Edit×1 (700 tokens)
  // total = 2700; expected order by tokens desc:
  //   Bash 1800 (66.67%), Edit 700 (25.93%), Read 200 (7.41%)
  // ...seed code...
  const detail = await svc.getByKey('KAN-23');
  expect(detail?.tokens_by_tool).toEqual([
    { tool: 'Bash', tokens: 1800, percent: expect.closeTo(66.67, 1) },
    { tool: 'Edit', tokens: 700, percent: expect.closeTo(25.93, 1) },
    { tool: 'Read', tokens: 200, percent: expect.closeTo(7.41, 1) },
  ]);
});

it('returns empty tokens_by_tool array for agent with no tool calls', async () => {
  // seed: agent + run but no tool_calls
  const detail = await svc.getByKey('KAN-23');
  expect(detail?.tokens_by_tool).toEqual([]);
});
```

> Use the existing seed helpers in the test file. If they don't expose `tool_calls` seeding, extend them with a `seedToolCall({ run_id, tool_name, output_tokens, input_tokens, ... })` helper in the same file. Keep the helper colocated.

- [ ] **Step 2: Run, verify failure**

- [ ] **Step 3: Write the aggregate query in `getByKey`**

Place after the existing `totals` query (~line 233):

```ts
const tokensByToolRows = await this.db
  .selectFrom('tool_calls as tc')
  .innerJoin('runs as r', 'r.id', 'tc.run_id')
  .select([
    'tc.tool_name as tool',
    sql<number>`COALESCE(SUM(tc.input_tokens + tc.output_tokens + tc.cache_read_tokens + tc.cache_creation_tokens), 0)`.as('tokens'),
  ])
  .where('r.agent_key', '=', key)
  .groupBy('tc.tool_name')
  .orderBy('tokens', 'desc')
  .execute();

const tokensTotal = tokensByToolRows.reduce((sum, r) => sum + Number(r.tokens), 0);
const tokensByTool: AgentDetailTokensByTool[] = tokensByToolRows.map((r) => ({
  tool: r.tool,
  tokens: Number(r.tokens),
  percent: tokensTotal === 0 ? 0 : Math.round((Number(r.tokens) / tokensTotal) * 10000) / 100,
}));
```

Then in the return object, replace the stub `tokens_by_tool: []` with `tokens_by_tool: tokensByTool`.

- [ ] **Step 4: Run, verify pass**

```
npm -w crew-daemon test -- AgentsService
```

- [ ] **Step 5: Commit**

```
git add packages/daemon/src/services/AgentsService.ts packages/daemon/src/services/AgentsService.test.ts
git commit -m "feat(daemon): aggregate tokens_by_tool on AgentDetail (CREW-XXX)"
```

### Task 1.6 — Extend the API route schema

> The route layer uses `fastify-type-provider-zod` (see daemon AGENTS.md). The response schema needs the three new fields so the response is validated and typed.

**Files:**
- Modify: the file holding the `getAgentByKey` / `/api/agents/:key` route handler. Search: `grep -rn "agents/:key\|getByKey" packages/daemon/src/routes/`.
- Modify: the corresponding zod schema (likely in the same file or a sibling `schemas.ts`).

- [ ] **Step 1: Locate the route + schema**

```
grep -rn "agents/:key\|getByKey" packages/daemon/src/routes/
```

- [ ] **Step 2: Extend the response zod schema**

Add to the AgentDetail response schema:

```ts
app_url: z.string().nullable(),
jira_url: z.string().nullable(),
tokens_by_tool: z.array(z.object({
  tool: z.string(),
  tokens: z.number().int().nonnegative(),
  percent: z.number().min(0).max(100),
})),
```

- [ ] **Step 3: Run the integration/bruno tests for the agents route**

```
npm -w crew-daemon test
```
Expected: PASS. If the daemon has Bruno integration coverage, run that too per `bruno-collection-maintenance` skill guidance.

- [ ] **Step 4: Commit**

```
git add packages/daemon/src/routes/  # (actual path from step 1)
git commit -m "feat(daemon): include new fields in /api/agents/:key response schema (CREW-XXX)"
```

### Task 1.7 — Mirror the new fields on the dashboard `AgentDetail`

**Files:**
- Modify: `packages/dashboard/src/data/types.ts:79-…` (the `AgentDetail` interface)

- [ ] **Step 1: Add fields to client-side interface**

```ts
// packages/dashboard/src/data/types.ts
export interface AgentDetailTokensByTool {
  tool: string;
  tokens: number;
  percent: number;
}

export interface AgentDetail {
  // ...existing fields
  app_url: string | null;
  jira_url: string | null;
  tokens_by_tool: AgentDetailTokensByTool[];
}
```

- [ ] **Step 2: Typecheck**

```
npm -w crew-dashboard run typecheck
```
Expected: PASS (consumers of AgentDetail that don't use the new fields are unaffected).

- [ ] **Step 3: Commit**

```
git add packages/dashboard/src/data/types.ts
git commit -m "feat(dashboard): mirror new AgentDetail fields on the client interface (CREW-XXX)"
```

### Task 1.8 — Wire `tool_calls.changed` invalidation into `useAgent`

**Files:**
- Modify: `packages/dashboard/src/data/queries.ts:33-63` (the `useAgent` hook)
- (No test scaffold exists for `queries.ts` invalidation today — verify via dev seed + browser DevTools that `useAgent` re-fetches when `tool_calls.changed` fires.)

- [ ] **Step 1: Add the new event listener**

```ts
// packages/dashboard/src/data/queries.ts, inside useAgent's useEffect
const offToolCalls = eventStream.on('tool_calls.changed', (raw) => {
  const d = raw as KeyedPayload;
  if (d.key !== key) return;
  void qc.invalidateQueries({ queryKey: ['agent', key] });
});

return () => {
  offState();
  offRunCompleted();
  offToolCalls();
};
```

- [ ] **Step 2: Typecheck + lint**

```
npm -w crew-dashboard run typecheck
npm -w crew-dashboard run lint
```
Expected: PASS.

- [ ] **Step 3: Manual smoke**

Start daemon + dashboard via `docker-compose up` (see `.agents/local-dev.md` if unclear). Open the drawer for an active agent, trigger a tool call via the seed harness or by attaching the daemon to a real run, watch the Network tab — `useAgent` should re-fetch within ~100ms of each `tool_calls.changed` event.

- [ ] **Step 4: Commit**

```
git add packages/dashboard/src/data/queries.ts
git commit -m "feat(dashboard): invalidate useAgent on tool_calls.changed for live tokens_by_tool (CREW-XXX)"
```

### Task 1.9 — Open Ticket 1 PR

- [ ] Push branch `feat/agent-detail-extensions-CREW-XXX`.
- [ ] `gh pr create` with body referencing the Jira ticket + the spec link.
- [ ] Verify CI green (typecheck, lint, unit tests). No `visual-fidelity-check` on this ticket — backend-only PR.

---

## Ticket 2 — `<DrawerHeader>` composite

**Scope:** Extract `DrawerHeader` from `AgentBody`'s inline `AgentHeader`. Match Figma node `594:803`. Blocked by ticket 1.

**Branch:** `feat/drawer-header-CREW-YYY`.

### Task 2.1 — Scaffold `DrawerHeader.tsx`

**Files:**
- Create: `packages/dashboard/src/components/DrawerHeader.tsx`
- Create: `packages/dashboard/src/components/DrawerHeader.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/dashboard/src/components/DrawerHeader.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DrawerHeader } from './DrawerHeader.js';
import type { AgentDetail } from '../data/types.js';

function makeDetail(overrides: Partial<AgentDetail> = {}): AgentDetail {
  return {
    key: 'KAN-23',
    project: 'kanban-api',
    ticket_key: 'KAN-23',
    ticket_title: 'Drag-and-drop reordering keeps stale board state',
    state: 'running',
    worktree_path: '~/code/kanban-api/.worktrees/KAN-23',
    pr_url: null,
    app_url: 'http://localhost:7421',
    jira_url: 'https://safturento.atlassian.net/browse/KAN-23',
    tokens_by_tool: [],
    runs: [{
      id: 'r1', command: 'run', started_at: '2026-05-22T14:30:00Z', completed_at: null,
      doc_load_coverage_pct: null, cleanliness_pass: null, pr_claim_input_tokens: null, parity_violations: null,
    }],
    tokens: { total: 48_000, input: 30_000, output: 5_000, cache_read: 10_000, cache_creation: 3_000 },
    tool_call_count: 12,
    ...overrides,
  };
}

describe('DrawerHeader', () => {
  it('renders project + ticket key + state label in the breadcrumb', () => {
    render(<DrawerHeader detail={makeDetail()} showCloseButton showOpenAsPage />);
    expect(screen.getByText('kanban-api')).toBeInTheDocument();
    expect(screen.getAllByText(/KAN-23/)[0]).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', expect.stringMatching(/running/i));
  });

  it('renders the ticket title as the heading', () => {
    render(<DrawerHeader detail={makeDetail()} showCloseButton={false} showOpenAsPage={false} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Drag-and-drop reordering keeps stale board state',
    );
  });

  it('renders all three meta-row pills when fields are present', () => {
    render(<DrawerHeader detail={makeDetail()} showCloseButton={false} showOpenAsPage={false} />);
    expect(screen.getByRole('link', { name: /localhost:7421/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /KAN-23/ })).toBeInTheDocument();
    expect(screen.getByText(/\.worktrees\/KAN-23/)).toBeInTheDocument();
  });

  it('hides app_url pill when app_url is null', () => {
    render(<DrawerHeader detail={makeDetail({ app_url: null })} showCloseButton={false} showOpenAsPage={false} />);
    expect(screen.queryByRole('link', { name: /localhost/ })).not.toBeInTheDocument();
  });

  it('hides jira_url pill when jira_url is null', () => {
    render(<DrawerHeader detail={makeDetail({ jira_url: null })} showCloseButton={false} showOpenAsPage={false} />);
    expect(screen.queryByRole('link', { name: /atlassian/ })).not.toBeInTheDocument();
  });

  it('renders Provide-input pill only when state is `waiting`', () => {
    const { rerender } = render(<DrawerHeader detail={makeDetail({ state: 'running' })} showCloseButton showOpenAsPage />);
    expect(screen.queryByRole('button', { name: /provide input/i })).not.toBeInTheDocument();
    // 'waiting' isn't in AgentState union from the daemon today (CREW-XXX-followup),
    // so cast for the test. If/when the type widens, drop the cast.
    rerender(<DrawerHeader detail={makeDetail({ state: 'waiting' as any })} showCloseButton showOpenAsPage />);
    expect(screen.getByRole('button', { name: /provide input/i })).toBeInTheDocument();
  });

  it('renders X close button when showCloseButton=true and calls onClose on click', async () => {
    const onClose = vi.fn();
    render(<DrawerHeader detail={makeDetail()} showCloseButton showOpenAsPage={false} onClose={onClose} />);
    const x = screen.getByRole('button', { name: /close drawer/i });
    x.click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('hides X close button when showCloseButton=false', () => {
    render(<DrawerHeader detail={makeDetail()} showCloseButton={false} showOpenAsPage={false} />);
    expect(screen.queryByRole('button', { name: /close drawer/i })).not.toBeInTheDocument();
  });

  it('renders Open-as-page link only when showOpenAsPage=true', () => {
    const { rerender } = render(<DrawerHeader detail={makeDetail()} showCloseButton={false} showOpenAsPage />);
    expect(screen.getByRole('link', { name: /open as page/i })).toBeInTheDocument();
    rerender(<DrawerHeader detail={makeDetail()} showCloseButton={false} showOpenAsPage={false} />);
    expect(screen.queryByRole('link', { name: /open as page/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, verify failures (file doesn't exist)**

```
npm -w crew-dashboard test -- DrawerHeader
```

- [ ] **Step 3: Implement `DrawerHeader.tsx`**

Pattern reference: `AgentBody.tsx:53-117` (the current inline AgentHeader — copy, adapt). The Pill primitives are in `src/components/ui/` (search for `Button.tsx` / `Badge.tsx` — these are the lucide-react-icon-accepting variants).

```tsx
// packages/dashboard/src/components/DrawerHeader.tsx
import { useEffect, useState } from 'react';
import { ArrowUpRight, Circle, Container, FolderGit, GitPullRequest, SquareArrowOutUpRight, X } from 'lucide-react';

import { formatDuration } from '../format/duration.js';
import { formatTokens } from '../format/tokens.js';
import type { AgentDetail, AgentState } from '../data/types.js';
import { STATE_META } from '../data/state-meta.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';

const ACTIVE_STATES = new Set<AgentState>(['running', 'initializing']);

interface DrawerHeaderProps {
  detail: AgentDetail;
  showCloseButton: boolean;
  showOpenAsPage: boolean;
  onClose?: () => void;
}

export function DrawerHeader({ detail, showCloseButton, showOpenAsPage, onClose }: DrawerHeaderProps) {
  const startedAt = detail.runs[0]?.started_at;
  const live = ACTIVE_STATES.has(detail.state);
  const runtime = useLiveRuntime(startedAt, live);
  const meta = STATE_META[detail.state];
  // 'waiting' is on the type but daemon doesn't emit it yet; tolerate the cast.
  const isWaiting = detail.state === ('waiting' as AgentState);

  return (
    <header
      data-testid="drawer-header"
      className="flex flex-col gap-3 border-b border-white/10 bg-card px-6 py-4"
    >
      {/* breadcrumb row */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
          {detail.project}
        </span>
        <span className="font-mono text-xs text-muted-foreground">{detail.ticket_key}</span>
        <Badge role="status" aria-label={meta.label} color={detail.state} intensity="mid" icon={<Circle aria-hidden />}>
          {meta.label}
        </Badge>
        {runtime && (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{runtime}</span>
        )}
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatTokens(detail.tokens.total)}
        </span>

        {/* top-right action pills */}
        <div className="ml-auto flex items-center gap-2">
          {showOpenAsPage && (
            <Button color="running" intensity="ghost" size="xs" icon={<ArrowUpRight aria-hidden />} asChild>
              <a href={`#/agent/${encodeURIComponent(detail.key)}/full`}>Open as page</a>
            </Button>
          )}
          {isWaiting && (
            <Button color="waiting" intensity="loud" size="xs" icon={<GitPullRequest aria-hidden />}>
              Provide input
            </Button>
          )}
          {showCloseButton && (
            <Button
              color="running"
              intensity="ghost"
              size="xs"
              icon={<X aria-hidden />}
              aria-label="Close drawer"
              onClick={onClose}
              disabled={!onClose}
            />
          )}
        </div>
      </div>

      {/* title row */}
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        {detail.ticket_title ?? detail.ticket_key}
      </h1>

      {/* meta row (mono pills) */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {detail.app_url && (
          <Button color="idle" intensity="mid" size="sm" icon={<Container aria-hidden />} asChild className="font-mono">
            <a href={detail.app_url} target="_blank" rel="noreferrer">{detail.app_url}</a>
          </Button>
        )}
        {detail.jira_url && (
          <Button color="idle" intensity="mid" size="sm" icon={<SquareArrowOutUpRight aria-hidden />} asChild className="font-mono">
            <a href={detail.jira_url} target="_blank" rel="noreferrer">{detail.ticket_key}</a>
          </Button>
        )}
        <Button color="idle" intensity="mid" size="sm" icon={<FolderGit aria-hidden />} className="font-mono">
          {detail.worktree_path}
        </Button>
      </div>
    </header>
  );
}

function useLiveRuntime(startedAt: string | undefined, live: boolean): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [live]);
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return null;
  return formatDuration(now - start);
}
```

- [ ] **Step 4: Run, verify pass**

```
npm -w crew-dashboard test -- DrawerHeader
```

- [ ] **Step 5: Commit**

```
git add packages/dashboard/src/components/DrawerHeader.tsx packages/dashboard/src/components/DrawerHeader.test.tsx
git commit -m "feat(dashboard): DrawerHeader composite (CREW-YYY)"
```

### Task 2.2 — Wire `DrawerHeader` into `AgentBody`

**Files:**
- Modify: `packages/dashboard/src/components/AgentBody.tsx`

- [ ] **Step 1: Replace inline `AgentHeader`**

Reduce `AgentBody.tsx` to:

```tsx
// packages/dashboard/src/components/AgentBody.tsx
import { useAgent } from '../data/queries.js';
import { DrawerHeader } from './DrawerHeader.js';
import { Timeline } from './Timeline/Timeline.js';

export type AgentBodyMode = 'drawer' | 'full';

interface AgentBodyProps {
  agentKey: string;
  mode: AgentBodyMode;
  onClose?: () => void;
}

export function AgentBody({ agentKey, mode, onClose }: AgentBodyProps) {
  const { data, isLoading, error } = useAgent(agentKey);

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
    <div data-testid="agent-body" className="flex h-full min-h-0 flex-col">
      <DrawerHeader
        detail={data}
        showCloseButton={mode === 'drawer'}
        showOpenAsPage={mode === 'drawer'}
        onClose={onClose}
      />
      <div className="min-h-0 flex-1">
        <Timeline agentKey={agentKey} agentState={data.state} />
      </div>
    </div>
  );
}
```

> Note: `RunMetrics` import + render REMOVED. Tracked in `docs/followups.md` (2026-05-22 entry).

- [ ] **Step 2: Update `AgentBody.test.tsx` if it referenced inline AgentHeader internals**

Search: `grep -n "AgentHeader\|WorktreePathLink" packages/dashboard/src/components/AgentBody.test.tsx`. Replace references with DrawerHeader equivalents or move those assertions into `DrawerHeader.test.tsx`.

- [ ] **Step 3: Update `AgentDrawer.tsx` to drop the standalone close + pass onClose**

```tsx
// packages/dashboard/src/routes/AgentDrawer.tsx
import { useEffect } from 'react';
import { AgentBody } from '../components/AgentBody.js';
import { navigate } from '../routing/useHashRoute.js';

interface AgentDrawerProps {
  agentKey: string;
}

export function AgentDrawer({ agentKey }: AgentDrawerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        navigate('/');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label="Agent detail" className="fixed inset-0 z-50 flex justify-end">
      <div
        data-testid="drawer-backdrop"
        aria-hidden
        onClick={() => navigate('/')}
        className="absolute inset-0 cursor-default bg-black/40"
      />
      <aside className="relative z-10 flex h-full w-full max-w-5xl flex-col bg-background shadow-2xl">
        <AgentBody agentKey={agentKey} mode="drawer" onClose={() => navigate('/')} />
      </aside>
    </div>
  );
}
```

The standalone `<button>` with `Close ✕` is **deleted**.

- [ ] **Step 4: Run test suites**

```
npm -w crew-dashboard test
```
Expected: PASS. Update any AgentDrawer / AgentBody tests that asserted on the old standalone close button.

- [ ] **Step 5: Visual smoke (manual)**

Open dashboard, click an agent row, verify drawer renders with new header. Click X — drawer closes. Click backdrop — closes. Press Escape — closes.

- [ ] **Step 6: Commit**

```
git add packages/dashboard/src/components/AgentBody.tsx packages/dashboard/src/routes/AgentDrawer.tsx packages/dashboard/src/components/AgentBody.test.tsx
git commit -m "refactor(dashboard): use DrawerHeader in AgentBody; drop AgentDrawer standalone close (CREW-YYY)"
```

### Task 2.3 — Add Code Connect mapping

**Files:**
- Create: `packages/dashboard/src/components/DrawerHeader.figma.tsx`

- [ ] **Step 1: Follow the existing pattern**

Pattern reference: `packages/dashboard/src/components/AgentBody.figma.tsx`. Verify the Figma node ID matches the snapshot (`594:803` from `.crew/figma-snapshot/index.json`).

```tsx
// packages/dashboard/src/components/DrawerHeader.figma.tsx
import figma from '@figma/code-connect';
import { DrawerHeader } from '@/components/DrawerHeader';

figma.connect(
  DrawerHeader,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=594-803',
  {
    props: {
      showCloseButton: figma.boolean('Show close button'),
      showOpenAsPage: figma.boolean('Show Open as page'),
    },
    example: ({ showCloseButton, showOpenAsPage }) => (
      <DrawerHeader detail={/* AgentDetail fixture */ {} as any} showCloseButton={showCloseButton} showOpenAsPage={showOpenAsPage} />
    ),
  },
);
```

> Per memory `project_code_connect_skipped.md`: crew is on Figma Pro, not Org — Code Connect *publishing* is skipped. The `.figma.tsx` file lives as an inert doc on disk; do not run `figma connect publish`. Read by the `design-with-figma` skill from disk.

- [ ] **Step 2: Typecheck**

```
npm -w crew-dashboard run typecheck
```

- [ ] **Step 3: Commit**

```
git add packages/dashboard/src/components/DrawerHeader.figma.tsx
git commit -m "docs(dashboard): Code Connect mapping for DrawerHeader (CREW-YYY)"
```

### Task 2.4 — Run visual-fidelity-check

- [ ] Run the `visual-fidelity-check` skill against Figma node `594:803` (DrawerHeader) and `220:246` (AgentBody, which now embeds DrawerHeader).
- [ ] Address any HIGH-severity findings; file MEDIUM/LOW as followups per the skill's procedure.
- [ ] Commit any polish fixes.

### Task 2.5 — Open Ticket 2 PR

- [ ] Push branch `feat/drawer-header-CREW-YYY`.
- [ ] `gh pr create` referencing the Jira ticket + spec + base branch should be Ticket 1's PR (or `main` once Ticket 1 has merged).

---

## Ticket 3 — `<TokensByTool>` composite

**Scope:** New `TokensByTool` + `TokenBarRow` composites consuming `AgentDetail.tokens_by_tool`. Match Figma nodes `577:643` + `555:449`. Blocked by ticket 1.

**Branch:** `feat/tokens-by-tool-CREW-ZZZ`.

### Task 3.1 — `TokenBarRow` primitive

**Files:**
- Create: `packages/dashboard/src/components/TokenBarRow.tsx`
- Create: `packages/dashboard/src/components/TokenBarRow.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// packages/dashboard/src/components/TokenBarRow.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokenBarRow } from './TokenBarRow.js';

describe('TokenBarRow', () => {
  it('renders tool, formatted tokens, and percent', () => {
    render(<TokenBarRow tool="Bash" tokens={18_400} percent={38.4} />);
    expect(screen.getByText('Bash')).toBeInTheDocument();
    expect(screen.getByText(/18\.?4k/i)).toBeInTheDocument();
    expect(screen.getByText('38.4%')).toBeInTheDocument();
  });

  it('sets the bar width proportional to percent', () => {
    render(<TokenBarRow tool="Read" tokens={9_600} percent={20.1} />);
    const bar = screen.getByTestId('token-bar-fill');
    expect(bar).toHaveStyle({ width: '20.1%' });
  });

  it('applies tabular-nums to the token cell', () => {
    render(<TokenBarRow tool="Edit" tokens={4_200} percent={8.8} />);
    expect(screen.getByText(/4\.?2k/i).className).toMatch(/tabular-nums/);
  });
});
```

- [ ] **Step 2: Run, verify failure**

- [ ] **Step 3: Implement**

```tsx
// packages/dashboard/src/components/TokenBarRow.tsx
import { formatTokens } from '../format/tokens.js';

interface TokenBarRowProps {
  tool: string;
  tokens: number;
  percent: number;
}

export function TokenBarRow({ tool, tokens, percent }: TokenBarRowProps) {
  return (
    <div className="grid grid-cols-[1fr_auto_3fr_auto] items-center gap-4 border-t border-border px-4 py-2 text-sm">
      <span className="text-foreground">{tool}</span>
      <span className="text-right font-mono text-foreground tabular-nums">{formatTokens(tokens)}</span>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          data-testid="token-bar-fill"
          className="h-full rounded-full bg-foreground/40"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-right font-mono text-xs text-muted-foreground tabular-nums">
        {percent.toFixed(1)}%
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run, verify pass; commit**

```
npm -w crew-dashboard test -- TokenBarRow
git add packages/dashboard/src/components/TokenBarRow.tsx packages/dashboard/src/components/TokenBarRow.test.tsx
git commit -m "feat(dashboard): TokenBarRow primitive (CREW-ZZZ)"
```

### Task 3.2 — `TokensByTool` composite

**Files:**
- Create: `packages/dashboard/src/components/TokensByTool.tsx`
- Create: `packages/dashboard/src/components/TokensByTool.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// packages/dashboard/src/components/TokensByTool.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokensByTool } from './TokensByTool.js';

describe('TokensByTool', () => {
  it('renders one row per tool in the order received', () => {
    render(<TokensByTool tokensByTool={[
      { tool: 'Bash', tokens: 18_400, percent: 38.4 },
      { tool: 'Read', tokens: 12_100, percent: 25.2 },
      { tool: 'Edit', tokens: 9_600, percent: 20.1 },
    ]} total={40_100} />);
    const rows = screen.getAllByRole('row');
    expect(rows[0]).toHaveTextContent('Bash');
    expect(rows[1]).toHaveTextContent('Read');
    expect(rows[2]).toHaveTextContent('Edit');
  });

  it('renders the formatted total in the footer', () => {
    render(<TokensByTool tokensByTool={[]} total={48_000} />);
    expect(screen.getByText(/Total/i)).toBeInTheDocument();
    expect(screen.getByText(/48k/i)).toBeInTheDocument();
  });

  it('renders an empty-state row when tokens_by_tool is empty', () => {
    render(<TokensByTool tokensByTool={[]} total={0} />);
    expect(screen.getByText(/no tool usage yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, verify failure**

- [ ] **Step 3: Implement**

```tsx
// packages/dashboard/src/components/TokensByTool.tsx
import type { AgentDetailTokensByTool } from '../data/types.js';
import { formatTokens } from '../format/tokens.js';
import { TokenBarRow } from './TokenBarRow.js';

interface TokensByToolProps {
  tokensByTool: AgentDetailTokensByTool[];
  total: number;
}

export function TokensByTool({ tokensByTool, total }: TokensByToolProps) {
  return (
    <section
      className="overflow-hidden rounded-[10px] border border-border bg-card"
      aria-label="Tokens by tool"
    >
      <header className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground">
        <span>Tool</span>
        <span>Tokens</span>
      </header>
      <div role="rowgroup">
        {tokensByTool.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">No tool usage yet</div>
        ) : (
          tokensByTool.map((row) => (
            <div role="row" key={row.tool}>
              <TokenBarRow tool={row.tool} tokens={row.tokens} percent={row.percent} />
            </div>
          ))
        )}
      </div>
      <footer className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-2 text-xs">
        <span className="font-semibold text-muted-foreground">Total</span>
        <span className="font-mono text-foreground tabular-nums">{formatTokens(total)}</span>
      </footer>
    </section>
  );
}
```

- [ ] **Step 4: Run, verify pass; commit**

```
npm -w crew-dashboard test -- TokensByTool
git add packages/dashboard/src/components/TokensByTool.tsx packages/dashboard/src/components/TokensByTool.test.tsx
git commit -m "feat(dashboard): TokensByTool composite (CREW-ZZZ)"
```

### Task 3.3 — Wire `TokensByTool` into `AgentBody`'s body container

**Files:**
- Modify: `packages/dashboard/src/components/AgentBody.tsx`

- [ ] **Step 1: Add the section**

In `AgentBody.tsx`, change the body wrapping from a single Timeline div to a `BodyContainer` that holds TokensByTool above Timeline:

```tsx
return (
  <div data-testid="agent-body" className="flex h-full min-h-0 flex-col">
    <DrawerHeader … />
    <div className="flex min-h-0 flex-1 flex-col gap-7 px-6 pb-8 pt-5" data-testid="body-container">
      <TokensByTool tokensByTool={data.tokens_by_tool} total={data.tokens.total} />
      <div className="min-h-0 flex-1">
        <Timeline agentKey={agentKey} agentState={data.state} />
      </div>
    </div>
  </div>
);
```

Padding `pt-5 px-6 pb-8` ≈ Figma `20 / 24 / 32 / 24`; `gap-7` ≈ Figma's 28.

- [ ] **Step 2: Manual smoke**

Open the drawer, verify TokensByTool renders above Timeline with real data.

- [ ] **Step 3: Commit**

```
git add packages/dashboard/src/components/AgentBody.tsx
git commit -m "refactor(dashboard): wire TokensByTool into AgentBody (CREW-ZZZ)"
```

### Task 3.4 — Code Connect mappings

**Files:**
- Create: `packages/dashboard/src/components/TokensByTool.figma.tsx`
- Create: `packages/dashboard/src/components/TokenBarRow.figma.tsx`

- [ ] **Step 1: Follow the same pattern as DrawerHeader.figma.tsx** (Task 2.3).

Figma node IDs: `TokensByTool` = `577:643`; `TokenBarRow` = `555:449`.

- [ ] **Step 2: Commit**

```
git add packages/dashboard/src/components/TokensByTool.figma.tsx packages/dashboard/src/components/TokenBarRow.figma.tsx
git commit -m "docs(dashboard): Code Connect mappings for TokensByTool + TokenBarRow (CREW-ZZZ)"
```

### Task 3.5 — Visual fidelity check + open PR

- [ ] Run `visual-fidelity-check` against `577:643` + `555:449`.
- [ ] Address HIGH findings; file lower-severity ones.
- [ ] Push branch + `gh pr create`. Base = Ticket 1 PR / main.

---

## Ticket 4 — Timeline state-grouping + Collapse-all

**Scope:** Refactor `Timeline.tsx` to per-state sections + add Collapse-all toolbar button. Match Figma `559:650` (TimelineSection) + `558:477` (TimelineToolbar). No hard dep on ticket 1 but reviews after for cohesion.

**Branch:** `feat/timeline-sections-CREW-AAA`.

### Task 4.1 — `groupEventsByState` pure function

**Files:**
- Create: `packages/dashboard/src/components/Timeline/groupEventsByState.ts`
- Create: `packages/dashboard/src/components/Timeline/groupEventsByState.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/dashboard/src/components/Timeline/groupEventsByState.test.ts
import { describe, it, expect } from 'vitest';
import { groupEventsByState } from './groupEventsByState.js';
import type { StateTransition, TranscriptEvent } from '../../data/types.js';

function ev(ts: number, tokens = 100): TranscriptEvent {
  return { timestamp: new Date(ts).toISOString(), /* …minimal valid event… */ } as TranscriptEvent;
}

describe('groupEventsByState', () => {
  it('returns a single section using fallbackState when transitions is empty', () => {
    const evs: TranscriptEvent[] = [ev(1000), ev(2000)];
    const sections = groupEventsByState(evs, [], 'running');
    expect(sections).toEqual([
      { state: 'running', startedAt: 1000, endedAt: null, events: evs },
    ]);
  });

  it('groups events into sections by transition timestamps, in chronological order', () => {
    const transitions: StateTransition[] = [
      { from: null, to: 'init', ts: 0 },
      { from: 'init', to: 'running', ts: 1000 },
      { from: 'running', to: 'waiting', ts: 5000 },
    ];
    const evs: TranscriptEvent[] = [ev(500), ev(1500), ev(2500), ev(6000)];
    const sections = groupEventsByState(evs, transitions, 'waiting');
    expect(sections.map((s) => s.state)).toEqual(['init', 'running', 'waiting']);
    expect(sections[0].events.map((e) => Date.parse(e.timestamp))).toEqual([500]);
    expect(sections[1].events.map((e) => Date.parse(e.timestamp))).toEqual([1500, 2500]);
    expect(sections[2].events.map((e) => Date.parse(e.timestamp))).toEqual([6000]);
  });

  it('marks the trailing (active) section endedAt=null', () => {
    const transitions: StateTransition[] = [{ from: null, to: 'running', ts: 0 }];
    const sections = groupEventsByState([], transitions, 'running');
    expect(sections[0].endedAt).toBeNull();
  });

  it('marks closed sections with the next transition\'s ts as endedAt', () => {
    const transitions: StateTransition[] = [
      { from: null, to: 'init', ts: 0 },
      { from: 'init', to: 'running', ts: 1000 },
    ];
    const sections = groupEventsByState([], transitions, 'running');
    expect(sections[0]).toMatchObject({ state: 'init', startedAt: 0, endedAt: 1000 });
    expect(sections[1]).toMatchObject({ state: 'running', startedAt: 1000, endedAt: null });
  });
});
```

- [ ] **Step 2: Run, verify failure**

- [ ] **Step 3: Implement**

```ts
// packages/dashboard/src/components/Timeline/groupEventsByState.ts
import type { AgentState, StateTransition, TranscriptEvent } from '../../data/types.js';

export interface TimelineSectionData {
  state: AgentState;
  startedAt: number;
  endedAt: number | null;
  events: TranscriptEvent[];
}

export function groupEventsByState(
  events: TranscriptEvent[],
  transitions: StateTransition[],
  fallbackState: AgentState,
): TimelineSectionData[] {
  if (transitions.length === 0) {
    const startedAt = events.length > 0 ? Date.parse(events[0].timestamp) : Date.now();
    return [{ state: fallbackState, startedAt, endedAt: null, events: [...events] }];
  }

  const sorted = [...transitions].sort((a, b) => a.ts - b.ts);
  const sections: TimelineSectionData[] = sorted.map((t, i) => ({
    state: t.to as AgentState,
    startedAt: t.ts,
    endedAt: sorted[i + 1]?.ts ?? null,
    events: [],
  }));

  for (const e of events) {
    const ts = Date.parse(e.timestamp);
    let idx = sections.findIndex(
      (s) => ts >= s.startedAt && (s.endedAt === null || ts < s.endedAt),
    );
    if (idx === -1) idx = 0; // pre-first-transition events fold into the first section
    sections[idx].events.push(e);
  }

  return sections;
}
```

- [ ] **Step 4: Run, verify pass; commit**

```
npm -w crew-dashboard test -- groupEventsByState
git add packages/dashboard/src/components/Timeline/groupEventsByState.ts packages/dashboard/src/components/Timeline/groupEventsByState.test.ts
git commit -m "feat(dashboard): groupEventsByState pure function (CREW-AAA)"
```

### Task 4.2 — `TimelineSection` component

**Files:**
- Create: `packages/dashboard/src/components/Timeline/TimelineSection.tsx`
- Create: `packages/dashboard/src/components/Timeline/TimelineSection.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// packages/dashboard/src/components/Timeline/TimelineSection.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimelineSection } from './TimelineSection.js';

describe('TimelineSection', () => {
  const baseProps = {
    state: 'running' as const,
    startedAt: Date.parse('2026-05-22T14:30:24Z'),
    elapsedMs: 8 * 60 * 1000 + 12 * 1000, // 8m 12s
    eventCount: 14,
    tokenSum: 24_000,
    isOpen: true,
    onToggle: vi.fn(),
  };

  it('renders the state pill, timestamp, elapsed, event count, token sum', () => {
    render(<TimelineSection {...baseProps}><div data-testid="body" /></TimelineSection>);
    expect(screen.getByText(/running/i)).toBeInTheDocument();
    expect(screen.getByText(/14:30:24/)).toBeInTheDocument();
    expect(screen.getByText(/8m\s*12s/i)).toBeInTheDocument();
    expect(screen.getByText(/14 events/)).toBeInTheDocument();
    expect(screen.getByText(/24k tokens/)).toBeInTheDocument();
  });

  it('shows the body when isOpen=true', () => {
    render(<TimelineSection {...baseProps} isOpen={true}><div data-testid="body" /></TimelineSection>);
    expect(screen.getByTestId('body')).toBeInTheDocument();
  });

  it('hides the body when isOpen=false', () => {
    render(<TimelineSection {...baseProps} isOpen={false}><div data-testid="body" /></TimelineSection>);
    expect(screen.queryByTestId('body')).not.toBeInTheDocument();
  });

  it('calls onToggle when the header is clicked', () => {
    const onToggle = vi.fn();
    render(<TimelineSection {...baseProps} onToggle={onToggle}><div /></TimelineSection>);
    fireEvent.click(screen.getByRole('button', { name: /toggle/i }));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run, verify failure**

- [ ] **Step 3: Implement**

```tsx
// packages/dashboard/src/components/Timeline/TimelineSection.tsx
import { ChevronDown, ChevronRight, Circle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AgentState } from '../../data/types.js';
import { STATE_META } from '../../data/state-meta.js';
import { formatDuration } from '../../format/duration.js';
import { formatTokens } from '../../format/tokens.js';
import { Badge } from '../ui/badge.js';

interface TimelineSectionProps {
  state: AgentState;
  startedAt: number;
  elapsedMs: number;
  eventCount: number;
  tokenSum: number;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function TimelineSection({
  state,
  startedAt,
  elapsedMs,
  eventCount,
  tokenSum,
  isOpen,
  onToggle,
  children,
}: TimelineSectionProps) {
  const meta = STATE_META[state];
  const timestamp = new Date(startedAt).toISOString().slice(11, 19); // HH:MM:SS

  return (
    <section className={`border-l-2 pl-3 border-state-${state}`}>
      <button
        type="button"
        aria-label={`Toggle ${meta.label} section`}
        onClick={onToggle}
        className="flex w-full items-center gap-2 py-2 text-left"
      >
        {isOpen ? <ChevronDown aria-hidden className="size-4" /> : <ChevronRight aria-hidden className="size-4" />}
        <Badge color={state} intensity="mid" icon={<Circle aria-hidden />}>{meta.label}</Badge>
        <span className="font-mono text-xs text-muted-foreground">started {timestamp}</span>
        <span className="font-mono text-xs text-muted-foreground">· {formatDuration(elapsedMs)}</span>
        <span className="font-mono text-xs text-muted-foreground">· {eventCount} event{eventCount === 1 ? '' : 's'}</span>
        <span className="font-mono text-xs text-muted-foreground">· {formatTokens(tokenSum)} tokens</span>
      </button>
      {isOpen && <div className="ml-6">{children}</div>}
    </section>
  );
}
```

- [ ] **Step 4: Run, verify pass; commit**

```
npm -w crew-dashboard test -- TimelineSection
git add packages/dashboard/src/components/Timeline/TimelineSection.tsx packages/dashboard/src/components/Timeline/TimelineSection.test.tsx
git commit -m "feat(dashboard): TimelineSection composite (CREW-AAA)"
```

### Task 4.3 — Refactor `Timeline.tsx` to render sections + add Collapse-all

**Files:**
- Modify: `packages/dashboard/src/components/Timeline/Timeline.tsx`
- Modify: `packages/dashboard/src/components/Timeline/Timeline.test.tsx`

- [ ] **Step 1: Extend the test suite**

Add to `Timeline.test.tsx`:

```tsx
it('groups events into per-state sections when transitions are available', async () => {
  // mock useTimeline + useStateHistory; render Timeline
  // assert: section headers render for each transition.to
});

it('falls back to a single ungrouped section when transitions is empty', async () => {
  // mock useStateHistory to return { transitions: [] }
  // assert: only one section header with detail.state
});

it('Collapse-all toggle collapses every section in one click', async () => {
  // render with two open sections
  // click "Collapse all"
  // assert: no event bodies visible; chevrons all show right-arrow
});
```

- [ ] **Step 2: Read current `Timeline.tsx`** (245 lines — `cat packages/dashboard/src/components/Timeline/Timeline.tsx`). Preserve `FilterChips`, `SearchBar`, `LiveModeToggle` wiring. Insert Collapse-all between Search and Live in the toolbar JSX.

- [ ] **Step 3: Implement the refactor**

Shape:

```tsx
// Sketch — adapt to existing imports/types in the file.
import { ListCollapse } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useTimeline, useStateHistory } from '../../data/queries.js';
import { groupEventsByState } from './groupEventsByState.js';
import { TimelineSection } from './TimelineSection.js';
import { Button } from '../ui/button.js';

export function Timeline({ agentKey, agentState }: TimelineProps) {
  const { data: tl } = useTimeline(agentKey);
  const { data: history } = useStateHistory(agentKey);
  const events = tl?.events ?? [];
  const transitions = history?.transitions ?? [];

  // existing filter + search state…
  const filtered = useMemo(() => applyFilters(events, /* filter, query */), [events]);
  const sections = useMemo(
    () => groupEventsByState(filtered, transitions, agentState),
    [filtered, transitions, agentState],
  );

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const collapseAll = () => {
    setCollapsed(Object.fromEntries(sections.map((s) => [sectionKey(s), true])));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-1 py-2">
        <FilterChips … />
        <SearchBar … />
        <Button color="idle" intensity="mid" size="sm" icon={<ListCollapse aria-hidden />} onClick={collapseAll}>
          Collapse all
        </Button>
        <LiveModeToggle … />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sections.map((s) => {
          const key = sectionKey(s);
          const isOpen = !collapsed[key];
          return (
            <TimelineSection
              key={key}
              state={s.state}
              startedAt={s.startedAt}
              elapsedMs={(s.endedAt ?? Date.now()) - s.startedAt}
              eventCount={s.events.length}
              tokenSum={s.events.reduce((sum, e) => sum + (e.tokens ?? 0), 0)}
              isOpen={isOpen}
              onToggle={() => setCollapsed((c) => ({ ...c, [key]: !c[key] }))}
            >
              {/* virtualize within the open section if event count is large */}
              {s.events.map((e) => <EventCard key={e.id} event={e} />)}
            </TimelineSection>
          );
        })}
      </div>
    </div>
  );
}

function sectionKey(s: TimelineSectionData): string {
  return `${s.state}:${s.startedAt}`;
}
```

> Virtualization: the existing `Timeline.tsx` likely uses `react-virtual` or similar. Apply it inside each section's children rather than across the whole list. If perf is fine without per-section virtualization for slice 1, omit and file a followup.

- [ ] **Step 4: Hook up live-elapsed in the active section**

Reuse the `useLiveRuntime` pattern from `DrawerHeader.tsx` — move it into a shared util (`src/format/useLiveRuntime.ts`) if it's getting reused. The active section is the one with `endedAt === null`.

- [ ] **Step 5: Run tests, verify pass**

```
npm -w crew-dashboard test -- Timeline
```

- [ ] **Step 6: Commit**

```
git add packages/dashboard/src/components/Timeline/Timeline.tsx packages/dashboard/src/components/Timeline/Timeline.test.tsx
git commit -m "feat(dashboard): Timeline state-grouped sections + Collapse-all (CREW-AAA)"
```

### Task 4.4 — Code Connect mapping for TimelineSection

**Files:**
- Create: `packages/dashboard/src/components/Timeline/TimelineSection.figma.tsx`

Figma node ID: `559:650`. Pattern matches Task 2.3.

- [ ] **Step 1: Implement, typecheck, commit.**

```
git add packages/dashboard/src/components/Timeline/TimelineSection.figma.tsx
git commit -m "docs(dashboard): Code Connect mapping for TimelineSection (CREW-AAA)"
```

### Task 4.5 — Visual fidelity check + open PR

- [ ] Run `visual-fidelity-check` against `559:650` (section variants) + `558:477` (toolbar) + `220:246` (AgentBody embedding both).
- [ ] Address HIGH findings.
- [ ] Push branch + `gh pr create`.

---

## Ticket 5 — Cleanup, AgentPage, e2e, followup resolution

**Scope:** Delete dead components; finalise AgentPage layout; land Playwright e2e; resolve the two affected followups. Blocked by tickets 2, 3, 4.

**Branch:** `chore/drawer-cleanup-CREW-BBB`.

### Task 5.1 — Delete `StateHistoryBar`

**Files:**
- Delete: `packages/dashboard/src/components/StateHistoryBar.tsx`
- Delete: `packages/dashboard/src/components/StateHistoryBar.test.tsx`
- Delete: `packages/dashboard/src/components/StateHistoryBar.figma.tsx`

- [ ] **Step 1: Verify zero callers**

```
grep -rn "StateHistoryBar" packages/dashboard/src/
```
Expected: only the three files above. If any external caller remains, fix that first.

- [ ] **Step 2: Delete + commit**

```
git rm packages/dashboard/src/components/StateHistoryBar.tsx
git rm packages/dashboard/src/components/StateHistoryBar.test.tsx
git rm packages/dashboard/src/components/StateHistoryBar.figma.tsx
git commit -m "chore(dashboard): delete StateHistoryBar — replaced by TimelineSection grouping (CREW-BBB)"
```

### Task 5.2 — Delete `TokenTable`

- [ ] **Step 1: Verify zero callers** (likely already zero — `TokenTable` was unused).

```
grep -rn "TokenTable" packages/dashboard/src/
```

- [ ] **Step 2: Delete + commit**

```
git rm packages/dashboard/src/components/TokenTable.tsx
git rm packages/dashboard/src/components/TokenTable.test.tsx
git rm packages/dashboard/src/components/TokenTable.figma.tsx
git commit -m "chore(dashboard): delete TokenTable — replaced by TokensByTool (CREW-BBB)"
```

### Task 5.3 — AgentPage width + padding

**Files:**
- Identify: search for AgentPage. `grep -rn "agent.*full\|AgentPage\|mode=\"full\"" packages/dashboard/src/`.
- Modify whichever route component embeds `<AgentBody mode="full" />`.

- [ ] **Step 1: Set width FIXED 1056px, centered, paddingTop 32**

Match Figma `1:1900` — AgentBody instance at FIXED 1056w, centered in pageContainer with paddingTop 32.

```tsx
<div className="flex justify-center pt-8">
  <div className="w-[1056px]">
    <AgentBody agentKey={key} mode="full" />
  </div>
</div>
```

- [ ] **Step 2: Manual smoke + commit**

```
git add packages/dashboard/src/routes/
git commit -m "feat(dashboard): AgentPage width + padding match Figma 1:1900 (CREW-BBB)"
```

### Task 5.4 — Playwright e2e

**Files:**
- Create: `packages/dashboard/e2e/agent-drawer-redesign.spec.ts`

- [ ] **Step 1: Use the existing e2e pattern**

Pattern: `packages/dashboard/e2e/*.spec.ts` (existing tests, likely from the CREW-109 set). Reuse dev seed fixtures.

```ts
// packages/dashboard/e2e/agent-drawer-redesign.spec.ts
import { test, expect } from '@playwright/test';

test('agent drawer redesign — header pills + timeline grouping + collapse-all', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('row', { name: /KAN-23/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Agent detail' });
  await expect(drawer).toBeVisible();

  // DrawerHeader pills
  await expect(drawer.getByText(/kanban-api/)).toBeVisible();
  await expect(drawer.getByRole('link', { name: /localhost/ })).toBeVisible();
  await expect(drawer.getByRole('link', { name: /KAN-23/ }).first()).toBeVisible();
  await expect(drawer.getByText(/\.worktrees\//)).toBeVisible();

  // TokensByTool section
  await expect(drawer.getByText(/Tool/, { exact: false })).toBeVisible();

  // Timeline sections — at least one open section visible
  const sectionToggle = drawer.getByRole('button', { name: /Toggle/ }).first();
  await expect(sectionToggle).toBeVisible();

  // Collapse-all collapses every section
  await drawer.getByRole('button', { name: 'Collapse all' }).click();
  // After collapse, no section body should be visible (verify by checking for absence of an EventCard testid)
  await expect(drawer.locator('[data-testid="event-card"]')).toHaveCount(0);

  // X close
  await drawer.getByRole('button', { name: 'Close drawer' }).click();
  await expect(drawer).not.toBeVisible();
});
```

- [ ] **Step 2: Run locally**

Follow the e2e command in `.agents/commands.md` (likely `npm -w crew-dashboard run e2e`).

- [ ] **Step 3: Commit**

```
git add packages/dashboard/e2e/agent-drawer-redesign.spec.ts
git commit -m "test(e2e): agent-drawer-redesign Playwright coverage (CREW-BBB)"
```

### Task 5.5 — Move affected followups to Resolved

**Files:**
- Modify: `docs/followups.md`

- [ ] **Step 1: Move the 2026-05-13 close-button followup**

In `docs/followups.md`, find `#### 2026-05-13 — Agent drawer Close button uses Unicode "✕"`. Cut from `## Active` → `### Dashboard UI`, paste into `## Resolved`. Append `**Resolved 2026-05-22:** Close moved into DrawerHeader's lucide X pill in ticket 2 of the drawer code migration Epic.`

- [ ] **Step 2: Move the 2026-05-08 wire-StateHistoryBar/TokenTable followup**

Find `#### 2026-05-08 — Wire \`StateHistoryBar\`, \`TokenTable\`, and Token-usage section into \`AgentBody\``. Cut + paste into Resolved. Append `**Resolved 2026-05-22:** StateHistoryBar deleted, Token-usage section shipped as TokensByTool. Drawer code migration Epic.`

- [ ] **Step 3: Commit**

```
git add docs/followups.md
git commit -m "docs(followups): resolve drawer Close-button + StateHistoryBar/TokenTable entries (CREW-BBB)"
```

### Task 5.6 — Final visual-fidelity-check sweep

- [ ] Run `visual-fidelity-check` once more covering: `220:246` (AgentBody), `1:378` (AgentDrawer screen), `1:1900` (AgentPage screen). Resolves any drift accumulated across tickets 2-4.

### Task 5.7 — Open PR

- [ ] Push, `gh pr create`. Base = main. Once merged, the Epic is done.

---

## Self-review checklist

Run this checklist against this plan before transitioning to ticket creation.

1. **Spec coverage.** Walk each section of the spec (`docs/superpowers/specs/2026-05-22-drawer-code-migration-design.md`) and confirm a task implements it:
   - [x] `app_url`, `jira_url`, `tokens_by_tool` on AgentDetail → Tasks 1.2-1.7
   - [x] `tool_calls.changed` listener on `useAgent` → Task 1.8
   - [x] `<DrawerHeader>` → Tasks 2.1-2.4 + AgentBody wire 2.2 + AgentDrawer close-button delete 2.2
   - [x] `<TokensByTool>` + `<TokenBarRow>` → Tasks 3.1-3.5
   - [x] State-grouped Timeline + Collapse-all → Tasks 4.1-4.5
   - [x] `groupEventsByState` fallback (empty transitions) → Task 4.1 (test) + 4.3 (consumer)
   - [x] Live-elapsed in active section → Task 4.3 step 4
   - [x] StateHistoryBar + TokenTable deletion → Tasks 5.1, 5.2
   - [x] AgentPage width/padding → Task 5.3
   - [x] Playwright e2e → Task 5.4
   - [x] Followups resolution → Task 5.5
   - [x] visual-fidelity-check gates on tickets 2/3/4/5 → Tasks 2.4, 3.5, 4.5, 5.6
   - [x] Code Connect mappings → Tasks 2.3, 3.4, 4.4
   - [x] RunMetrics drop (placement followup already filed) — confirmed in Task 2.2 step 1

2. **Placeholder scan.** No `TODO`, `TBD`, "implement later", or vague steps. Every step that mutates code includes runnable code or an exact pattern reference.

3. **Type consistency.** `AgentDetailTokensByTool` defined identically on daemon (`AgentsService.ts`) + dashboard (`data/types.ts`). `TimelineSectionData` defined in `groupEventsByState.ts`, consumed by `Timeline.tsx` (Task 4.3). `DrawerHeader` props match across `.tsx` + `.test.tsx` + `.figma.tsx`.

4. **Cross-ticket dependencies:**
   - Ticket 2 + 3 hard-dep on Ticket 1 (need the new fields on `AgentDetail`).
   - Ticket 4 has no hard backend dep — can run before Ticket 1 — but is queued in Phase 2 for review cohesion.
   - Ticket 5 hard-deps on Tickets 2, 3, 4.

5. **Branch off-of map:** Each ticket's branch starts from `main` once its dependencies are merged. If Ticket 1 hasn't merged when Ticket 2 starts, branch Ticket 2 off Ticket 1's PR branch and rebase after merge.

---

## After this plan

Per `~/.claude/CLAUDE.md` planning workflow:

1. Create one Epic in Jira (project: CREW) describing the migration. The Epic body links this plan + the spec.
2. Create five child tickets under the Epic — one per Ticket section above. Each ticket's description names the plan section + tasks it covers.
3. Add Jira `is blocked by` / `blocks` links:
   - Ticket 2 *is blocked by* Ticket 1
   - Ticket 3 *is blocked by* Ticket 1
   - Ticket 5 *is blocked by* Tickets 2, 3, 4
   - Ticket 4 is unblocked (no hard backend dep)
4. Present the parallelism schedule and confirm with the user.
5. **STOP.** The user triggers implementation via `crew run <KEY>`. Do not auto-dispatch.
