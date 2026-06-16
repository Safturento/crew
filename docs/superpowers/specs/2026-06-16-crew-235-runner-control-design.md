# Runner control parity (UI ⇄ CLI run-lifecycle actions)

**Date:** 2026-06-16
**Status:** Spec — pending implementation plan
**Epic:** **CREW-235** (Backlog, needs-planning → ready once plan + children exist).
**Builds on:** **CREW-208 / CREW-221** — the dashboard-triggered action queue (`action_requests`), the host **runner** process (`crew runner start|stop|restart|status|logs`), `RunnerStatusService` + heartbeat, and the runner log viewer. This spec makes that runner **self-aware** (it tracks what it spawned), **controllable** (cancel/pause from the UI), and gives it a **first-class page**.
**Design reference (Figma):** Crew file `9FeJPriqdsdA4n9R5Xsrr8`, `Brainstorm` page — full Runner page `739:1111`, drawer-cancel mock `756:1237`, failed-start A/B offcuts `750:1173` / `751:1189`. The canonical build into `Dashboard Screens` (out of `Composites`) is an **interactive** ticket (see Ticket breakdown).

## Context

Today the runner shells `crew run`/`fix-pr`/`finish` **detached** (`spawnDetached`) and forgets them — no PID / agent-key / run-id registry exists. `crew runner status` reports only supervisor up/down + last heartbeat; `stop` SIGTERMs the supervisor, not an individual agent. The dashboard runner surface (CREW-221) is a health pill + a logs-only modal. There is no way to see, or stop, an in-flight dispatched agent short of hunting host PIDs.

This bit us on **2026-06-05**: four dispatched agents (CREW-231–234) were `git reset --hard`'d from the CLI to restart them on freshly-merged docs, but the reset never interrupted them — they were mid-run, `git reset` doesn't signal a process, so they recovered their reaped worktrees via `git fsck` and ran to natural completion (opening PRs), racing the intended restart. Routing dispatch through the runner had removed the operator's old lever (killing the foreground `crew run`) and left nothing in its place.

A second, more frequent pain showed up while scoping: runs that **fail before the agent ever starts** — a missing remote repo, a missing `GH_TOKEN`, an un-materialized env. These are the single biggest reason the operator will open this page ("what went wrong?"), and today they leave **zero trace** in the daemon. In `crew run`, preflight runs inside `prepareAgentEnvironment` (`packages/cli/src/commands/run.ts:391`) **before** `daemonClient.registerRun` (`run.ts:643`); a `PreflightError` renders to stderr and `process.exit(1)` at `run.ts:400–404` — so no run row is ever created. The failure output exists only in the detached process's stderr, which the runner spawns-and-forgets.

This Epic is about interrupting / controlling a run **before** it finishes, seeing what's in flight, and — critically — **making startup failures visible with their cause**. It is **not** about happy-path teardown: a dispatched agent already self-terminates on normal completion (same `crew run` code path as a terminal invocation — claude finishes, the process exits, `completeRun` fires).

## Scope

In scope (v1):

- **Runner self-awareness** — the runner maintains a live registry of the agent subprocesses it spawned (PID / process-group, agent key, run id, command, started-at, state) and pushes it to the daemon on its existing heartbeat.
- **Daemon mirror + API** — extend `RunnerStatusService` to hold the live snapshot in memory and serve it at `GET /api/runner/status` (+ SSE), so the dashboard can render it.
- **Control** — a daemon-owned, persisted **reverse queue** (`runner_commands`) the runner drains each cycle: `cancel_soft` (graceful), `cancel_hard` (force), `dequeue` (drop a pending `action_request`), `reap` (force-settle an orphan). On apply, the runner lands a clean `completeRun` so state settles.
- **Cancel UX** — soft (graceful) by default via a confirm; **escalate to `Force kill`** if it hasn't settled within ~10s. Surfaced on the **Runner page** rows and in the **agent drawer header** (UI ⇄ CLI parity).
- **Startup-failure capture** — register the run in a `launching` state **before** preflight; on a `PreflightError` report a terminal **`failed-start`** carrying the structured check (`checkName`, `headline`, `remediation`, `details`) + captured output. Surfaced in a dedicated **Failed to start** attention queue.
- **Orphan visibility** — runs that are `running` in the DB but have **no** matching live process are flagged as **Unmanaged**, with a manual `Reap`. The daemon reaper is the automatic backstop.
- **A Runner page** — graduates the health-pill + logs-only modal into a top-level **Runner** tab (alongside Agents / Projects): supervisor status, Failed to start, Live processes, Unmanaged runs, Queued actions, Recently ended, Logs.
- **No-orphaned-logs principle** — every log for a ticket surfaces somewhere relevant: pre-agent (supervisor/dispatch/preflight/startup) on the Runner page; agent-execution (transcript/tools) in the agent drawer.

