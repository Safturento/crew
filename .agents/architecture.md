---
name: architecture
description: 4-package layering rules + dependency direction
last_updated: 2026-06-25
covers:
  - 'packages/*/src/**/*.ts'
  - 'package.json'
---

# Architecture

Four-package npm workspace. Dependency direction is one-way:
`cli` → `shared`, `daemon` → `shared`, `dashboard` → daemon's HTTP API.
`shared` is the leaf — it imports from nothing else in this repo.

```
crew/
├── packages/
│   ├── cli/         # the `crew` command
│   ├── daemon/      # long-running watcher + REST/SSE + SQLite state
│   ├── dashboard/   # React + Vite web UI
│   └── shared/      # types, transcript parsing, project config, jira/github clients
└── docs/
```

The `--workspace` flag takes the package's `name` (e.g. `crew-cli`, `crew-daemon`), not the directory name.

## Package layering rules

- **CLI** (`packages/cli/`) — subcommand wrappers. Each command parses args, validates input, and either calls `shared/` or talks to the daemon. **No business logic in the CLI itself.**
- **Daemon** (`packages/daemon/`) — Fastify HTTP + SSE + SQLite state. Routes are thin; services own logic. **The daemon never reads disk for things the CLI can pass.**
- **Dashboard** (`packages/dashboard/`) — React + Vite. View over the daemon's API. **No business logic — purely presentational.**
- **Shared** (`packages/shared/`) — types, transcript parsers, project config, Jira/GitHub clients, docker introspection. **No imports from `cli/`, `daemon/`, or `dashboard/`.**
- **Per-project config is the only place project-specific knowledge lives.** Don't hardcode `"Recipes-App"` (or any other project name) anywhere; everything is parameterised on the loaded project config.

## Tech stack (current)

| Concern             | Pick                                       | Notes                                              |
| ------------------- | ------------------------------------------ | -------------------------------------------------- |
| Language            | TypeScript                                 | strict mode, `verbatimModuleSyntax`                |
| Runtime             | Node 22+ via `tsx` for dev                 | no build step in dev                               |
| Arg parsing         | commander                                  |                                                    |
| Subprocess          | execa                                      | for git / docker / gh / claude                     |
| Colors              | picocolors                                 | lighter/faster than chalk; same API                |
| Spinners            | ora                                        |                                                    |
| Multi-step progress | listr2                                     | composes ora spinners; used by `crew run` sequence |
| Tables              | cli-table3                                 |                                                    |
| Interactive prompts | `@inquirer/prompts`                        | cherry-pick `input` / `select` / `confirm`         |
| Schema validation   | zod                                        | project config TOML, prompt args                   |
| TOML parsing        | smol-toml                                  |                                                    |
| HTTP server         | Fastify + `fastify-type-provider-zod`      | daemon only                                        |
| DB                  | Kysely + `kysely-better-sqlite3`           | daemon only                                        |
| DI                  | `@fastify/awilix`                          | daemon only                                        |
| FS watching         | chokidar                                   | daemon only                                        |
| Testing             | Vitest (+ React Testing Library frontend)  | tests live alongside source                        |
| Logging             | pino (daemon); `picocolors` for CLI stdout |                                                    |

For the _why_ behind these picks — and what was considered and ruled out — see [`docs/rationale/architecture.md`](../docs/rationale/architecture.md).

## Per-project config

Per-project TOML at `~/.config/crew/projects/<name>.toml`. Auto-discovered when `crew` is invoked from inside a registered repo's tree. **Nothing project-specific is hardcoded in code** — all customization flows through the loaded project config.

The config encodes: repo path, default branch, Jira project key + site + `ready_status` (the workflow status the New Run ticket picker lists as candidates, default `"Ready for Development"`, CREW-277), GitHub repo, an optional GitHub `webhook_hook_id` (the non-secret pin for PR-merge webhook deliveries, CREW-269), docker port bases + canonical worktree + service names (caddy/postgres), Playwright app URL, sandbox allowed domains.

Per-repo GitHub **webhook secrets** live outside the project TOMLs, in a single daemon-loaded `~/.config/crew/github-webhook-secrets.toml` (`repo → secret` map, loaded by `loadGithubWebhookSecrets` in `crew-shared`; `CREW_GITHUB_WEBHOOK_SECRETS_FILE` overrides the path). A missing file is tolerated (zero configured webhooks); a present-but-malformed file throws.

