# Runner page retirement + unified agent lifecycle + pre-registration visibility

**Status:** design approved (in-session, 2026-06-30), ready for planning
**Builds on / reworks:**

- CREW-249 runner drawers (`docs/superpowers/specs/2026-06-25-runner-drawers-design.md`) — shipped the run/supervisor drawers and the `failedToStart`/`queued`/`recentlyEnded` read surfaces. This initiative **retires the standalone Runner page** those drawers lived on and folds its content into the Agents grid + a header-toggled supervisor drawer.
- CREW-244 register-before-preflight — `reportLaunching` / `reportFailedStart`, the `launching`/`failed-start` run statuses.
- CREW-287 orphan-branch reclaim (`reconcileOrphanBranch`) and CREW-288 `reapDead` liveness sweep.

**Figma:** file `9FeJPriqdsdA4n9R5Xsrr8`, **Brainstorm** page — `FINAL` grid (node `901:2209`), supervisor drawer overview (node `899:1887`). Inline-only and drawer-only comparison frames sit beside them (`892:1568`, and the drawer variant) as the decision trail.

**Followup:** `docs/followups/daemon-cli-dispatch.md` → *2026-06-30 — Runs that die in the early preflight gate are invisible in the dashboard*. This spec is that followup graduating into planning; stamp it with the Epic key at ticket-creation time.

## Context

`crew run HAI-12` (home-assistant) "immediately got reaped" with nothing useful in the supervisor logs. Root cause: the run died in the **early `crew_startup_preflight` gate** — `requireWorktreeAvailable` threw *"worktree already exists"* (a stale worktree left by an interrupted June-16 run) — and that whole failure class is **invisible in the dashboard**.

Two disjoint error channels exist, and early-gate failures take the one the UI can't render:

1. **Startup-events JSONL** (`failStartupPhase` → `~/.crew/startup/<key>.jsonl` `failed` → daemon `IngestService.recordError`). Writes only a `state_transitions` row keyed on `agentKey`. **No `agents` row exists yet** — that's created later at `registerRun` (step 13). Every dashboard surface reads off `agents`/`runs`, so the transition is orphaned and invisible. Verified live: `/api/agents` returned 134 agents, zero for the failed key.
2. **Daemon failed-start surface** (CREW-244: `reportLaunching` → `launching` run row → `reportFailedStart` → `failedToStart`). Wired through `runTrackedPreflight`, which wraps only `prepareAgentEnvironment` (step 7) — *after* the early gate. The worktree check (`run.ts:261`) `process.exit`s before `reportLaunching` is ever called, so no `launching` row is minted; and even inside the wrapper `reportFailedStart` only fires for `err instanceof PreflightError`, which the plain-`Error` worktree check is not.

The runner then reaps the dead detached child ~2s later and logs a bare `reaped 1 dead process(es): HAI-12` — no reason attached. CREW-249 built the *surfaces* (drawers, failed-start list) but never rewired the early gate to feed them; CREW-287/288 both explicitly punted "a run that dies before registering still has no `runs` row for the daemon to settle" to CREW-249, which closed without covering it.

> Not a CREW-287 regression. CREW-287 reclaims an orphan **branch** inside the `crew_startup_worktree` phase; HAI-12 hit a leftover worktree **directory** caught one phase earlier in preflight, so `reconcileOrphanBranch` never ran. Different failure mode, earlier gate.

While fixing visibility, the Runner page itself is worth retiring: its per-run rows (live / queued / failed-start / recently-ended) are shallow clones of the Agents grid. If a row exists from the moment a run is initiated, those sections *are* the grid.

## Goals

- **An agent row exists from the earliest moment a run is initiated** on both entry paths, and tracks every state through to terminal — so no startup failure is ever invisible.
- **Retire the standalone Runner page.** The Agents grid becomes the single surface for the full run lifecycle; the supervisor drawer (toggled from the header runner chip) holds runner-process concerns.
- **Every startup failure resolves to a durable, findable place** (the "no silent failure" invariant).
- **Safe restart from the dashboard** for a wedged run — no CLI required.

## Design

### 1. Row birth — earliest point per path, daemon-owned

The agent row is created by a single **idempotent daemon upsert keyed on agent key**. Both entry paths call it at the earliest point where the row's `NOT NULL` fields (`project_name`, `worktree_path`) are known; `worktree_path` derives from project + key via `worktreePathFor`. Every later phase is a transition on that one row.

