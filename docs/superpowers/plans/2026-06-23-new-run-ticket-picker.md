# New Run → Jira ticket picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the New Run modal's free-text ticket-key entry with a searchable, epic-grouped, dependency-aware Jira ticket picker served by a new daemon endpoint.

**Architecture:** Promote the Jira client from `packages/cli` to `packages/shared` and add `searchIssues`; the daemon gains a `TicketsService` + `GET /api/projects/:slug/tickets` route that fetches the project's Ready-for-Development tickets, groups them by parent Epic, classifies each runnable-vs-blocked from `is blocked by` links, and overlays which already have a live agent; the dashboard turns step 2 into a filterable list and degrades to the old text field when the daemon has no Jira access.

**Tech Stack:** TypeScript monorepo (npm workspaces). Shared: Zod. Daemon: Fastify + `fastify-type-provider-zod` + Awilix DI + Kysely. Dashboard: React + Vite + Tailwind + TanStack Query + Vitest/RTL. Bruno for endpoint smoke.

## Global Constraints

- **Three tickets map to the three tasks here:** T1 = Task 1, T2 = Task 2, T3 = Task 3. T1 is the foundation (blocks both); T2 and T3 build in parallel off T1's shared contract; merge order T1 → T2 → T3.
- **`available: false` is HTTP 200**, never a 5xx — a degraded (no-creds / Jira-unreachable) ticket list is an expected state.
- **One Jira network call** computes runnability — blockers' statuses come back inline on `issuelinks[].inwardIssue.fields.status`. Do not add a per-blocker round-trip.
- **Ready status is configurable:** read `project.jira.ready_status` (default `"Ready for Development"`); never hardcode the status string in daemon logic.
- **Terminal agent states** (an agent is NOT "active"): `finished`, `error`, `pr_merged`. Everything else (`initializing`, `running`, `idle`, `waiting`, `pr_open`) counts as active.
- **No new DB migration** — the picker computes on demand and persists nothing.
- **TDD throughout**, frequent commits. Run `npm run lint` + `npm run typecheck` before each task's final commit. Conventional-commit messages.
- **Gates before any PR:** `superpowers:verification-before-completion`, `agents-doc-parity-check`, `bruno-collection-maintenance` (T2), `visual-fidelity-check` (T3).

## File structure

**Task 1 (shared):**
- Move: `packages/cli/src/lib/jira/{client.ts,client.test.ts,fetch-ticket-summary.ts,fetch-ticket-summary.test.ts,index.ts}` → `packages/shared/src/jira/`
- Create: `packages/shared/src/jira/picker-tickets.ts` (Zod contract + types)
- Modify: `packages/shared/src/index.ts` (export `./jira/index.js`), `packages/shared/src/jira/index.ts` (also export picker-tickets), `packages/cli/src/lib/index.ts` (re-export jira surface from `crew-shared`), `packages/shared/src/config/schema.ts` (add `ready_status`)
- Delete: `packages/cli/src/lib/jira/` (after move)

**Task 2 (daemon):**
- Create: `packages/daemon/src/services/TicketsService.ts` + `TicketsService.test.ts`, `bruno/endpoints/projects/get-tickets.bru`
- Modify: `packages/daemon/src/config.ts` (creds), `packages/daemon/src/container.ts` (register `ticketsService`), `packages/daemon/src/routes/projects.ts` (new route), `packages/daemon/src/services/AgentsService.ts` (+`activeTicketKeys`), `docker-compose.yml` (daemon `environment:`)

**Task 3 (dashboard):**
- Modify: `packages/dashboard/src/data/DaemonClient.ts` (interface), `HttpDaemonClient.ts` (impl), `MockDaemonClient.ts` (impl), `components/NewRunModal.tsx` (picker), `components/ModalSelectionRow.tsx` (+`disabled`), `App.tsx` (pass `client` to NewRunModal)
- Create/extend tests: `NewRunModal.test.tsx`

---

## Task 1: Shared Jira client + search + contract + config

**Files:**
- Move: `packages/cli/src/lib/jira/*` → `packages/shared/src/jira/*`
- Create: `packages/shared/src/jira/picker-tickets.ts`, `packages/shared/src/jira/search.test.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/jira/index.ts`, `packages/shared/src/jira/client.ts`, `packages/cli/src/lib/index.ts`, `packages/shared/src/config/schema.ts`
- Test: `packages/shared/src/jira/client.test.ts` (moved), `packages/shared/src/jira/search.test.ts` (new), `packages/shared/src/config/schema.test.ts` (if present; else add an inline check)

**Interfaces:**
- Produces (consumed by T2 and T3):
  - `class JiraClient` with `searchIssues(jql: string, fields: string[]): Promise<JiraIssue[]>`
  - `interface JiraIssue` extended with `fields.priority`, `fields.issuelinks`, `fields.parent.fields.summary`, `fields.status.statusCategory`
  - `interface JiraIssueLink`, `interface JiraLinkedIssue`
  - `projectTicketsResponseSchema` (Zod), types `ProjectTicketsResponse`, `TicketGroup`, `PickerTicket`
  - config: `projectConfigSchema` `jira.ready_status: string` (default `"Ready for Development"`)

- [ ] **Step 1: Move the jira lib to shared (no code change yet)**

```bash
cd packages
git mv cli/src/lib/jira shared/src/jira
```

- [ ] **Step 2: Point the shared barrels at the moved module**

Add to `packages/shared/src/index.ts` (end of file):

```ts
export * from './jira/index.js';
```

Replace `packages/shared/src/jira/index.ts` with:

```ts
export * from './client.js';
export * from './fetch-ticket-summary.js';
export * from './picker-tickets.js';
```

- [ ] **Step 3: Re-export the jira surface from the CLI barrel**

In `packages/cli/src/lib/index.ts`, replace the line `export * from './jira/index.js';` with:

```ts
// Jira client moved to crew-shared (New Run ticket picker). Re-exported here so
// existing `../lib/index.js` importers (run/fix-pr/finish/backfill-titles) are
// unchanged.
export { JiraClient, fetchTicketSummary, fetchTicketSummaryFromEnv } from 'crew-shared';
export type { JiraClientOptions, JiraIssue, JiraTransition } from 'crew-shared';
```

- [ ] **Step 4: Verify the move didn't break the CLI**