Designed-for, shipped as **fast-follow** (not v1, but the data model must not preclude it):

- **Pause / resume / message** a running agent (see "Pause/resume" below). The `runner_commands` queue carries it from day one via `kind` + `payload.message`; only the apply path is deferred behind a feasibility spike.

Out of scope (non-goals):

- **Happy-path teardown.** Normal completion already settles via `completeRun`; this Epic only interrupts runs *before* they finish.
- **Persisting live process state.** Only the control queue (`runner_commands`) and the run history (`runs`) are persisted; the live-process registry is **in-memory**, re-hydrated on restart from the daemon's last snapshot.
- **Arbitrary signalling.** The runner only ever signals process-groups it spawned and tracks; it cannot signal arbitrary host PIDs.
- **Full log search / filtering.** v1 Logs is a live tail (a dump). Filters + search + per-ticket slicing are a known next evolution (see Forward path) — the `agentKey` tagging this spec introduces is the enabler.
- **Auth/token for control actions.** Same tailnet-trust posture as CREW-208; a shared-token mode remains a clean future addition.

## Architecture

Approach: **hybrid push + persisted reverse queue** (chosen over a fully-persisted live table or a synchronous daemon→runner RPC — see Alternatives).

```
                     ┌──────────────────── host ─────────────────────┐
   ┌───────────┐     │   ┌────────────────────────────────────────┐   │
   │ dashboard │ ──► │   │ daemon (container)                      │   │
   │ (Runner   │ SSE │   │  RunnerStatusService (in-mem snapshot)  │   │
   │   page)   │ ◄───┼── │  GET  /api/runner/status   (snapshot)   │   │
   └───────────┘     │   │  runner_commands (SQLite, persisted)    │   │
        │ POST        │   │  POST /api/runner/commands  (enqueue)   │   │
        │ control     │   │  GET  /api/runner/commands/pending      │   │
        ▼             │   │  runs (SQLite) + reaper  (history)      │   │
   enqueue command    │   └────────────────────────────────────────┘   │
                      │      ▲ heartbeat + snapshot   │ drains queue     │
                      │      │ (every ~5s)            ▼                  │
                      │   ┌────────────────────────────────────────┐   │
                      │   │ crew runner (supervisor → worker)       │   │
                      │   │  registry: agentKey → {pid,pgid,...}    │   │
                      │   │  spawns crew run/fix-pr/finish (own pgid)│  │
                      │   │  applies cancel/dequeue/reap → completeRun│ │
                      │   └────────────────────────────────────────┘   │
                      └────────────────────────────────────────────────┘
```

- **State (runner → daemon):** the runner pushes a **live-process snapshot** on its existing 5s heartbeat. The daemon mirrors it in memory (extends `RunnerStatusService`) and republishes on the existing SSE channel. The dashboard reads `GET /api/runner/status`.
- **Control (daemon → runner):** the dashboard enqueues a command; the daemon persists it in `runner_commands`; the runner drains pending commands each heartbeat cycle and applies them by signalling the tracked process-group, then lands a clean `completeRun`. The containerized daemon cannot kill host processes, so all control routes through the runner.
- **History + outcome:** reuses the existing `runs` table and the reaper. "Recently ended" reads from `runs`; "Unmanaged" is the divergence between `runs.status = running` and the live snapshot.
- **Correlation key throughout: `agentKey`.** It ties the live snapshot, the command queue, the run history, the startup-failure record, and the logs together.

## Data model

### A — live-process snapshot (heartbeat payload, in-memory)

Pushed each cycle; ended processes simply drop out of the next snapshot. Per entry:

