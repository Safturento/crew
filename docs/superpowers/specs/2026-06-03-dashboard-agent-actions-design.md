# Dashboard-triggered agent actions

**Date:** 2026-06-03
**Status:** Spec — pending implementation plan
**Epic:** broadens **CREW-208** (currently "Agent quick-actions wiring + finish-step surfacing"), parked in Backlog.
**Related context:** the user still drives three workflow steps from the terminal — `crew run`, `crew fix-pr`, `crew finish` — and wants them as actions taken from the dashboard. CREW-208 already scoped two of the pieces (wiring the QuickAction buttons + surfacing finish-step results); this spec broadens it to cover all three CLI verbs behind one execution mechanism.

## Context

The dashboard is, by design, a pure view over the daemon's HTTP/SSE API — "no business logic." The daemon is a long-running **containerized** process (docker-compose) that watches host files and serves REST/SSE + SQLite state; its only subprocess today is `gh pr view` (a network call inside the container). It has read-only host mounts and **cannot** create git worktrees, run `docker compose`, or spawn the `claude` binary.

`crew run` / `crew fix-pr` / `crew finish` do exactly those host-side things. So none of the three can be "just a daemon mutation" — each needs *something on the host* to do the launching. Bridging that host↔container gap is the core of this work.

The dispatch flow already has a precedent for crossing that boundary with files: the host CLI writes `~/.crew/startup/<key>.jsonl`, the containerized daemon ingests it via a chokidar watcher (CREW-201). This spec introduces the **reverse** direction — the daemon records an action request, and a small host process executes it — but uses HTTP rather than a shared volume so the daemon stays the single owner of the queue.

The work composes into three dashboard actions over one shared mechanism:

1. **New Run** — a modal that dispatches `crew run <KEY>`.
2. **Fix PR** — a comment box on a `pr_open` agent that posts the comment to the PR and runs `crew fix-pr <KEY>`.
3. **Finish** — a button that becomes actionable once a PR is merged and runs `crew finish <KEY>`, plus surfacing the finish step-checklist in the drawer.

## Scope

In scope:

- A daemon-owned **action queue** (`action_requests` table + routes + service + Bruno endpoints).
- A new host **runner** process that drains the queue by shelling the bounded verb set, with a first-class lifecycle (`crew runner start|stop|restart|status|logs`) and a `crew up`/`crew down` convenience wrapper.
- **Runner health** (heartbeat → daemon → dashboard indicator) and a **runner log viewer** (host log dir mounted read-only into the daemon container, tailed over the API).
- The three dashboard actions: New Run modal, Fix PR comment modal, Finish gating — wired through one App-level mutation layer with optimistic updates + toasts.
- Surfacing `crew finish` step results in the drawer (CREW-208 Scope 2): a finish-step event type emitted from the CLI `step()` helper, published via the EventBus, rendered as a per-step checklist.
- Graceful degradation when no runner is connected.

Out of scope (non-goals):

- **Running the daemon on the host.** Considered as the alternative bridge; rejected because it changes the deployment model and ripples through `docker-compose.yml`, `env.toml` port hashing, per-worktree compose, and `.agents/local-dev.md`. The runner keeps that blast radius at zero. See "Alternatives considered."
- **Containerizing the runner.** It needs the user's real git/docker/claude/gh/env; a container would need docker-out-of-docker + repo bind-mounts + the claude binary + auth — fragile and self-defeating.
- **Auth/token for triggering.** v1 trusts the user's tailnet (see "Security posture"). A shared-token mode is a clean future addition if the trust boundary changes.
- **Streaming full run output to the dashboard.** Once an agent is launched, the existing transcript/state tracking already renders its timeline. The runner reports only the *launch* outcome.
- **Arbitrary command execution.** The runner only ever executes the fixed verb set against already-registered tickets/projects.

## Architecture

```
                    ┌─────────────── host ───────────────┐
  ┌───────────┐     │   ┌──────────────────────────────┐  │
  │ dashboard │ ──► │   │ daemon (container)            │  │
  │ (browser) │ SSE │   │  action_requests (SQLite)     │  │
  └───────────┘  ◄──┼── │  POST /api/actions  (enqueue) │  │
        │            │   │  GET  /api/actions/pending    │  │
   POST /api/actions │   │  POST /api/actions/:id/result │  │
        │            │   │  POST /api/runner/heartbeat   │  │
        ▼            │   │  GET  /api/runner/logs  (tail)│  │
  daemon stores      │   └──────────────────────────────┘  │
  status: pending    │            ▲          │ ro mount     │
                     │   long-poll│          │ ~/.crew/runner│
                     │   + result │          ▼              │
                     │   ┌────────────────────────────────┐ │
                     │   │ crew runner (host process)      │ │
                     │   │  claims pending → cd <repo> →   │ │
                     │   │  crew run|fix-pr|finish <KEY>   │ │
                     │   │  writes ~/.crew/runner/*.log    │ │
                     │   └────────────────────────────────┘ │
                     └──────────────────────────────────────┘
```