Run: `npm run typecheck --workspace=crew-cli && npm run test --workspace=crew-cli -- jira`
Expected: PASS (moved `client.test.ts`/`fetch-ticket-summary.test.ts` now run under crew-shared; CLI compiles against the re-export). If `client.test.ts` imports a relative `./client.js`, it moved with the dir so paths still resolve.

- [ ] **Step 5: Commit the move**

```bash
git add -A
git commit -m "refactor(shared): move Jira client from cli to shared package"
```

- [ ] **Step 6: Write the failing test for `searchIssues`**

Create `packages/shared/src/jira/search.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { JiraClient } from './client.js';

afterEach(() => vi.restoreAllMocks());

function mockFetchOnce(json: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  );
}

describe('JiraClient.searchIssues', () => {
  it('builds /search/jql with jql + fields + maxResults and returns issues', async () => {
    const spy = mockFetchOnce({ issues: [{ key: 'CREW-1', fields: { summary: 'A', status: { name: 'Ready for Development' } } }] });
    const client = new JiraClient({ site: 'https://x.atlassian.net', email: 'e@x', token: 't' });

    const issues = await client.searchIssues('project = "CREW"', ['summary', 'status']);

    expect(issues).toHaveLength(1);
    expect(issues[0].key).toBe('CREW-1');
    const url = new URL(spy.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/rest/api/3/search/jql');
    expect(url.searchParams.get('jql')).toBe('project = "CREW"');
    expect(url.searchParams.get('fields')).toBe('summary,status');
    expect(url.searchParams.get('maxResults')).toBe('100');
  });

  it('returns [] when Jira responds with no issues array', async () => {
    mockFetchOnce({});
    const client = new JiraClient({ site: 'https://x.atlassian.net', email: 'e@x', token: 't' });
    expect(await client.searchIssues('project = "CREW"', ['summary'])).toEqual([]);
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npm run test --workspace=crew-shared -- search`
Expected: FAIL — `searchIssues is not a function`.

- [ ] **Step 8: Extend `JiraIssue` types and add `searchIssues`**

In `packages/shared/src/jira/client.ts`, replace the `JiraIssue` interface and add the link types:

```ts
export interface JiraLinkedIssue {
  key: string;
  fields: {
    summary?: string;
    status?: { name: string; statusCategory?: { key: string; name?: string } };
  };
}

export interface JiraIssueLink {
  type: { name: string; inward: string; outward: string };
  inwardIssue?: JiraLinkedIssue;
  outwardIssue?: JiraLinkedIssue;
}

export interface JiraIssue {
  key: string;
  fields: {
    summary?: string;
    status: { name: string; statusCategory?: { key: string; name?: string } };
    issuetype?: { name: string };
    priority?: { name: string } | null;
    parent?: { key: string; fields?: { summary?: string } };
    issuelinks?: JiraIssueLink[];
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
```

Add the method to the `JiraClient` class (after `transition`):

```ts
/**
 * JQL search via the v3 `/search/jql` endpoint. Single page of up to 100
 * issues — the picker's Ready-for-Development list is small, so pagination
 * is intentionally omitted (YAGNI). `fields` is the comma-joined field list
 * to hydrate (e.g. `['summary','status','parent','priority','issuelinks']`).
 */
async searchIssues(jql: string, fields: string[]): Promise<JiraIssue[]> {
  const params = new URLSearchParams({ jql, fields: fields.join(','), maxResults: '100' });
  const body = await this.request<{ issues?: JiraIssue[] }>(`/rest/api/3/search/jql?${params.toString()}`);
  return body.issues ?? [];
}
```

- [ ] **Step 9: Run the search test to verify it passes**

Run: `npm run test --workspace=crew-shared -- search`
Expected: PASS.

- [ ] **Step 10: Add the `ready_status` config field**

In `packages/shared/src/config/schema.ts`, change the `jira` object inside `projectConfigSchema`:

```ts
    jira: z.object({
      project_key: z.string(),
      site: z.url(),
      // CREW: the workflow status whose tickets the New Run picker lists as
      // candidates. Team-managed boards name this differently, so it's
      // configurable; the CREW board uses the default.
      ready_status: z.string().default('Ready for Development'),
    }),
```

- [ ] **Step 11: Add the picker-tickets contract (failing test first)**

Create `packages/shared/src/jira/picker-tickets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { projectTicketsResponseSchema } from './picker-tickets.js';

describe('projectTicketsResponseSchema', () => {
  it('accepts an available payload with grouped tickets', () => {
    const parsed = projectTicketsResponseSchema.parse({
      available: true,
      groups: [
        {
          epicKey: 'CREW-100',
          epicSummary: 'Epic A',
          tickets: [
            { key: 'CREW-101', summary: 'Do thing', priority: 'High', runnable: true, blockedBy: [], hasActiveAgent: false },
          ],
        },
      ],
    });
    expect(parsed.available).toBe(true);
  });

  it('accepts a degraded payload', () => {
    const parsed = projectTicketsResponseSchema.parse({ available: false, reason: 'no_credentials' });
    expect(parsed).toEqual({ available: false, reason: 'no_credentials' });
  });

  it('rejects an unknown degraded reason', () => {
    expect(() => projectTicketsResponseSchema.parse({ available: false, reason: 'nope' })).toThrow();
  });
});
```

- [ ] **Step 12: Run it to verify it fails**

Run: `npm run test --workspace=crew-shared -- picker-tickets`
Expected: FAIL — cannot find module `./picker-tickets.js`.

- [ ] **Step 13: Create the contract**

Create `packages/shared/src/jira/picker-tickets.ts`:

```ts
import { z } from 'zod';

/** A single candidate ticket as the New Run picker renders it. */
export const pickerTicketSchema = z.object({
  key: z.string(),
  summary: z.string(),
  priority: z.string().nullable(),
  /** false → blocked by at least one unfinished dependency (see blockedBy). */
  runnable: z.boolean(),
  blockedBy: z.array(z.object({ key: z.string(), summary: z.string() })),
  /** true → a non-terminal agent already exists for this ticket. */
  hasActiveAgent: z.boolean(),
});

/** Tickets grouped under their parent Epic; epicKey null → "Ungrouped". */
export const ticketGroupSchema = z.object({
  epicKey: z.string().nullable(),
  epicSummary: z.string().nullable(),
  tickets: z.array(pickerTicketSchema),
});

/**
 * Discriminated on `available`: a degraded list (no daemon Jira creds, or
 * Jira unreachable) is a 200 with `available: false`, not a server error.
 */
export const projectTicketsResponseSchema = z.discriminatedUnion('available', [
  z.object({ available: z.literal(true), groups: z.array(ticketGroupSchema) }),
  z.object({ available: z.literal(false), reason: z.enum(['no_credentials', 'jira_unreachable']) }),
]);

export type PickerTicket = z.infer<typeof pickerTicketSchema>;
export type TicketGroup = z.infer<typeof ticketGroupSchema>;
export type ProjectTicketsResponse = z.infer<typeof projectTicketsResponseSchema>;
```

