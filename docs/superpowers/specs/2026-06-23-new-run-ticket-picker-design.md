# New Run → Jira ticket picker

**Date:** 2026-06-23
**Status:** Spec — pending implementation plan
**Epic:** _to be created_ (needs-planning → ready once plan + children exist).
**Builds on:** **CREW-218** — the dashboard New Run modal (`NewRunModal.tsx`, 3-step Project → Ticket → Confirm wizard) and its `enqueueAction({ kind: 'run', project, ticketKey })` path. CREW-218 explicitly shipped step 2 as a free-text ticket-key entry and deferred the live picker "otherwise skip in v1". This spec delivers that picker. Also closes the deferred verification from **CREW-137** (modal composites built but never wired into a live screen).
**Design reference (Figma):** Crew file `9FeJPriqdsdA4n9R5Xsrr8` — `1:3418` (Select Ticket: searchable open-ticket list with priority badges) and `9:2` (Confirm: ticket _title_ summary row). Snapshot composites `362:2212` / `362:2213` in `.crew/figma-snapshot/`.
**Source:** followup `docs/followups.md` anchor `2026-06-04--new-run-modal-step-2-is-a-text-entry-not-the-figma-open-ticket-picker`; reminder `new-run-ticket-picker` (item #7 of the 2026-06-05 dashboard worklist).

## Context

The dashboard's New Run modal (CREW-218) walks Project → Ticket → Confirm. Step 1 (project) maps cleanly to the daemon's `listProjects()`. Step 2 asks the operator to **type a ticket key** into a `FormField`; step 3 omits the ticket title. Both gaps share one root cause: **the daemon has no Jira access**, so the dashboard cannot fetch the project's open tickets or a ticket's summary.

The only Jira client in the repo lives in `packages/cli/src/lib/jira/client.ts` and exposes just `getIssue` / `getTransitions` / `transition` — **no search/JQL**. (The GitHub client is likewise CLI-only at `packages/cli/src/lib/github/`; the `shared/` package has neither today, despite the AGENTS.md layout note.) The daemon — the only process the dashboard talks to — has no Jira credentials and no Jira client.

So the picker requires three stacked capabilities that don't exist yet: a **search method** on a Jira client the **daemon** can reach, a **daemon route** that serves Ready-for-Development tickets with epic grouping + dependency-driven runnability, and the **dashboard UI** that turns step 2 into a searchable, filterable list.

The Figma target (`1:3418`) shows a searchable list of the project's open tickets — rows like `KAN-31 · Drag-and-drop reordering…` with a priority badge — and `9:2` shows a ticket title on the confirm step.

## Scope

In scope (v1):

- **Searchable ticket list** — when a project is selected, step 2 fetches that project's tickets in the configured "ready" status and renders them as a list; the input box becomes a client-side **search filter** over key + summary.
- **Epic grouping** — tickets are grouped under their parent Epic (parent-less tickets fall into an "Ungrouped" bucket).
- **Dependency-driven runnability** — each ticket is classified **runnable** or **blocked**, computed from its Jira `is blocked by` links: blocked iff any blocker is not in a Done status category. Blocked rows render **disabled** with a `blocked by CREW-X` hint.
- **Active-agent overlay** — tickets that already have a live agent show a **"running" badge** and are non-selectable (no double-dispatch).
- **"Available only" filter** — a single toggle in step 2 that hides blocked + active rows, leaving only runnable, no-active-agent tickets. Default off (everything visible).
- **Confirm-step title** — step 3 shows the selected ticket's summary (already in hand from the list — no extra fetch).
- **Graceful degradation** — when the daemon has no Jira credentials or Jira is unreachable, step 2 falls back to today's manual ticket-key `FormField` with a "live ticket list unavailable" note. New Run never breaks.
- **Configurable ready status** — `jira.ready_status` (default `"Ready for Development"`) in project config, so boards with different workflow status names work without code changes.
- **Daemon Jira access** — promote the Jira client to `packages/shared`, add `searchIssues`, and thread `CREW_JIRA_EMAIL`/`CREW_JIRA_API_TOKEN` into the daemon container.

Out of scope (non-goals):

- **Writing to Jira from the dashboard** (transitioning status, assigning) — read-only picker.
- **Persisting / caching tickets in the daemon DB** — live fetch per modal-open; the response is computed on demand, not stored.
- **A full filter menu** — one "Available only" toggle now; if more filters appear later, graduate to a popover menu (noted in Forward path).
- **Multi-status selection** — the picker shows exactly one status (`ready_status`); browsing arbitrary statuses is not a goal.
- **Promoting the GitHub client to shared** — same CLI-only shape, but not needed for this feature.
- **Runner-online gating of Spawn** — the daemon already holds the pending action until a runner connects; unchanged here (tracked separately).

## Architecture

Approach **A** (chosen over "daemon shells out to CLI" and "duplicate client in daemon" — see Alternatives): **promote the Jira client to `packages/shared`, daemon calls Jira directly.**

```
   ┌───────────┐                ┌──────────────── host ─────────────────┐
   │ dashboard │                │  daemon (container)                    │
   │ New Run   │  GET /api/     │   TicketsService                       │
   │  step 2   │ ─ projects/ ─► │    ├─ build JQL (status = ready_status)│
   │ (picker)  │   :slug/       │    ├─ shared JiraClient.searchIssues   │ ──► Jira REST
   │           │ ◄─ tickets ─── │    ├─ group by parent epic             │     /search/jql
   └───────────┘   { available, │    ├─ runnable vs blocked (issuelinks) │
        │            groups[] }  │    └─ overlay active agents            │
        │                        │   creds via DaemonConfig (env)         │
        ▼                        └────────────────────────────────────────┘
   client-side: search filter        ▲ CREW_JIRA_EMAIL / CREW_JIRA_API_TOKEN
   + "Available only" toggle          │ (docker-compose environment:)
```

- **Shared client (`packages/shared/src/jira/`):** the CLI client moves here verbatim; the CLI re-imports from `crew-shared`. A new `searchIssues(jql, fields)` hits `GET /rest/api/3/search/jql`. **One network call suffices** for runnability: Jira returns each linked issue's status inline at `issuelinks[].inwardIssue.fields.status`, so no per-blocker round-trip is needed.
- **Daemon (`TicketsService` + route):** a scoped, DI-registered service computes the grouped/annotated payload; the route `GET /api/projects/:slug/tickets` resolves the project (existing `NotFoundError` on unknown slug) and returns it. The response Zod schema + TS types live in `shared` so the dashboard imports the contract.
- **Credentials:** surfaced through `DaemonConfig` (not read from `process.env` directly inside the service — matches the repo's config convention, cf. the `CREW_STARTUP_EVENTS_DIR` correction), threaded in via a new `environment:` block on the daemon service in `docker-compose.yml` (`${CREW_JIRA_EMAIL:-}` host interpolation).
- **Dashboard:** `DaemonClient.listProjectTickets(slug)` + React Query (`['project-tickets', slug]`), fetched on project-select; all search/filter/grouping interaction is client-side over the fetched payload.

### Data contract (shared)

The route returns a **discriminated** payload so the dashboard can degrade cleanly:

```ts
type ProjectTicketsResponse =
  | { available: true; groups: TicketGroup[] }
  | { available: false; reason: 'no_credentials' | 'jira_unreachable' };

interface TicketGroup {
  epicKey: string | null;       // null → "Ungrouped"
  epicSummary: string | null;
  tickets: PickerTicket[];
}

interface PickerTicket {
  key: string;                  // e.g. "CREW-274"
  summary: string;
  priority: string | null;      // e.g. "High" (drives the priority badge)
  runnable: boolean;            // false → blocked
  blockedBy: { key: string; summary: string }[];   // unfinished blockers
  hasActiveAgent: boolean;      // → "running" badge, non-selectable
}
```

`available: false` is a **200**, not a 5xx — a degraded list is an expected state, not a server error. Unknown project slug remains a 404 via the existing handler.

## Layer details

### 1. Shared Jira client + search + config (foundation)

- **Move** `client.ts`, `index.ts`, `fetch-ticket-summary.ts` (+ tests) from `packages/cli/src/lib/jira/` to `packages/shared/src/jira/`; export from `crew-shared`; update CLI imports (`commands/finish.ts`, `commands/backfill-titles.ts`, etc.). No CLI behavior change.
- **`searchIssues(jql: string, fields: string[]): Promise<JiraIssue[]>`** — `GET /rest/api/3/search/jql?jql=…&fields=…&maxResults=…`, paginating if needed. Default fields for the picker: `summary, status, parent, issuetype, priority, issuelinks`.
- **Types:** extend `JiraIssue` with `priority`, `issuelinks[]`, and `parent.fields.summary`; add `JiraIssueLink` (`type.{name,inward,outward}`, `inwardIssue?`, `outwardIssue?`, each with `key` + `fields.{status,summary}`).
- **Response contract:** define `ProjectTicketsResponse` / `TicketGroup` / `PickerTicket` Zod schemas + types in `shared` (so T3 can build against them in parallel with T2).
- **Config:** add `ready_status: z.string().default('Ready for Development')` to the `jira` object in `packages/shared/src/config/schema.ts`.

### 2. Daemon tickets endpoint

- **`TicketsService.listProjectTickets(project: ProjectConfig): Promise<ProjectTicketsResponse>`**
  - Credentials absent → `{ available: false, reason: 'no_credentials' }`.
  - Build JQL: `project = "<project_key>" AND status = "<ready_status>"`. Fetch via the shared client.
  - **Group** by `parent.key` / `parent.fields.summary`; parent-less → `epicKey: null`.
  - **Runnability:** ticket is blocked iff it has an `issuelinks` entry that is an *inward* `Blocks` link (`type.inward === 'is blocked by'` with an `inwardIssue`) whose `inwardIssue.fields.status.statusCategory.key !== 'done'`. Collect those into `blockedBy`.
  - **Active overlay:** mark `hasActiveAgent` for ticket keys with a live agent in this project (extends `AgentsService` — today it exposes `countByProject`; needs an active-ticket-key lookup per project).
  - Any Jira HTTP/network error → caught, logged, `{ available: false, reason: 'jira_unreachable' }`.
- **Route:** `GET /api/projects/:slug/tickets` (in `routes/projects.ts`, following the `GET /api/projects/:slug` template) — resolve project via `projectsService.getBySlug`, delegate to `ticketsService`, response schema `ProjectTicketsResponseSchema`.
- **DI:** register `ticketsService` (scoped) in `container.ts`, depending on `config` (for creds + a shared `JiraClient` factory) and `agentsService`.
- **Config/secrets:** add `jiraEmail` / `jiraToken` to `DaemonConfig`; add the `environment:` block to the daemon service in `docker-compose.yml`.
- **Bruno:** `bruno/endpoints/projects/get-tickets.bru` (per `bruno-collection-maintenance`).

### 3. Dashboard picker UI

- **`DaemonClient.listProjectTickets(slug)`** + `HttpDaemonClient` impl + Zod parse of the shared response schema.
- **`NewRunModal.tsx` step 2** — replace the `FormField` with:
  - A leading-magnifier search `Input` (client-side filter over key + summary).
  - An **"Available only"** toggle (a `Switch`) that hides blocked + active rows.
  - A grouped list: epic header rows + `ModalSelectionRow` per ticket (key · summary + priority badge). Blocked rows **disabled** with `blocked by CREW-X`; active rows show a **"running"** badge, disabled.
  - Loading + empty states.
  - **Degraded** (`available: false` or fetch error): render the existing manual `FormField` + a "live ticket list unavailable" note.
- **Step 3** — add a "Title" `SummaryRow` (selected ticket's summary).
- **Visual fidelity** — `visual-fidelity-check` over the modal against Figma `1:3418` + `9:2`, adjusting the Modal/Stepper/ModalSelectionRow composites where they diverge (the CREW-137 deferred verification).

## Error handling

| Condition | Behavior |
| --- | --- |
| Daemon missing `CREW_JIRA_*` | `{ available: false, reason: 'no_credentials' }` (200) → modal degrades to text entry |
| Jira HTTP/network error | caught + logged → `{ available: false, reason: 'jira_unreachable' }` (200) → degrade |
| Unknown project slug | existing `NotFoundError` → 404 |
| Empty result (no ready tickets) | `{ available: true, groups: [] }` → "no tickets ready" empty state |
| Dashboard fetch fails (network) | React Query error → same degraded text-entry fallback |

## Testing

- **Shared:** `searchIssues` JQL + field + pagination construction and response parsing (unit); config schema default for `ready_status`.
- **Daemon:** `TicketsService` — epic grouping, blocked-vs-runnable from issuelink fixtures (done vs non-done blocker), active-agent overlay, and the two degraded paths (no creds / Jira throws) — unit; the route returns the contract; Bruno smoke (`npm run bruno:smoke`).
- **Dashboard:** step-2 render across states — search filter, "Available only" toggle, disabled blocked rows, running badge, empty, and degraded fallback; step-3 title row.
- **Gates:** `agents-doc-parity-check` (touches daemon routes/services, config schema, docker-compose, dashboard components — multiple `covers:` globs), `bruno-collection-maintenance`, `visual-fidelity-check`.

## Ticket breakdown

Epic: **New Run → Jira ticket picker**. Three children:

- **T1 — Shared Jira client + search + contract + config** _(foundation; blocks T2 and T3)_
  Move client to `shared`, add `searchIssues`, extend `JiraIssue`/`JiraIssueLink`, define `ProjectTicketsResponse`/`TicketGroup`/`PickerTicket` Zod schemas + types in `shared`, add `jira.ready_status`, update CLI imports, unit tests.

- **T2 — Daemon tickets endpoint** _(blocked by T1)_
  `TicketsService` (grouping + runnability + active overlay + degraded paths), `GET /api/projects/:slug/tickets`, DI registration, `DaemonConfig` creds + `docker-compose` `environment:` block, `AgentsService` active-ticket-key lookup, Bruno endpoint, tests.

- **T3 — Dashboard picker UI** _(blocked by T1 for the contract; needs T2 merged for end-to-end)_
  `DaemonClient.listProjectTickets`, React Query wiring, step-2 searchable grouped list with "Available only" toggle + blocked/running states + degraded fallback, step-3 Title row, visual-fidelity pass.

### Parallelism plan

T1 ships the shared **types + Zod contract**, which is the seam between the daemon impl and the dashboard. So:

```
T1  ─┬─►  T2 (daemon impl)
     └─►  T3 (dashboard, against the T1 contract)
```

- **T1 first**, solo (everything depends on it).
- **T2 and T3 build in parallel** off T1's contract.
- **Merge order: T1 → T2 → T3.** T3 can be built and unit-tested against the typed contract while T2 is in flight, but its end-to-end verification (and the visual-fidelity pass on real data) happens after T2 lands, so T3 merges last.
- Both T2 and T3 touch append-point manifests (route registration / DI container for T2; `DaemonClient` interface for T3) but **disjoint** ones, so the only rebase needed is T3 onto merged T2 for the live run-through. Single migration-adder: neither T2 nor T3 adds a DB migration (no persistence), so no migration-number contention.

## Alternatives considered

- **Daemon shells out to the CLI** (spawn `crew` to fetch tickets). Rejected: the daemon container would need the CLI installed, subprocess output-parsing is brittle, and it blurs the daemon/CLI boundary.
- **Duplicate Jira client in the daemon.** Rejected: two clients to keep in sync — the exact drift the repo avoids; promoting to `shared` is the same effort with one source of truth.
- **Persisting tickets in the daemon DB + a poller.** Rejected for v1: live fetch per modal-open is simple and fresh; single-operator volume doesn't justify a sync loop or staleness window. (Revisit if rate limits or latency bite — see Forward path.)
- **Hardcoding "Ready for Development".** Rejected: a second project with a different workflow status would silently return nothing; one config field avoids the trap.

## Forward path / Open questions

- **Caching:** if Jira latency or rate limits become noticeable, add a short daemon-side in-memory TTL cache (per project) keyed on `ready_status`. Not needed at single-operator volume.
- **Filter menu:** "Available only" is one toggle now; additional filters (by epic, by priority, by assignee) would graduate it into a popover filter menu.
- **GitHub client** could follow the same CLI→`shared` promotion if the daemon ever needs PR/issue reads, but that's independent of this Epic.
- **Runnability depth:** v1 treats a ticket as blocked on *any* non-Done direct blocker. Transitive chains (blocked-by a blocked ticket) aren't surfaced beyond the direct link — acceptable since the operator sees each blocker's key and can follow the chain in the list itself.