### The action queue (daemon)

New table `action_requests` (numbered migration in `packages/daemon/src/migrations/`):

| column | notes |
|---|---|
| `id` | pk |
| `kind` | `run` \| `fix_pr` \| `finish` |
| `ticket_key` | e.g. `CREW-212` |
| `project` | registered project name (resolves the repo dir the runner `cd`s into) |
| `payload` | JSON — e.g. `{ "comment": "..." }` for `fix_pr`; empty for `run`/`finish` |
| `status` | `pending` → `claimed` → `launching` → `launched` \| `failed` |
| `error` | failure detail, null until `failed` |
| `created_at`, `updated_at` | timestamps |

Routes (thin; an `ActionService` owns logic; Bruno endpoint per route):

- `POST /api/actions` — dashboard enqueues. Validates `kind` is in the verb set and `ticket_key`/`project` are registered (rejects unknown). Returns the new `id`.
- `GET /api/actions/pending` — runner long-polls; atomically claims one pending row (`pending` → `claimed`) and returns it. Returns 204/empty when idle.
- `POST /api/actions/:id/result` — runner reports `launching` → `launched` | `failed` (+ `error`).
- `POST /api/runner/heartbeat` — runner pings every N seconds; daemon stores `last_seen`.
- `GET /api/runner/logs` — returns the tail of the runner log; an SSE variant live-tails.

Action-status changes and runner online/offline are published on the **existing SSE channel** so the dashboard updates without polling.

### The runner (host process)

A long-running host process — the only piece allowed to execute host commands:

1. Long-polls `GET /api/actions/pending`.
2. On a claimed action, resolves the project's repo dir from project config, `cd`s in, and shells the matching verb with the user's host env:
   - `run` → `crew run <KEY>`
   - `fix_pr` → post `payload.comment` to the PR (`gh pr comment`), then `crew fix-pr <KEY> --from-pr`
   - `finish` → `crew finish <KEY>`
3. Reports `launching` immediately, then `launched` or `failed` once the verb returns (for `run`/`fix-pr` this is "the agent process started," not "the agent finished" — the agent then runs independently and is tracked via the normal transcript/state path).
4. Heartbeats the daemon and writes structured logs to `~/.crew/runner/runner.log`.

The runner is **bounded**: it only ever runs the three verbs against registered tickets/projects. It cannot run arbitrary commands.

### Runner health + logs

- **Health:** heartbeat → daemon tracks `runner_online` + `last_seen`; a stale heartbeat flips to unhealthy. Exposed via API + SSE. A small **status chip** in the dashboard top nav reads it: healthy on the main stack (runner up), **unhealthy on worktree dashboards** (no runner) — the expected signal.
- **Logs:** the runner writes to host `~/.crew/runner/`; the **canonical** `docker-compose.yml` mounts it read-only into the daemon container (`~/.crew/runner:/root/.crew/runner:ro`), mirroring the existing `~/.crew/startup` and `~/.claude/projects` mounts. The daemon tails it over `GET /api/runner/logs` (+ SSE live-tail). The dashboard log viewer (opened from the status chip) renders it — also the debugging surface when an action fails to launch. Per-worktree compose simply omits the mount, so worktree dashboards show "no runner / no logs."

## The three dashboard actions

All three route through one App-level mutation layer (TanStack Query `useMutation`, optimistic state + `sonner` toasts). The QuickAction buttons already thread `onAgentAction(kind, agent)` up to `App.tsx` (CREW-208 Scope 1, verified) but have no handler — this supplies it.

### New Run

A "+ New run" entry point opens a **Stepper** modal (`1·Project → 2·Ticket → 3·Confirm`) — built from the Modal / Stepper / ModalSelectionRow / FormField composites that CREW-137 shipped. Step 1 picks a registered project; step 2 takes the ticket key (optionally fetching the Jira summary for confirmation); step 3 is a **confirm guard** (per the security decision) before enqueuing a `run` action.

### Fix PR

On a `pr_open` agent, a "Fix PR" action opens a small modal with a comment textarea. On submit it enqueues a `fix_pr` action carrying the comment. The runner posts the comment to the PR and runs `crew fix-pr <KEY> --from-pr`, so the feedback lands in the durable PR-comment channel (matching the established convention) and `fix-pr` pulls it. The `pr_open → running → pr_open` state cycle and the auto-`git push` are already handled by CREW-197.

### Finish

The Finish QuickAction is **disabled until the agent is `pr_merged`** (state from CREW-202); once merged it enqueues a `finish` action → `crew finish <KEY>`. Separately (CREW-208 Scope 2), the CLI `step()` helper in `packages/cli/src/commands/finish.ts` emits a **finish-step event** (new type in `crew-shared`) for each step; the daemon publishes it via the EventBus; the drawer renders a per-step checklist with ok/skip/error states.

## Runner lifecycle