- [ ] **Step 14: Run the contract test + full shared suite**

Run: `npm run test --workspace=crew-shared -- picker-tickets && npm run typecheck --workspace=crew-shared`
Expected: PASS.

- [ ] **Step 15: Verify the whole repo still typechecks (CLI consumes the re-export)**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 16: Commit**

```bash
git add -A
git commit -m "feat(shared): add Jira searchIssues, picker contract, and jira.ready_status config"
```

---

## Task 2: Daemon tickets endpoint

**Files:**
- Create: `packages/daemon/src/services/TicketsService.ts`, `packages/daemon/src/services/TicketsService.test.ts`, `bruno/endpoints/projects/get-tickets.bru`
- Modify: `packages/daemon/src/config.ts`, `packages/daemon/src/container.ts`, `packages/daemon/src/routes/projects.ts`, `packages/daemon/src/services/AgentsService.ts`, `docker-compose.yml`
- Test: `TicketsService.test.ts`, `AgentsService.test.ts` (extend), route test if a projects route test exists

**Interfaces:**
- Consumes (from T1): `JiraClient`, `JiraIssue`, `ProjectTicketsResponse`, `projectTicketsResponseSchema`, `ProjectConfig.jira.ready_status` (all from `crew-shared`).
- Produces (consumed by the route): `class TicketsService { listProjectTickets(project: ProjectConfig): Promise<ProjectTicketsResponse> }`; `AgentsService.activeTicketKeys(projectName: string): Promise<Set<string>>`; route `GET /api/projects/:slug/tickets`.

### 2a — `AgentsService.activeTicketKeys`

- [ ] **Step 1: Write the failing test**

Add to `packages/daemon/src/services/AgentsService.test.ts` (mirror an existing test's setup that seeds `agents` + `runs`/`state_transitions`; reuse the file's existing seed helpers):

```ts
it('activeTicketKeys returns only non-terminal agents for the project', async () => {
  // seed: CREW-1 running (active), CREW-2 finished (terminal), KAN-9 different project
  // (use the same seeding helpers the surrounding tests use)
  const keys = await service.activeTicketKeys('crew');
  expect(keys.has('CREW-1')).toBe(true);
  expect(keys.has('CREW-2')).toBe(false);
  expect(keys.has('KAN-9')).toBe(false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test --workspace=crew-daemon -- AgentsService`
Expected: FAIL — `activeTicketKeys is not a function`.

- [ ] **Step 3: Implement `activeTicketKeys`**