| field | notes |
|---|---|
| `agentKey` | correlation key, e.g. `CREW-231` |
| `command` | `run` \| `fix-pr` \| `finish` |
| `pid`, `pgid` | the spawned process + its group (own group, so it survives a worker bounce) |
| `actionRequestId` | links back to the `action_requests` row that dispatched it |
| `spawnedAt` | timestamp |
| `state` | `launching` → `running` → `cancelling` (+ `paused` in the fast-follow) |
| `project` | registered project name |

### B — `runner_commands` reverse queue (SQLite, persisted)

The only persisted *new* table. Drained by the runner each cycle.

| column | notes |
|---|---|
| `id` | pk |
| `agentKey` | target (null for queue-level ops like `dequeue` of an unspawned request) |
| `kind` | `cancel_soft` \| `cancel_hard` \| `dequeue` \| `reap` — later `pause` \| `resume` \| `message` |
| `payload` | JSON — `{ message }` for the fast-follow `resume`/`message`; usually empty |
| `status` | `pending` → `claimed` → `applied` \| `failed` |
| `error` | failure detail, null until `failed` |
| `created_at`, `updated_at` | timestamps |

Apply semantics:

- `cancel_soft` → SIGTERM the `pgid`; the run's own graceful path lands `completeRun` (terminal `cancelled`).
- `cancel_hard` → SIGKILL the `pgid`; the reaper backstops the missing `completeRun` and settles it `cancelled`.
- `dequeue` → drop a still-`pending` `action_request` (no process exists yet).
- `reap` → force-settle an orphan: a `runs.status = running` row with no live process, set terminal (`error`/`abandoned`) immediately rather than waiting for the reaper's timeout.

### C — startup-failure capture (runs + reaper changes)

The change that makes init failures visible:

1. **Register before preflight.** Move `registerRun` (or emit a lightweight pre-registration) so the run exists in a **`launching`** state *before* `prepareAgentEnvironment` runs preflight. A fast-failing run briefly appears as `launching` — acceptable and accurate.
2. **Report structured failed-start.** On a `PreflightError`, before exiting, POST a terminal **`failed-start`** to the daemon carrying the `PreflightError` fields (`checkName`, `headline`, `remediation`, `details`) **plus the captured startup output**. The config failures are already `lib/health` checks (the dispatch preflight gate, CREW-226), so the failed check name + remediation are structured, not a bare "exit 1".
3. **Backstop.** A process that dies even before pre-registration (a raw spawn error) is caught by the runner's executor short-circuit (`packages/cli/src/lib/runner/executor.ts`) and/or the reaper, and reported with whatever output was captured.

### Terminal states

Distinguish, rather than collapsing everything into `error`:

- `finished` — normal completion (existing).
- `cancelled` — operator-initiated stop (soft or hard). Shared reaper settles a hard kill.
- `failed-start` — died during init/preflight; carries the structured check + remediation + output. Distinct from a mid-run `error` because the operator's response differs (fix config & retry vs. read the transcript).
- `error` — ran, then crashed mid-execution (existing; `exit 1 mid-run`).

### Acknowledgement (the Failed-to-start attention queue)

`failed-start` runs carry an **`acknowledged`** flag (or a `superseded_by` run-id pointer):

- The **Failed to start** section queries `status = failed-start AND NOT acknowledged`.
- An entry is acknowledged two ways: **automatically** when a new run/action for the same `agentKey` starts (a retry supersedes it), or **manually** via the per-card `Archive` button (and a section-level `Archive all`).
- Acknowledged failures **remain in `runs`** and show up in **Recently ended** — the section is an attention view, the history is the full record. Nothing is deleted.

## The Runner page

Graduates to a **third top-level tab** (`Agents · Projects · Runner`); the existing `RunnerStatusChip` stays in the corner as a health glance that links into the page. Sections top-to-bottom (Figma `739:1111`):