- `crew runner start | stop | restart | status | logs` — the primitive. `start` daemonizes (detached, PID file under `~/.config/crew/`, logs to `~/.crew/runner/`), **auto-restarts the worker on crash** (the `restart: unless-stopped` equivalent). `status` reports running + daemon connectivity; `logs` tails the log file.
- `crew up` / `crew down` — thin convenience wrapper: `docker compose up`/`down` (daemon + dashboard) **plus** `crew runner start`/`stop`.
- **`docker compose up` stays fully standalone.** Dispatched crew-dev agents and per-worktree stacks bring up daemon + dashboard with compose alone and never need a runner. The dashboard degrades gracefully: action buttons handle "no runner connected" (disabled, or "queued — waiting for runner") rather than erroring, and the health chip reads unhealthy.

## Security posture (v1)

The dashboard is reachable over the user's tailnet, so a click can launch an autonomous agent (`crew run` → `claude --dangerously-skip-permissions`) on the host. v1 **trusts the tailnet** and relies on two bounds:

1. The runner executes only the fixed verb set against already-registered tickets/projects — no arbitrary execution.
2. The New Run action (the expensive/risky one) shows a confirm dialog.

No additional auth/token in v1. A shared-token mode is a clean future addition if the dashboard is ever exposed beyond the trusted network.

## Error handling

- **Enqueue validation** — unknown `kind`/`ticket`/`project` is rejected at `POST /api/actions`; the modal surfaces the error.
- **No runner** — actions sit `pending` (nothing lost); the UI shows "waiting for runner" and the health chip is unhealthy. They drain when a runner connects.
- **Launch failure** — the runner reports `failed` + `error`; the dashboard toasts it and the runner log viewer carries detail.
- **Runner crash** — auto-restart brings the worker back; an in-flight `claimed` action with no result past a timeout is re-queued (or marked `failed`) so it isn't stuck.
- **Daemon restart** — the queue is durable (SQLite); the runner reconnects and resumes polling.

## Testing

- **Daemon** — `ActionService` unit tests (enqueue validation, claim atomicity, status transitions, heartbeat staleness); route tests; Bruno endpoints for each new route.
- **Runner** — unit-test the executor (verb selection, project-dir resolution, result reporting) with the CLI verbs mocked; integration test the poll→claim→report loop against a test daemon.
- **CLI** — `crew runner` lifecycle (start writes PID, stop removes it, status reflects state) and `crew up`/`down` orchestration, with compose + runner mocked.
- **Dashboard** — modal flows (New Run stepper, Fix PR comment), Finish gating by state, mutation + toast behavior, the "no runner" degraded state, the health chip, and the finish-step checklist rendering.
- **End-to-end smoke** — with a real runner: enqueue each verb, observe the agent register/cycle and the status reflect in the dashboard.

## Ticket breakdown (formalized in the plan)

| Group | Scope | Layer |
|---|---|---|
| a | Shared schemas: action-request + finish-step event types | `shared` |
| b | Daemon: `action_requests` table + action routes + `ActionService` + Bruno | `daemon` |
| c | Daemon: runner heartbeat + log-tail routes + canonical `~/.crew/runner` ro mount | `daemon` |
| d | Runner host process + executor | `cli`/runner |
| e | CLI: `crew runner *` lifecycle + `crew up`/`down` | `cli` |
| f | Dashboard: action mutation/SSE wiring + "no runner" degradation | `dashboard` |
| g | Dashboard: New Run Stepper modal | `dashboard` |
| h | Dashboard: Fix PR comment modal | `dashboard` |
| i | Dashboard: Finish gating + finish-step checklist | `dashboard` |
| j | Dashboard: runner health chip + log viewer | `dashboard` |

Dependency shape: `a` → (`b`, `c`) → (`d`, `e`) for the host path; the dashboard groups (`f`–`j`) depend on the daemon routes (`b`, `c`) and on `f` for the shared mutation layer, but parallelize among themselves. The plan will collapse these into coherent child tickets with the explicit phase table.

## Alternatives considered

- **Daemon on the host** (`crew daemon serve`) so a route handler spawns the CLI directly — no queue, no runner. Simpler execution path, but abandons the containerized deployment the whole local-dev story assumes (mount paths, `env.toml` ports, per-worktree compose). Rejected for blast radius; the runner isolates the risky concern instead.
- **Separate host executor HTTP service** the dashboard calls directly — a clunkier variant of the runner (second service, second port, its own auth) with no upside over the daemon-owned queue. Rejected.
- **Shared-volume action queue** (daemon writes request files to a host-mounted dir, runner watches) — viable and symmetric with the startup-JSONL bridge, but requires a writable host bind-mount and a second status path. The HTTP queue keeps the daemon the single owner and reuses SSE for status. Preferred.

## Open questions

- **Finish-step transport** — reuse the existing startup-event JSONL bridge (`~/.crew/<...>`) for finish steps, or add a dedicated event path? Decide during the plan; the JSONL bridge is the lower-novelty option.
- **Long-poll vs short-poll** for `GET /api/actions/pending` — long-poll is snappier; a short interval is simpler. Minor; decide in the runner ticket.