- **Dashboard path → at `enqueue`.** `ActionService.enqueue` already writes the `action_request` row; it creates the agents row in the same transaction, state **`queued`**. Cannot be earlier — enqueue is the birth of the request.
- **Direct CLI path → immediately after `discoverProjectConfig`** (step 1). The daemon can't know a terminal `crew run` exists until the CLI tells it, and the CLI can't name the project or derive the worktree until config resolves — which is the very first thing `run.ts` does (local, no daemon). The CLI's first daemon call fires there, state **`initializing`**, *before* tool-preflight / worktree / env.

Consequences:

- `reportLaunching` (or its successor) moves genuinely ahead of the early preflight gate, and the early-gate failures (`failStartupPhase`: tool-preflight, gh-auth, worktree-available) transition the existing row to `error` instead of `process.exit`ing with no daemon trace. Either widen the failed-start path to accept these (not just `PreflightError`), or route `failStartupPhase` through the same daemon report before it exits.
- `registerRun` (step 13) becomes an **update** of the existing row (session id, started-at, transition to `running`), not the create.

> **The one accepted pre-row gap: config-resolution failure.** If `discoverProjectConfig` fails (repo has no crew config — HAI-12's original June-16 error), there is no `project_name` to attribute a row to, and the grid is grouped by project. This is caught instantly in the foreground terminal; we accept it as the sole failure that predates the row rather than relax `project_name` to nullable (which would need a project-less "orphan" bucket in a project-grouped grid). It is still surfaced — see §3.

### 2. State model

The pre-run phases become first-class states on the agent row, rendered as pills in the grid:

```
queued ─▶ initializing/launching ─▶ running ─▶ pr_open ─▶ pr_merged
   │            │                        └────────────▶ idle / waiting
   └────────────┴──▶ error (incl. failed-start)         finished
                                          (any state) ──▶ orphaned
```

- **`queued`** *(new)* — enqueued, runner has not yet claimed. Idle/grey pill.
- **`Starting`** — the collapsed **`launching` + `initializing` + `init`** phases. One visible "Starting" pill; the sub-states remain tracked internally (for enriched reap logs and for knowing whether a run is still dequeue-able).
- **`error`** — **failed-start folds into `error`**; there is no distinct failed-start *state*. A run that died before registering is simply an error row that happens to carry a startup-phase reason. Red pill.
- **`orphaned`** *(new)* — DB says running but no live process (daemon/runner mismatch). Amber pill.
- Existing `running` / `pr_open` / `pr_merged` / `idle` / `waiting` / `finished` unchanged.

Two genuinely new AgentRow variants to add: **`queued`** and **`orphaned`**. `Starting` reuses the existing `initializing` variant (relabelled). `error` already exists.

> Deep-links the two CREW-244 followups: *"failed-start rows render as plain `error` agents"* — now intentional (failed-start **is** error) — and *"only `PreflightError` becomes a structured failed-start"* — resolved by §1 moving row creation ahead of the gate.

### 3. Invariant — no startup failure is silent

Every startup failure resolves to at least one durable, findable place:

- **Row-eligible failures** (tool-preflight onward, incl. the worktree-exists case) → a transition on the agent row to `error`, visible in the grid with the reason inline.
- **Runner-spawned pre-row failures** (config-resolution, or anything before the row exists) → the runner **enriches its reap line** in the management log. Today it writes `reaped 1 dead process(es): HAI-12`; it will read the dead child's startup log tail (`~/.crew/startup/<key>.log` / last `failed` `.jsonl` phase — both keyed on the run key the runner already holds) and append the reason: `reap HAI-12 · startup failed: worktree exists`. `reapDead` already returns the reaped keys.
- **Direct-CLI pre-row failures** → the foreground terminal + the persisted `~/.crew/startup/<key>.{jsonl,log}` (already true today).

### 4. Retire the Runner page

The standalone Runner page and its six sections are removed. Everything folds into the Agents grid + the supervisor drawer.

**Nav.** The `Runner` tab is removed. A **runner status chip** (`● Runner · N live`, the existing `RunnerStatusChip`) on the right of the header becomes the **supervisor-drawer toggle**; it can carry a count badge when reconciliation items exist.

**Grid = single lifecycle surface.** `queued` / `Starting` / `running` / `error` / `orphaned` / `finished` rows all live in their **natural project section** — there is **no separate "needs attention" cluster**. An error row sits in its project section exactly like any other row (e.g. the HAI-12 error row under a `home-assistant` section).

**Row cleanup.** Terminal rows (`error`, `finished`, `pr_merged`) age into the grid's existing recently-ended / terminal treatment. A dead pre-run row is just an `error` row; re-running the key supersedes it (CREW-244 auto-ack already clears prior failure state on re-register).

### 5. Rows are directly actionable in place

Each row exposes its relevant action inline, in its natural position:

- **`error`** → **Restart** + **Inspect** (Inspect opens the run drawer / startup log).
- **`queued`** → **Dequeue** (drop the still-pending action).
- **`orphaned`** → **Reap** (force-settle the mismatch).
- Existing `running` → Cancel, `pr_open` → View PR / Finish, `idle`/`waiting`/`error(agent)` → Resume, etc.

### 6. Supervisor drawer = housekeeping overview (not the only place to act)

Toggled from the runner chip. Scope = the **host runner process**, plus a consolidated roll-up of housekeeping items. Contents:

- **Status** — heartbeat age, worker count, uptime, pid, running/stopped pill.
- **Controls** — Start / Stop / Restart the runner (CREW-293 wired Stop/Restart; cold Start may stay a CLI hint).
- **Reconcile roll-up** — *every* `queued` + `orphaned` run across all projects, gathered in one list with Dequeue / Reap. This **duplicates** the inline row actions on purpose: act inline where you spot an item, or open the drawer for the consolidated sweep.
- **Management log** — spawn / respawn / heartbeat / reap, with the **enriched reap reasons** from §3.

> The row-level actions and the drawer roll-up coexist by design ("implement both"). Per-agent *recovery* (Restart / Resume / Ack) is always inline on the row; runner *housekeeping* (Dequeue / Reap) is inline **and** rolled up in the drawer.

### 7. Safe dashboard restart

The `error`-row **Restart** action performs the worktree reconcile that today requires `crew restart <KEY> --hard`. This means extending CREW-287's "safe to auto-reclaim" logic from orphan **branches** to orphan **worktree directories**: a leftover worktree whose branch has no unique commits beyond `origin/<default>` is safe to delete + recreate; one with unrecovered work refuses with an actionable message. Run in preflight so the common wedge self-heals instead of hard-failing.

## Out of scope

- Duplicate/stale-runner detection and a `crew runner restart --force` reset verb (separate followup: *2026-06-28 — Orphaned/stale runner workers heartbeat forever*). The supervisor drawer is where those warnings would surface later.
- The anonymous `node_modules` volume-leak fix (separate reminder/followup).
- Relaxing `project_name` to nullable to also capture config-resolution failures as rows (see §1 accepted gap).

## Shape of work (for planning)

An Epic spanning three areas; children roughly:

1. **Daemon — row-at-initiation.** Idempotent agent-row upsert; `enqueue` creates a `queued` row; `registerRun` becomes an update. New `queued` + `orphaned` states in the reducer + `state-derivation`. (`ActionService`, `IngestService`/`RunFailureService`, `state-reduce`, migrations.)
2. **CLI — early-gate visibility.** Move the row-create/`reportLaunching` ahead of `discoverProjectConfig`'s successors; route `failStartupPhase` (tool/gh-auth/worktree) through the daemon report; enrich the runner reap line with the startup-log reason. (`commands/run.ts`, `lib/run/preflight-tracking.ts`, `lib/runner/loop.ts` + `registry.ts`.)
3. **CLI — safe worktree reclaim.** Extend `reconcileOrphanBranch` to safe worktree-directory reclaim; wire the dashboard Restart action to it.
4. **Dashboard — unified grid.** New `queued` / `orphaned` AgentRow variants; inline Dequeue / Reap / Restart / Inspect; remove the Runner tab; runner chip toggles the supervisor drawer.
5. **Dashboard — supervisor drawer.** Status + controls + Reconcile roll-up + enriched management log; delete the standalone Runner page + its now-dead sections.

Parallelism: (1) is the spine most others depend on. (2) and (3) are CLI-side and can proceed against (1)'s row contract. (4) and (5) are dashboard-side; (4) needs (1)'s new states, (5) needs the Reconcile read surface. One migration-adder per batch (per the parallel-merge manifest-conflict rule).

## Open questions

- Does the runner chip's count badge count only `orphaned` (true anomalies), or `queued` + `orphaned`? (Queued is normal transient state when the runner is healthy.)
- On the direct-CLI path, is the very-earliest `initializing` row created synchronously (blocking the first ~ms of `crew run` on a daemon round-trip) or fire-and-forget best-effort like today's reports? Best-effort keeps `crew run` resilient to a down daemon.
- Does `Inspect` on an `error` row reuse the CREW-249 run drawer as-is, or a lighter startup-log view?