1. **Supervisor** — status pill (`running`), heartbeat / workers / uptime / pid, `Restart` + `Stop`.
2. **Failed to start** *(attention queue; hidden when empty)* — pinned high because debugging startup failures is the #1 reason to visit. Each card: `failed` pill, `agentKey` + command + "failed to start · Nm ago", then the structured `check:` name, the headline, and the amber `→ remediation`; controls `Archive` + `View output`. Hint: *"Auto-clears when the ticket is re-run · or Archive to move it down to Recently ended."*
3. **Live processes** *(supervisor-held)* — one row per tracked subprocess: status pill in a fixed **96px slot** (matches `AgentRow`, so identity columns align), `agentKey`, command badge, project, duration; controls `Pause`\* + `Cancel`. A row mid-cancel shows an amber `cancelling` pill and a single red `Force kill`.
4. **⚠ Unmanaged runs** *(hidden when empty)* — amber-bordered: `running` in DB, **no live process**, "likely orphaned"; control `Reap`.
5. **Queued actions** — pending `action_requests` not yet spawned: `queued` pill, command, "queued Nm ago"; control `Dequeue`.
6. **Recently ended** — from `runs`: `finished`→PR link, `cancelled` "by operator", `error` "exit 1 mid-run" (→ `View logs`), plus acknowledged `failed-start` rows.
7. **Logs** — a `Following` live tail of pre-agent logs (terminal panel, monospace, semantically colored). v1 is a dump.

\* `Pause` is the fast-follow; render it disabled/hidden in v1.

### Control surfaces (UI ⇄ CLI parity)

`Cancel` lives in two places, same soft→hard model:

- **Runner page rows** — `Cancel` → confirm (AlertModal) → row enters `cancelling` → `Force kill` appears after ~10s if it hasn't settled.
- **Agent drawer header** — `Cancel` sits in the header action cluster (next to `↗ Open as page`, before `✕`); the same `cancelling`→`Force kill` escalation plays out in the header (Figma `756:1237`). Agents-list rows stay status-only — no destructive control in the dense list.

## The no-orphaned-logs principle

Every log produced for a ticket, from the moment it's dispatched (CLI **or** dashboard), surfaces somewhere relevant — split by **phase**:

| Phase | Owns | Surface |
|---|---|---|
| Pre-agent | supervisor, dispatch queue, **preflight/startup**, failure output | **Runner page** (Logs section; `View output` on a failed-start card) |
| Agent execution | transcript, tool calls, agent stdout | **Agent drawer** (existing timeline) |

**Handoff point = `registerRun`.** Everything from `crew run` invocation → preflight → registration is Runner-page territory; once the agent registers and starts streaming its transcript, ownership passes to the drawer. Logs are tagged with `agentKey` so a ticket's startup output can be sliced for `View output`, and so the Logs panel can later filter by ticket (Forward path).

## Pause / resume / message (fast-follow)

Not v1, but the model is designed for it now so the queue and snapshot don't need reshaping later:

- **Pause** = interrupt the agent at its current turn (not SIGSTOP — that freezes a half-finished tool call). **Resume** = re-enter the session via `spawnClaudeResume` (the path `crew fix-pr`/`crew resume` already use), optionally injecting a `payload.message`. This generalizes to "message / steer a running agent."
- The `runner_commands` queue carries it via `kind` (`pause`/`resume`/`message`) + `payload.message` from day one; the live snapshot already reserves a `paused` state.
- **Gate:** a feasibility spike before building — cleanly interrupting + resuming a detached headless `claude` mid-turn (the half-finished-tool-call risk) must be proven first.

## Error handling

- **Daemon can't reach runner** (no heartbeat): the Runner page shows the supervisor `down`; control buttons disable with a "runner offline" affordance. Pending `runner_commands` stay queued and apply when the runner returns.
- **Command apply fails** (process already gone, signal error): the runner marks the command `failed` with `error`; the daemon surfaces it, and the row reconciles against the next snapshot (the process is likely already gone → moves to Recently ended or Unmanaged).
- **Hard kill bypasses graceful `completeRun`:** the reaper settles the stuck `running` row as `cancelled`. Until it does, the row appears under **Unmanaged** with a manual `Reap`.
- **Snapshot vs. history divergence** is a feature, not a bug — it *is* the Unmanaged signal.

## Testing