The daemon's own **Jira credentials** (`CREW_JIRA_EMAIL` / `CREW_JIRA_API_TOKEN`, threaded through `docker-compose` `environment:`, CREW-278) back the New Run ticket picker: `GET /api/projects/:slug/tickets` → `TicketsService.listProjectTickets` runs one `JiraClient.searchIssues` for the project's `ready_status` tickets, groups them by parent Epic, classifies each runnable-vs-blocked from its `is blocked by` links (a `done`-category blocker doesn't block), flags each `interactive` from the Jira `interactive` label (CREW-285 — must be driven live, not via `crew run`), and overlays `AgentsService.activeTicketKeys` (ticket keys with a non-terminal agent). A degraded list is a **200** with `{available:false, reason:'no_credentials'|'jira_unreachable'}` — missing creds or an unreachable Jira are expected states, never a 5xx — so the dashboard degrades to manual ticket-key entry; an unknown slug still 404s before any Jira call.

## State store

SQLite at `~/.config/crew/state.db`. Schema lives in `packages/daemon/src/db.ts` + numbered migrations in `packages/daemon/src/migrations/`. **Never edit a shipped migration — add a new numbered file instead.**

Tables: `agents`, `runs`, `tool_calls`, `state_transitions`, `state_events_applied`, `startup_events`, `action_requests`, `finish_steps`, `runner_commands`. `startup_events` is fed by a chokidar watcher on `~/.crew/startup/<key>.jsonl` (CREW-201) — see [`dispatch.md`](dispatch.md) for the producer side. `state_transitions` is additionally driven by a second chokidar watcher on `~/.crew/state-events/<key>.jsonl` (CREW-254, Epic CREW-252): producers append concrete lifecycle *facts* (`run_started`/`pr_created`/`fixpr_started`/`fixpr_exited`/`run_exited`/`run_paused`/`finish_completed`), and `IngestService.ingestStateEvent` dedups each on `eventId` (via the `state_events_applied` ledger, making a re-read after a daemon restart exactly-once), runs the pure total reducer `reduceState(currentState, event, exitCode?) → next | null` (`services/state-reduce.ts`), and writes the resulting `state_transitions` row. This makes the formerly-dormant `idle` state reachable (a clean `run_exited` with no PR, or a `run_paused` pause-interrupt that keeps the run resumable — CREW-273; a non-zero `*_exited` routes to `error`, but `run_paused` is exempt from that branch since a pause SIGTERMs the runner yet must never error), and `idle`/`waiting` now project to their own badge state (CREW-257) rather than collapsing to `running`. As of CREW-257 concrete events are the **sole** driver of agent state: the older inferred path (transcript tool-call scanning → `computeNextState`) has been removed, and `IngestService` transcript ingestion is now purely `tool_calls`/timeline/metrics. The route-driven terminal transitions (`recordFinishCompleted`, `recordRunCompleted`, `recordError` for startup-phase failure) remain; `deriveStateFromToolCalls` is retained only for the forward-only CREW-96 backfill of pre-cutover agents. Every `state_transitions` write now flows through a single `IngestService.writeTransitionRow` + `announceTransition` pair and stamps a nullable `source` column (CREW-259, migration 0012) recording what drove the hop — a `StateEvent` source (`cli-run`/`cli-fixpr`/`cli-finish`/`runner-exit`/`hook-pr-create`), `poller` (`PrPoller`'s `pr_merged` flip), `startup-failure` (`recordError`), or `override`; legacy rows carry null. `source` is debug-only provenance — no UI surfaces it. The `override` value is the operator escape hatch: `POST /api/agents/:key/state` → `IngestService.recordStateOverride(key, toState)` writes a transition **bypassing `reduceState` and its terminal stickiness** — the one path that can move an agent OUT of `finished`/`pr_merged` — then advances the in-memory cache (so a later automatic event reduces against the corrected state) and publishes `agent.state_changed`. It is a no-op when the agent already sits in the target state, and never touches the durable `~/.crew/state-events` log or the dedup ledger (it is a correction, not a lifecycle fact). The route is thin: 404 unknown agent, 400 invalid state (Zod enum over the 8 transition targets), 200 with `{from,to}` or `{noop,state}`. The *displayed* badge is computed by `AgentsService.deriveState` (read-path projection feeding `GET /api/agents` + `/:key`), which as of CREW-264 defers to the latest transition when its `source='override'` — so an override OUT of a terminal state survives a list/detail re-derive instead of reverting after the optimistic SSE flip — and otherwise layers the legacy terminal guards (`finishCompletedOk`→`finished`, non-zero `exitCode`→`error`, `prMerged`→`pr_merged`) over the log-projected non-terminal state. Its catch-all for a completed run (exit 0, no PR) with an empty/non-terminal log is `idle`, never a fabricated `finished` (CREW-264 Defect 1); `finished` comes solely from `finishCompletedOk`. The override gate is `source='override'` specifically, preserving the guards' backfill protection for legacy agents. `action_requests` (CREW-214) is the dashboard-triggered action queue: the dashboard enqueues a `run`/`fix_pr`/`finish`/`resume` request, the host runner long-polls + atomically claims it, and each status transition publishes an `action.changed` SSE event from `ActionService`. The `resume` kind (CREW-275, `kind` CHECK widened by migration 0013) shells `crew resume <key>` to continue an idle/interrupted run on its existing worktree — distinct from the `runner_commands` `resume` below, which steers a live paused process. That host runner is a CLI-managed process (CREW-216): `crew runner start|stop|restart|status|logs` (a detached supervisor in `packages/cli/src/lib/runner/` that respawns its long-poll worker on crash, PID file at `~/.config/crew/runner.pid`, logging to `~/.crew/runner/runner.log`), with `crew up`/`down` wrapping `docker compose` + the runner. It is the one long-lived CLI process — still thin per the layering rule, with the poll/execute/report logic under `lib/runner/`. Plain `docker compose up` stays standalone (no runner required). `finish_steps` (CREW-215) is written by `POST /api/agents/:key/finish-step` as `crew finish` reports each step, and read back as the drawer's finish checklist. `runner_commands` (CREW-241 / Epic CREW-235) is the reverse-command queue for runner control: the operator enqueues a control command (`cancel_soft`/`cancel_hard`/`dequeue`/`reap`, with `pause`/`resume`/`message` designed-for), the runner drains pending rows each heartbeat cycle, and each transition publishes a `runner.command_changed` SSE event from `RunnerCommandsService` (`enqueue` → atomic `claimPending` → `reportResult`). The forward half of that control path (CREW-242) is the runner's live-process snapshot: the runner POSTs it on its existing heartbeat (`POST /api/runner/heartbeat` with an optional `{ snapshot }` body), `RunnerStatusService` mirrors it **in-memory** (not persisted — re-hydrated on restart) and republishes it on a `runner.snapshot_changed` SSE event distinct from the edge-only `runner.status_changed`; `GET /api/runner/status` carries the `processes` for SSE seeding. The command routes (`POST /api/runner/commands`, `GET /api/runner/commands/pending`, `POST /api/runner/commands/:id/result`) are thin wrappers over `RunnerCommandsService`. The host side of that control path (CREW-243) lives in `lib/runner/`: the worker's `executeAction` spawns each verb detached (its own process group, so `pgid === pid`) and records it in an in-memory `Registry` keyed by `agentKey`; `runLoop` serializes `registry.toSnapshot()` into each heartbeat and, every cycle, `drainCommands` claims pending commands and `applyCommand`s them — `cancel_soft` → `kill(-pgid, SIGTERM)` + mark `cancelling`, `cancel_hard` → `kill(-pgid, SIGKILL)` + drop tracking, `reap` → drop tracking without signalling, `pause` → `kill(-pgid, SIGTERM)` + mark `paused` (kept tracked, unlike `cancel_*`), `resume`/`message` → re-dispatch `crew resume <key>` (`-m <message>` for `message`) via an injected `resume` boundary on `ApplyCommandDeps` + re-register the entry `running` with the new pid/pgid (CREW-272, Epic CREW-235); `dequeue` reports `failed` "not yet supported" host-side. The non-terminal **paused run-state** half of pause (CREW-273) is built on the `crew run` side, independent of that host apply mapping: a pause reaches `crew run` as a SIGTERM, indistinguishable from a cancel by the signal alone, so the runner writes a `~/.crew/pause-sentinels/<key>` sentinel (`lib/pause-sentinel/`) *before* the SIGTERM and `crew run`'s signal handler consumes (reads+deletes) it — present ⇒ the interrupt is a pause, so it emits a non-terminal `run_paused` (reduced to `idle`, resumable) and **suppresses** the terminal `completeRun`+`run_exited` it would otherwise land. The live `paused` label stays in the runner's in-memory registry snapshot, overlaid on the persistent `idle` run-state. `crew runner status` renders the live registry from `GET /api/runner/status`. The `runs` table also carries a CREW-244 (migration 0010) failed-start lifecycle: a nullable `status` (`launching`/`running`/`failed-start`) plus `failure_check`/`failure_headline`/`failure_remediation`/`failure_output` + an `acknowledged` flag. `crew run` pre-registers a `launching` row **before** preflight (so an init failure leaves a trace), and `RunFailureService` converts it to a structured `failed-start` on `PreflightError`, auto-acknowledges a prior failed-start when a fresh run registers, and time-reaps a stuck `launching` row. `status` is null for legacy/normal runs, so the existing `completed_at`/`exit_code`/transition state derivation is untouched. See [`dispatch.md`](dispatch.md) for the register-before-preflight ordering.

## Inherited conventions

- LF line endings forced via `.gitattributes` regardless of `core.autocrlf`.
- `.tsbuildinfo` files always gitignored; never tracked.
- Per-worktree docker `.env` with hash-derived ports (canonical worktree keeps standard ports).
- "Refuse to clobber a file we didn't generate" — tag generated files with a `# generated by crew` header and refuse to overwrite without it.
- Per-ticket worktrees as `<repo>-<KEY>` siblings of the main checkout.
- TOML over JSON for human-edited config.

## Currently open architectural questions

- **Distribution past Phase 1.** `npm publish` vs Node SEA single-binary; defer until we want to install crew somewhere we don't already have it set up.
- **Auth secrets layout.** Per-user `~/.config/crew/secrets.toml` with project-scoped fallbacks vs per-repo `.claude/secrets/`; not yet finalised.

See [`docs/rationale/architecture.md`](../docs/rationale/architecture.md) for the broader rationale and the _settled_ questions from earlier rounds.