Add to `AgentsService` (the agent `key` is the ticket key in crew; reuse `list()` so state derivation isn't duplicated):

```ts
/**
 * Ticket keys in `projectName` that currently have a NON-terminal agent —
 * used by the New Run picker to badge tickets already in flight. Reuses
 * `list()` so the terminal-state derivation (finish/error/pr_merged guards)
 * isn't reimplemented. Low-frequency call (picker open), so the heavier
 * list() joins are acceptable.
 */
async activeTicketKeys(projectName: string): Promise<Set<string>> {
  const TERMINAL = new Set(['finished', 'error', 'pr_merged']);
  const agents = await this.list();
  return new Set(
    agents.filter((a) => a.projectName === projectName && !TERMINAL.has(a.state)).map((a) => a.key),
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test --workspace=crew-daemon -- AgentsService`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/services/AgentsService.ts packages/daemon/src/services/AgentsService.test.ts
git commit -m "feat(daemon): AgentsService.activeTicketKeys for the ticket picker overlay"
```

### 2b — Daemon Jira credentials in config

- [ ] **Step 6: Add creds to the daemon config (test first)**

Add to `packages/daemon/src/config.test.ts` (or the file that tests `parseDaemonConfig`):

```ts
it('reads Jira credentials, defaulting to empty string', () => {
  expect(parseDaemonConfig({}).jiraEmail).toBe('');
  expect(parseDaemonConfig({ CREW_JIRA_EMAIL: 'e@x', CREW_JIRA_API_TOKEN: 't' })).toMatchObject({
    jiraEmail: 'e@x',
    jiraToken: 't',
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npm run test --workspace=crew-daemon -- config`
Expected: FAIL — `jiraEmail` undefined.

- [ ] **Step 8: Implement**

In `packages/daemon/src/config.ts`, add to `daemonConfigSchema`:

```ts
  // New Run ticket picker: Jira Basic-auth credentials the daemon uses to
  // search a project's Ready-for-Development tickets. Empty by default →
  // TicketsService returns { available: false, reason: 'no_credentials' } and
  // the dashboard degrades to manual ticket-key entry. Threaded into the
  // container via docker-compose `environment:` (${CREW_JIRA_EMAIL:-}).
  CREW_JIRA_EMAIL: z.string().default(''),
  CREW_JIRA_API_TOKEN: z.string().default(''),
```

Add to the `DaemonConfig` interface:

```ts
  /** Jira Basic-auth email for the New Run ticket picker (empty → degraded). */
  jiraEmail: string;
  /** Jira API token for the New Run ticket picker (empty → degraded). */
  jiraToken: string;
```

Add to the `parseDaemonConfig` return object:

```ts
    jiraEmail: parsed.CREW_JIRA_EMAIL,
    jiraToken: parsed.CREW_JIRA_API_TOKEN,
```

- [ ] **Step 9: Run it to verify it passes**

Run: `npm run test --workspace=crew-daemon -- config`
Expected: PASS.

### 2c — `TicketsService`

- [ ] **Step 10: Write the failing test**

Create `packages/daemon/src/services/TicketsService.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { TicketsService } from './TicketsService.js';
import type { ProjectConfig } from 'crew-shared';

const project = {
  name: 'crew',
  jira: { project_key: 'CREW', site: 'https://x.atlassian.net', ready_status: 'Ready for Development' },
} as unknown as ProjectConfig;

const logger = { warn: vi.fn(), info: vi.fn() } as never;

function svc(opts: { email?: string; token?: string; search?: () => Promise<unknown>; active?: Set<string> }) {
  const agentsService = { activeTicketKeys: vi.fn().mockResolvedValue(opts.active ?? new Set()) } as never;
  const service = new TicketsService({ jiraEmail: opts.email ?? 'e@x', jiraToken: opts.token ?? 't', agentsService, logger });
  if (opts.search) (service as unknown as { makeClient: () => unknown }).makeClient = () => ({ searchIssues: opts.search });
  return service;
}

describe('TicketsService.listProjectTickets', () => {
  it('returns no_credentials when creds are empty', async () => {
    const res = await svc({ email: '', token: '' }).listProjectTickets(project);
    expect(res).toEqual({ available: false, reason: 'no_credentials' });
  });

  it('returns jira_unreachable when the search throws', async () => {
    const res = await svc({ search: () => Promise.reject(new Error('boom')) }).listProjectTickets(project);
    expect(res).toEqual({ available: false, reason: 'jira_unreachable' });
  });

  it('groups by parent epic and marks blocked tickets', async () => {
    const search = () => Promise.resolve([
      { key: 'CREW-2', fields: { summary: 'Blocked one', status: { name: 'Ready for Development' }, parent: { key: 'CREW-100', fields: { summary: 'Epic A' } }, priority: { name: 'High' },
        issuelinks: [{ type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' }, inwardIssue: { key: 'CREW-1', fields: { summary: 'Blocker', status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } } } } }] } },
      { key: 'CREW-3', fields: { summary: 'Runnable, no epic', status: { name: 'Ready for Development' } } },
    ]);
    const res = await svc({ search, active: new Set(['CREW-3']) }).listProjectTickets(project);
    if (!res.available) throw new Error('expected available');
    expect(res.groups).toHaveLength(2);
    const epicA = res.groups.find((g) => g.epicKey === 'CREW-100')!;
    expect(epicA.epicSummary).toBe('Epic A');
    expect(epicA.tickets[0]).toMatchObject({ key: 'CREW-2', runnable: false, blockedBy: [{ key: 'CREW-1', summary: 'Blocker' }], priority: 'High' });
    const ungrouped = res.groups.find((g) => g.epicKey === null)!;
    expect(ungrouped.tickets[0]).toMatchObject({ key: 'CREW-3', runnable: true, hasActiveAgent: true });
  });

  it('treats a Done blocker as not blocking', async () => {
    const search = () => Promise.resolve([
      { key: 'CREW-4', fields: { summary: 'X', status: { name: 'Ready for Development' },
        issuelinks: [{ type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' }, inwardIssue: { key: 'CREW-1', fields: { summary: 'Done blocker', status: { name: 'Done', statusCategory: { key: 'done' } } } } }] } },
    ]);
    const res = await svc({ search }).listProjectTickets(project);
    if (!res.available) throw new Error('expected available');
    expect(res.groups[0].tickets[0]).toMatchObject({ key: 'CREW-4', runnable: true, blockedBy: [] });
  });
});
```

- [ ] **Step 11: Run it to verify it fails**

Run: `npm run test --workspace=crew-daemon -- TicketsService`
Expected: FAIL — cannot find module `./TicketsService.js`.

- [ ] **Step 12: Implement `TicketsService`**

Create `packages/daemon/src/services/TicketsService.ts`:

```ts
import type { Logger } from 'pino';
import {
  JiraClient,
  type JiraIssue,
  type ProjectConfig,
  type ProjectTicketsResponse,
  type TicketGroup,
  type PickerTicket,
} from 'crew-shared';
import type { AgentsService } from './AgentsService.js';

const SEARCH_FIELDS = ['summary', 'status', 'parent', 'issuetype', 'priority', 'issuelinks'];
const UNGROUPED = '__ungrouped__';

export interface TicketsServiceDeps {
  jiraEmail: string;
  jiraToken: string;
  agentsService: Pick<AgentsService, 'activeTicketKeys'>;
  logger: Logger;
}

/**
 * Serves the New Run picker: the project's Ready-for-Development tickets,
 * grouped by parent Epic, each classified runnable-vs-blocked from its
 * `is blocked by` links, with an overlay of which already have a live agent.
 * One Jira search call suffices — blockers' statuses come back inline on
 * `issuelinks[].inwardIssue.fields.status`. Degrades (200 + available:false)
 * when creds are missing or Jira is unreachable.
 */
export class TicketsService {
  constructor(private readonly deps: TicketsServiceDeps) {}

  /** Overridable seam for tests. */
  protected makeClient(site: string): Pick<JiraClient, 'searchIssues'> {
    return new JiraClient({ site, email: this.deps.jiraEmail, token: this.deps.jiraToken });
  }

  async listProjectTickets(project: ProjectConfig): Promise<ProjectTicketsResponse> {
    if (!this.deps.jiraEmail || !this.deps.jiraToken) {
      return { available: false, reason: 'no_credentials' };
    }

    const jql = `project = "${project.jira.project_key}" AND status = "${project.jira.ready_status}" ORDER BY created ASC`;
    let issues: JiraIssue[];
    try {
      issues = await this.makeClient(project.jira.site).searchIssues(jql, SEARCH_FIELDS);
    } catch (err) {
      this.deps.logger.warn({ err, project: project.name }, 'New Run ticket search failed');
      return { available: false, reason: 'jira_unreachable' };
    }

    const activeKeys = await this.deps.agentsService.activeTicketKeys(project.name);

    const groups = new Map<string, TicketGroup>();
    const order: string[] = [];
    for (const issue of issues) {
      const ticket = toPickerTicket(issue, activeKeys);
      const epicKey = issue.fields.parent?.key ?? null;
      const groupId = epicKey ?? UNGROUPED;
      let group = groups.get(groupId);
      if (!group) {
        group = { epicKey, epicSummary: issue.fields.parent?.fields?.summary ?? null, tickets: [] };
        groups.set(groupId, group);
        order.push(groupId);
      }
      group.tickets.push(ticket);
    }

    return { available: true, groups: order.map((id) => groups.get(id)!) };
  }
}

function toPickerTicket(issue: JiraIssue, activeKeys: Set<string>): PickerTicket {
  const blockedBy = (issue.fields.issuelinks ?? [])
    .filter((l) => l.type?.inward === 'is blocked by' && l.inwardIssue)
    .map((l) => l.inwardIssue!)
    .filter((b) => b.fields?.status?.statusCategory?.key !== 'done')
    .map((b) => ({ key: b.key, summary: b.fields?.summary ?? '' }));

  return {
    key: issue.key,
    summary: issue.fields.summary ?? '',
    priority: issue.fields.priority?.name ?? null,
    runnable: blockedBy.length === 0,
    blockedBy,
    hasActiveAgent: activeKeys.has(issue.key),
  };
}
```

- [ ] **Step 13: Run it to verify it passes**

Run: `npm run test --workspace=crew-daemon -- TicketsService`
Expected: PASS.

- [ ] **Step 14: Commit**

```bash
git add packages/daemon/src/config.ts packages/daemon/src/config.test.ts packages/daemon/src/services/TicketsService.ts packages/daemon/src/services/TicketsService.test.ts
git commit -m "feat(daemon): TicketsService + Jira creds config for the New Run picker"
```

### 2d — Wire DI + route

- [ ] **Step 15: Register `ticketsService` in the container**

In `packages/daemon/src/container.ts`: add the import

```ts
import { TicketsService } from './services/TicketsService.js';
```

add to `DaemonCradle`:

```ts
  ticketsService: TicketsService;
```

and register inside `container.register({ ... })` (next to `projectsService`):

```ts
    // New Run ticket picker: fetches a project's Ready-for-Development tickets
    // from Jira, grouped + runnability-classified. Scoped — stateless over the
    // injected creds + agentsService.
    ticketsService: asFunction(
      ({ config, agentsService, logger }: DaemonCradle) =>
        new TicketsService({
          jiraEmail: config.jiraEmail,
          jiraToken: config.jiraToken,
          agentsService,
          logger,
        }),
    ).scoped(),
```

- [ ] **Step 16: Add the route (test first if a projects route test exists)**

If `packages/daemon/src/routes/projects.test.ts` exists, add:

```ts
it('GET /api/projects/:slug/tickets returns a degraded payload without creds', async () => {
  // build the test app with empty Jira creds (the default test config)
  const res = await app.inject({ method: 'GET', url: '/api/projects/crew/tickets' });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ available: false, reason: 'no_credentials' });
});
```

Run: `npm run test --workspace=crew-daemon -- projects`
Expected: FAIL — 404 (route not registered).

- [ ] **Step 17: Implement the route**

In `packages/daemon/src/routes/projects.ts`: add the import

```ts
import { projectTicketsResponseSchema } from 'crew-shared';
```

and register inside `registerProjectsRoutes`, after the `:slug` route:

```ts
  app.get(
    '/api/projects/:slug/tickets',
    {
      schema: {
        params: SlugParamsSchema,
        response: { 200: projectTicketsResponseSchema },
      },
    },
    async (req) => {
      // getBySlug throws NotFoundError (→ 404) for an unknown slug before we
      // touch Jira.
      const project = req.diScope.resolve('projectsService').getBySlug(req.params.slug);
      return req.diScope.resolve('ticketsService').listProjectTickets(project);
    },
  );
```

- [ ] **Step 18: Run the route test to verify it passes**

Run: `npm run test --workspace=crew-daemon -- projects`
Expected: PASS.

- [ ] **Step 19: Thread creds into the daemon container (docker-compose)**

In `docker-compose.yml`, add to the daemon service's existing `environment:` block:

```yaml
      # New Run ticket picker: Jira Basic-auth creds the daemon uses to search a
      # project's Ready-for-Development tickets. Interpolated from the host env
      # at `docker compose up`; absent → the picker degrades to manual entry.
      - CREW_JIRA_EMAIL=${CREW_JIRA_EMAIL:-}
      - CREW_JIRA_API_TOKEN=${CREW_JIRA_API_TOKEN:-}
```

- [ ] **Step 20: Add the Bruno endpoint**

Create `bruno/endpoints/projects/get-tickets.bru` (match the existing `.bru` files' meta/header style; pick the next free `seq`):

```
meta {
  name: get-tickets
  type: http
  seq: 99
}

get {
  url: {{baseUrl}}/api/projects/crew/tickets
  body: none
  auth: none
}

assert {
  res.status: eq 200
}
```

(Adjust `seq` to the next free number in the group and `crew` to a slug present in the smoke fixtures. The assertion is status-only because the degraded payload is also 200 — see `bruno-collection-maintenance`.)

- [ ] **Step 21: Run the full daemon suite + Bruno smoke + lint/typecheck**

Run: `npm run test --workspace=crew-daemon && npm run bruno:smoke && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 22: Commit**

```bash
git add packages/daemon/src/container.ts packages/daemon/src/routes/projects.ts docker-compose.yml bruno/endpoints/projects/get-tickets.bru packages/daemon/src/routes/projects.test.ts
git commit -m "feat(daemon): GET /api/projects/:slug/tickets New Run picker endpoint"
```

- [ ] **Step 23: Run agents-doc-parity-check**

Invoke the `agents-doc-parity-check` skill. Expect it to flag `.agents/architecture.md` / `.agents/testing.md` / `.agents/local-dev.md` (routes, services, Bruno, docker-compose `environment:` are covered paths). Update any doc whose `covers:` glob matched. Commit doc updates with `docs(agents): ...`.

---

## Task 3: Dashboard picker UI

**Files:**
- Modify: `packages/dashboard/src/data/DaemonClient.ts`, `HttpDaemonClient.ts`, `MockDaemonClient.ts`, `components/NewRunModal.tsx`, `components/ModalSelectionRow.tsx`, `App.tsx`
- Test: `packages/dashboard/src/components/NewRunModal.test.tsx` (create or extend), `MockDaemonClient.test.ts` (extend)

**Interfaces:**
- Consumes (from T1): `ProjectTicketsResponse`, `PickerTicket`, `projectTicketsResponseSchema` from `crew-shared`.
- Consumes (from T2, at runtime): `GET /api/projects/:slug/tickets`.
- Produces: `DaemonClient.listProjectTickets(slug)`; NewRunModal renders the picker.

### 3a — Client method

- [ ] **Step 1: Add to the `DaemonClient` interface**

In `packages/dashboard/src/data/DaemonClient.ts`: add the import

```ts
import type { ProjectTicketsResponse } from 'crew-shared';
```

and add to the `DaemonClient` interface:

```ts
  /**
   * New Run picker: a project's Ready-for-Development tickets, grouped by epic
   * with runnability + active-agent overlay. `available: false` when the daemon
   * has no Jira creds or Jira is unreachable — the modal degrades to manual
   * ticket-key entry.
   */
  listProjectTickets(slug: string): Promise<ProjectTicketsResponse>;
```

- [ ] **Step 2: Write the failing HttpDaemonClient test**

Add to the HttpDaemonClient test file (mirror the existing `listProjects` fetch-mock test):

```ts
it('listProjectTickets parses the available payload', async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ available: true, groups: [] }), { status: 200 }));
  const client = new HttpDaemonClient('');
  expect(await client.listProjectTickets('crew')).toEqual({ available: true, groups: [] });
});
```

Run: `npm run test --workspace=crew-dashboard -- HttpDaemonClient`
Expected: FAIL — `listProjectTickets is not a function`.

- [ ] **Step 3: Implement in HttpDaemonClient + MockDaemonClient**

In `packages/dashboard/src/data/HttpDaemonClient.ts`: add the import of `projectTicketsResponseSchema` from `crew-shared` (alongside the other schema imports) and the method:

```ts
  async listProjectTickets(slug: string): Promise<ProjectTicketsResponse> {
    const res = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(slug)}/tickets`);
    if (!res.ok) throw new Error(`listProjectTickets failed: ${res.status}`);
    return projectTicketsResponseSchema.parse(await res.json());
  }
```

(import the `ProjectTicketsResponse` type too.) In `packages/dashboard/src/data/MockDaemonClient.ts`, add a canned available payload:

```ts
  async listProjectTickets(): Promise<ProjectTicketsResponse> {
    return {
      available: true,
      groups: [
        {
          epicKey: 'CREW-100',
          epicSummary: 'Sample Epic',
          tickets: [
            { key: 'CREW-101', summary: 'Runnable ticket', priority: 'High', runnable: true, blockedBy: [], hasActiveAgent: false },
            { key: 'CREW-102', summary: 'Blocked ticket', priority: 'Medium', runnable: false, blockedBy: [{ key: 'CREW-1', summary: 'Blocker' }], hasActiveAgent: false },
            { key: 'CREW-103', summary: 'In-flight ticket', priority: null, runnable: true, blockedBy: [], hasActiveAgent: true },
          ],
        },
      ],
    };
  }
```

- [ ] **Step 4: Run the client tests**

Run: `npm run test --workspace=crew-dashboard -- DaemonClient`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/data/DaemonClient.ts packages/dashboard/src/data/HttpDaemonClient.ts packages/dashboard/src/data/MockDaemonClient.ts
git commit -m "feat(dashboard): DaemonClient.listProjectTickets"
```

### 3b — `ModalSelectionRow` disabled support

- [ ] **Step 6: Add a `disabled` prop (test first)**

Add to `ModalSelectionRow`'s test (create `ModalSelectionRow.test.tsx` if absent):

```ts
it('renders disabled rows as non-interactive', () => {
  const onClick = vi.fn();
  render(<ModalSelectionRow primary="X" onClick={onClick} disabled />);
  const el = screen.getByText('X').closest('button')!;
  expect(el).toBeDisabled();
  fireEvent.click(el);
  expect(onClick).not.toHaveBeenCalled();
});
```

Run: `npm run test --workspace=crew-dashboard -- ModalSelectionRow`
Expected: FAIL.

- [ ] **Step 7: Implement**

In `packages/dashboard/src/components/ModalSelectionRow.tsx`: add `disabled?: boolean` to the props interface, accept it in the destructure, and apply it:

```tsx
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        // ...existing classes...
        onClick && !disabled && 'cursor-pointer transition-colors hover:border-ring',
        disabled && 'cursor-not-allowed opacity-50',
        // ...
      )}
```

(Use the file's existing class-composition helper — `cn`/`clsx`/template — matching what's already there.)

- [ ] **Step 8: Run it + the existing row tests**

Run: `npm run test --workspace=crew-dashboard -- ModalSelectionRow`
Expected: PASS.

### 3c — NewRunModal picker

- [ ] **Step 9: Write the failing modal tests**

Create/extend `packages/dashboard/src/components/NewRunModal.test.tsx` (render via the existing `renderWithProviders` so QueryClient is available; pass `client={new MockDaemonClient()}`):

```tsx
// helper: open the modal, click into the sample project to reach step 2
async function gotoStep2() {
  renderWithProviders(<NewRunModal open onOpenChange={() => {}} projects={SAMPLE_PROJECTS} onConfirm={vi.fn()} client={new MockDaemonClient()} />);
  fireEvent.click(await screen.findByText(SAMPLE_PROJECTS[0].name));
}

it('lists tickets grouped by epic with a search filter', async () => {
  await gotoStep2();
  expect(await screen.findByText('Sample Epic')).toBeInTheDocument();
  expect(screen.getByText(/Runnable ticket/)).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText(/filter/i), { target: { value: 'Blocked' } });
  expect(screen.queryByText(/Runnable ticket/)).not.toBeInTheDocument();
  expect(screen.getByText(/Blocked ticket/)).toBeInTheDocument();
});

it('disables blocked rows and badges in-flight rows', async () => {
  await gotoStep2();
  const blocked = (await screen.findByText(/Blocked ticket/)).closest('button')!;
  expect(blocked).toBeDisabled();
  expect(screen.getByText(/blocked by CREW-1/i)).toBeInTheDocument();
  expect(screen.getByText(/running/i)).toBeInTheDocument(); // CREW-103 badge
});

it('"Available only" hides blocked + in-flight tickets', async () => {
  await gotoStep2();
  await screen.findByText(/Runnable ticket/);
  fireEvent.click(screen.getByRole('switch'));
  expect(screen.queryByText(/Blocked ticket/)).not.toBeInTheDocument();
  expect(screen.queryByText(/In-flight ticket/)).not.toBeInTheDocument();
  expect(screen.getByText(/Runnable ticket/)).toBeInTheDocument();
});

it('selecting a ticket shows its title on the confirm step', async () => {
  await gotoStep2();
  fireEvent.click(await screen.findByText(/Runnable ticket/));
  expect(await screen.findByText('Runnable ticket')).toBeInTheDocument(); // Title row on confirm
  expect(screen.getByText('crew run CREW-101')).toBeInTheDocument();
});

it('degrades to manual entry when tickets are unavailable', async () => {
  const client = new MockDaemonClient();
  client.listProjectTickets = async () => ({ available: false, reason: 'no_credentials' });
  renderWithProviders(<NewRunModal open onOpenChange={() => {}} projects={SAMPLE_PROJECTS} onConfirm={vi.fn()} client={client} />);
  fireEvent.click(await screen.findByText(SAMPLE_PROJECTS[0].name));
  expect(await screen.findByText(/live ticket list unavailable/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/ticket key/i)).toBeInTheDocument();
});
```

Run: `npm run test --workspace=crew-dashboard -- NewRunModal`
Expected: FAIL — modal has no `client` prop / no picker.

- [ ] **Step 10: Implement the picker in `NewRunModal.tsx`**

Rewrite `NewRunModal.tsx` step 2 around the fetched payload. Key changes (full code):

```tsx
import * as React from 'react';
import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { FormField } from '@/components/FormField';
import { Modal } from '@/components/Modal';
import { ModalSelectionRow } from '@/components/ModalSelectionRow';
import { Stepper } from '@/components/Stepper';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

import type { DaemonClient } from '../data/DaemonClient.js';
import type { Project } from '../data/types.js';
import type { PickerTicket } from 'crew-shared';

const STEPS = ['Project', 'Ticket', 'Confirm'];

export interface NewRunConfirm {
  project: string;
  ticketKey: string;
}

interface NewRunModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  onConfirm: (run: NewRunConfirm) => void;
  client: DaemonClient;
}

export function NewRunModal({ open, onOpenChange, projects, onConfirm, client }: NewRunModalProps) {
  const [step, setStep] = React.useState(1);
  const [project, setProject] = React.useState<Project | null>(null);
  const [ticketKey, setTicketKey] = React.useState('');
  const [ticketTitle, setTicketTitle] = React.useState('');
  const [filter, setFilter] = React.useState('');
  const [availableOnly, setAvailableOnly] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setStep(1);
      setProject(null);
      setTicketKey('');
      setTicketTitle('');
      setFilter('');
      setAvailableOnly(false);
    }
  }, [open]);

  const ticketsQuery = useQuery({
    queryKey: ['project-tickets', project?.name],
    queryFn: () => client.listProjectTickets(project!.name),
    enabled: open && step === 2 && !!project,
  });

  const trimmedKey = ticketKey.trim();
  const canAdvanceTicket = trimmedKey.length > 0;
  const degraded = ticketsQuery.isError || (ticketsQuery.data && !ticketsQuery.data.available);

  function selectProject(p: Project) {
    setProject(p);
    setStep(2);
  }
  function selectTicket(t: PickerTicket) {
    setTicketKey(t.key);
    setTicketTitle(t.summary);
    setStep(3);
  }
  function confirm() {
    if (!project || !canAdvanceTicket) return;
    onConfirm({ project: project.name, ticketKey: trimmedKey });
    onOpenChange(false);
  }

  return (
    <Modal title="New Run" open={open} onOpenChange={onOpenChange}>
      <div className="flex flex-col gap-4">
        <Stepper steps={STEPS} current={step} />

        {step === 1 && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-foreground">Pick a project</p>
            <div className="flex flex-col gap-2">
              {projects.map((p) => (
                <ModalSelectionRow
                  key={p.name}
                  primary={p.name}
                  secondary={p.repoPath}
                  meta={p.jiraKey}
                  badge={<Badge color="finished" intensity="mid">{p.activeCount} active</Badge>}
                  onClick={() => selectProject(p)}
                />
              ))}
            </div>
          </div>
        )}

        {step === 2 && project && (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-medium text-foreground">
              Pick a ticket{' '}
              <span className="font-mono text-xs text-muted-foreground">· {project.jiraKey}</span>
            </p>

            {degraded ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">Live ticket list unavailable — enter a ticket key.</p>
                <FormField
                  label="Ticket key"
                  placeholder={`${project.jiraKey}-123`}
                  value={ticketKey}
                  autoFocus
                  onChange={(e) => setTicketKey(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && canAdvanceTicket) { setTicketTitle(''); setStep(3); } }}
                />
              </div>
            ) : (
              <>
                <Input
                  leadingIcon={<Search className="size-4" />}
                  placeholder="Filter open tickets…"
                  value={filter}
                  autoFocus
                  onChange={(e) => setFilter(e.target.value)}
                />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={availableOnly} onCheckedChange={setAvailableOnly} />
                  Available only
                </label>
                <TicketList
                  data={ticketsQuery.data}
                  loading={ticketsQuery.isLoading}
                  filter={filter}
                  availableOnly={availableOnly}
                  onSelect={selectTicket}
                />
              </>
            )}

            <div className="flex items-center justify-between">
              <Button color="running" intensity="mid" size="sm" icon={<ArrowLeft aria-hidden />} onClick={() => setStep(1)}>
                Back
              </Button>
              {degraded && (
                <Button color="white" intensity="loud" size="sm" disabled={!canAdvanceTicket} onClick={() => { setTicketTitle(''); setStep(3); }}>
                  Next
                  <ArrowRight aria-hidden />
                </Button>
              )}
            </div>
          </div>
        )}

        {step === 3 && project && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-foreground">Confirm</p>
            <dl className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
              <SummaryRow label="Project" value={project.name} />
              <SummaryRow label="Ticket" value={trimmedKey} mono />
              {ticketTitle && <SummaryRow label="Title" value={ticketTitle} />}
              <SummaryRow label="Worktree" value={`${project.repoPath}/.worktrees/${trimmedKey}`} mono />
              <SummaryRow label="Command" value={`crew run ${trimmedKey}`} mono />
            </dl>
            <div className="flex items-center justify-between">
              <Button color="running" intensity="mid" size="sm" icon={<ArrowLeft aria-hidden />} onClick={() => setStep(2)}>
                Back
              </Button>
              <Button color="white" intensity="loud" size="sm" onClick={confirm}>
                Spawn agent
                <ArrowRight aria-hidden />
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function TicketList({
  data, loading, filter, availableOnly, onSelect,
}: {
  data: import('crew-shared').ProjectTicketsResponse | undefined;
  loading: boolean;
  filter: string;
  availableOnly: boolean;
  onSelect: (t: PickerTicket) => void;
}) {
  if (loading) return <p className="text-xs text-muted-foreground">Loading tickets…</p>;
  if (!data || !data.available) return null;
  const q = filter.trim().toLowerCase();

  const groups = data.groups
    .map((g) => ({
      ...g,
      tickets: g.tickets.filter((t) => {
        if (availableOnly && (!t.runnable || t.hasActiveAgent)) return false;
        if (!q) return true;
        return t.key.toLowerCase().includes(q) || t.summary.toLowerCase().includes(q);
      }),
    }))
    .filter((g) => g.tickets.length > 0);

  if (groups.length === 0) return <p className="text-xs text-muted-foreground">No tickets match.</p>;

  return (
    <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
      {groups.map((g) => (
        <div key={g.epicKey ?? '__ungrouped__'} className="flex flex-col gap-2">
          <p className="text-[11px] uppercase text-muted-foreground">{g.epicSummary ?? 'Ungrouped'}</p>
          {g.tickets.map((t) => {
            const disabled = !t.runnable || t.hasActiveAgent;
            return (
              <ModalSelectionRow
                key={t.key}
                primary={`${t.key} · ${t.summary}`}
                secondary={!t.runnable ? `blocked by ${t.blockedBy.map((b) => b.key).join(', ')}` : undefined}
                badge={
                  t.hasActiveAgent ? <Badge color="running" intensity="mid">running</Badge>
                  : t.priority ? <Badge color="finished" intensity="mid">{t.priority}</Badge>
                  : undefined
                }
                disabled={disabled}
                onClick={disabled ? undefined : () => onSelect(t)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function SummaryRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[11px] text-muted-foreground uppercase">{label}</dt>
      <dd className={mono ? 'truncate font-mono text-xs text-foreground' : 'truncate text-sm text-foreground'}>{value}</dd>
    </div>
  );
}
```

Note: a disabled `ModalSelectionRow` still needs to render even with `onClick` undefined — confirm the component renders a `<button disabled>` when `disabled` is set regardless of `onClick` (adjust the `Comp = onClick ? 'button' : 'div'` logic in Step 7 to also use `button` when `disabled` so the test's `toBeDisabled()` holds).

- [ ] **Step 11: Update `ModalSelectionRow` to render a button when disabled**

In `ModalSelectionRow.tsx`, change the element choice so a disabled row is still a (disabled) button:

```tsx
const Comp = onClick || disabled ? 'button' : 'div';
// ...
type={onClick || disabled ? 'button' : undefined}
onClick={disabled ? undefined : onClick}
disabled={disabled}
```

- [ ] **Step 12: Pass `client` to NewRunModal in `App.tsx`**

In `App.tsx`, find the `<NewRunModal ... />` render and add the `client` prop:

```tsx
      <NewRunModal
        open={newRunOpen}
        onOpenChange={setNewRunOpen}
        projects={projects}
        client={client}
        onConfirm={(run) => enqueue.mutate({ kind: 'run', project: run.project, ticketKey: run.ticketKey })}
      />
```

(Keep the existing `onConfirm` wiring; only add `client={client}`.)

- [ ] **Step 13: Run the modal tests + full dashboard suite**

Run: `npm run test --workspace=crew-dashboard -- NewRunModal && npm run test --workspace=crew-dashboard`
Expected: PASS. Fix any App.test.tsx that constructs `<NewRunModal>` without `client` (pass a `MockDaemonClient`).

- [ ] **Step 14: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 15: Commit**

```bash
git add packages/dashboard/src
git commit -m "feat(dashboard): searchable epic-grouped ticket picker in New Run modal"
```

- [ ] **Step 16: Visual fidelity pass**

Bring up the dashboard, open New Run, select a project, and reach step 2 + step 3. Invoke the `visual-fidelity-check` skill against Figma `1:3418` (Select Ticket) and `9:2` (Confirm); adjust the Modal/Stepper/ModalSelectionRow composites where they diverge (this also discharges the CREW-137 deferred modal-composite verification). Write the report to `docs/visual-fidelity-reports/<ticket>.md`. Commit any composite adjustments.

- [ ] **Step 17: Run agents-doc-parity-check + readme-freshness-check**

Invoke `agents-doc-parity-check` (touches dashboard components — `.agents/design-system.md` is likely covered) and `readme-freshness-check`. Update any implicated docs; commit.

---

## Self-Review

**1. Spec coverage** (spec → task):
- Searchable list → T3 Step 9–10 (filter `Input`). ✔
- Epic grouping → T2 Step 12 (`groups` by `parent`) + T3 `TicketList`. ✔
- Runnable/blocked from `is blocked by` → T2 Step 12 (`toPickerTicket`) + tests Step 10. ✔
- Blocked = disabled + hint → T3 Steps 10–11 (`disabled` + `blocked by …`). ✔
- Active = running badge, disabled → T2 `activeTicketKeys` + T3 badge. ✔
- "Available only" toggle → T3 Step 10 (`Switch` + `availableOnly` filter). ✔
- Confirm title row → T3 Step 10 (`ticketTitle` SummaryRow). ✔
- Degrade to text entry → T2 degraded payload + T3 `degraded` branch + test Step 9. ✔
- Configurable `ready_status` → T1 Step 10 + T2 JQL. ✔
- Daemon Jira access (shared client + creds + route) → T1 Steps 1–9, T2 Steps 6–22. ✔
- Bruno coverage → T2 Step 20. ✔
- Visual fidelity (CREW-137 closure) → T3 Step 16. ✔

**2. Placeholder scan:** No "TBD"/"handle errors"/"similar to" — each code step carries full code. The two "match the existing style" notes (Bruno `seq`, `cn` helper) name the exact file to mirror, not vague guidance.

**3. Type consistency:** `listProjectTickets` (client + service) consistent; `ProjectTicketsResponse`/`PickerTicket`/`TicketGroup` defined once in T1 and imported everywhere; `activeTicketKeys` signature identical in T2 Step 3 and its consumer Step 12; `available`/`reason` literals match the Zod enum across daemon + dashboard.

**Risks to watch during execution:**
- `fastify-type-provider-zod` serializing a `discriminatedUnion` response — if the serializer compiler rejects it, fall back to a plain `z.object` with `available` + optional `groups`/`reason` (still 200). Verify in T2 Step 18.
- The moved `client.test.ts` may reference a CLI-only path alias — fix the relative import if T1 Step 4 fails.
- App.test.tsx and any other `<NewRunModal>` callers need the new `client` prop (T3 Step 13).