- **Supervisor unit tests** (existing pattern, pure over injected boundaries): registry add/remove on spawn/exit; snapshot serialization; command apply (`cancel_soft`/`hard`/`dequeue`/`reap`) signalling the right `pgid` and landing `completeRun`.
- **Daemon:** `RunnerStatusService` snapshot mirror + SSE; `runner_commands` enqueue/claim/result routes (+ Bruno endpoints per route); reaper settling orphans and `failed-start` capture.
- **`crew run` flow:** register-before-preflight ordering; `PreflightError` → structured `failed-start` POST (with captured output); ordering preserved when preflight passes.
- **Dashboard:** Runner page renders each section from a snapshot fixture; cancel escalation timing; archive/auto-acknowledge; empty-state hiding (Failed to start / Unmanaged hidden when empty).
- **Visual fidelity:** the Runner page + drawer-cancel checked against the Figma source once the screen is built into `Dashboard Screens` and Code Connect is wired.

## Ticket breakdown (formalized in the plan)

Two execution lanes — this split drives the parallelism plan:

**Interactive lane (Figma; `interactive` label; driven live in-session, NOT `crew run`):**

- DS additions in `Composites`: a `runner` tab variant on `TopNav`; new composites as needed (supervisor card, process row, failed-start card).
- Assemble the Runner page into `Dashboard Screens` out of `Composites` instances; mock the drawer-cancel state.
- `.figma.tsx` Code Connect mappings for the new composites; `figma-snapshot` refresh.
- **Sequencing:** this lane should land **early** so the autonomous dashboard tickets have a visual source of truth for `visual-fidelity-check`.

**Autonomous lane (`crew run <KEY>`):**

- Runner registry + heartbeat snapshot (supervisor).
- Daemon `RunnerStatusService` snapshot mirror + `GET /api/runner/status` + SSE.
- `runner_commands` table + routes + service + Bruno endpoints; runner drain/apply loop.
- Register-before-preflight + structured `failed-start` capture (`crew run` + daemon); reaper changes.
- Dashboard: Runner page + sections; cancel escalation; drawer-cancel control; archive/acknowledge.
- (Fast-follow) pause/resume/message — gated on the feasibility spike.

The exact child groupings, dependency links, and the phase table live in the implementation plan + the Epic description.

## Alternatives considered

- **Fully-persisted live-process table** (vs. in-memory snapshot): rejected — live PID state is ephemeral and host-owned; persisting it invites staleness across restarts. Re-hydrating from the last pushed snapshot is simpler and self-correcting. Only the *control* queue and *history* need durability.
- **Synchronous daemon→runner RPC for control** (vs. persisted reverse queue): rejected — the daemon is containerized and the runner may be momentarily offline (worktree bounce, restart). A persisted queue means a control action issued while the runner is briefly away still applies when it returns.
- **Surfacing startup failures only via the reaper / generic `error`** (vs. structured `failed-start` + register-before-preflight): rejected — it would show "exit 1" with no cause, which is exactly the unhelpful state we have now. The structured health-check result is the whole point.
- **Failed-start rows mixed into Recently ended** (Option B) vs. **a dedicated pinned section** (Option A): chose A — debugging startup failures is the stated #1 reason to open the page; a pinned, auto-hiding section puts them first with zero scanning. (Both were mocked: `750:1173` vs `751:1189`.)
- **Per-agent cancel inline on every Agents-list row** vs. **page + drawer only**: chose page + drawer — keeps a destructive control out of the dense list while keeping it one click from wherever you're inspecting a specific agent.

## Resolved decisions

- Runner = **third top-level tab**; chip stays as a corner health-glance + link.
- Cancel = **soft default → escalate to `Force kill` after ~10s**; on Runner-page rows **and** the agent drawer header; Agents-list rows stay status-only.
- Orphans surface explicitly as **Unmanaged runs** with a manual `Reap`; reaper is the auto backstop.
- Init failures get a **dedicated `Failed to start` attention queue** (auto-clear on retry / manual `Archive`), backed by **register-before-preflight + structured `failed-start`**.
- **No-orphaned-logs:** Runner page owns pre-agent logs, drawer owns agent-execution logs, handoff at `registerRun`, keyed by `agentKey`.
- Pause/resume/message is **designed-for now, shipped fast-follow** behind a feasibility spike.

## Forward path

- **Logs filtering + search + per-ticket slicing** — the `agentKey` tagging here is the enabler; the v1 dump becomes a filterable view.
- **Pause / resume / message** — once the mid-turn interrupt spike proves out.
- **Batch controls** — "cancel all", "archive all failed", select-multiple on the Live processes table.
