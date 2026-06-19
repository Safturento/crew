---
name: architecture
description: 4-package layering rules + dependency direction
last_updated: 2026-06-17
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

The config encodes: repo path, default branch, Jira project key + site, GitHub repo, docker port bases + canonical worktree + service names (caddy/postgres), Playwright app URL, sandbox allowed domains.

## State store

SQLite at `~/.config/crew/state.db`. Schema lives in `packages/daemon/src/db.ts` + numbered migrations in `packages/daemon/src/migrations/`. **Never edit a shipped migration — add a new numbered file instead.**

Tables: `agents`, `runs`, `tool_calls`, `state_transitions`, `startup_events`, `action_requests`, `finish_steps`, `runner_commands`. `startup_events` is fed by a chokidar watcher on `~/.crew/startup/<key>.jsonl` (CREW-201) — see [`dispatch.md`](dispatch.md) for the producer side. `action_requests` (CREW-214) is the dashboard-triggered action queue: the dashboard enqueues a `run`/`fix_pr`/`finish` request, the host runner long-polls + atomically claims it, and each status transition publishes an `action.changed` SSE event from `ActionService`. That host runner is a CLI-managed process (CREW-216): `crew runner start|stop|restart|status|logs` (a detached supervisor in `packages/cli/src/lib/runner/` that respawns its long-poll worker on crash, PID file at `~/.config/crew/runner.pid`, logging to `~/.crew/runner/runner.log`), with `crew up`/`down` wrapping `docker compose` + the runner. It is the one long-lived CLI process — still thin per the layering rule, with the poll/execute/report logic under `lib/runner/`. Plain `docker compose up` stays standalone (no runner required). `finish_steps` (CREW-215) is written by `POST /api/agents/:key/finish-step` as `crew finish` reports each step, and read back as the drawer's finish checklist. `runner_commands` (CREW-241 / Epic CREW-235) is the reverse-command queue for runner control: the operator enqueues a control command (`cancel_soft`/`cancel_hard`/`dequeue`/`reap`, with `pause`/`resume`/`message` designed-for), the runner drains pending rows each heartbeat cycle, and each transition publishes a `runner.command_changed` SSE event from `RunnerCommandsService` (`enqueue` → atomic `claimPending` → `reportResult`). The forward half of that control path (CREW-242) is the runner's live-process snapshot: the runner POSTs it on its existing heartbeat (`POST /api/runner/heartbeat` with an optional `{ snapshot }` body), `RunnerStatusService` mirrors it **in-memory** (not persisted — re-hydrated on restart) and republishes it on a `runner.snapshot_changed` SSE event distinct from the edge-only `runner.status_changed`; `GET /api/runner/status` carries the `processes` for SSE seeding. The command routes (`POST /api/runner/commands`, `GET /api/runner/commands/pending`, `POST /api/runner/commands/:id/result`) are thin wrappers over `RunnerCommandsService`. The host side of that control path (CREW-243) lives in `lib/runner/`: the worker's `executeAction` spawns each verb detached (its own process group, so `pgid === pid`) and records it in an in-memory `Registry` keyed by `agentKey`; `runLoop` serializes `registry.toSnapshot()` into each heartbeat and, every cycle, `drainCommands` claims pending commands and `applyCommand`s them — `cancel_soft` → `kill(-pgid, SIGTERM)` + mark `cancelling`, `cancel_hard` → `kill(-pgid, SIGKILL)` + drop tracking, `reap` → drop tracking without signalling; `dequeue`/`pause`/`resume`/`message` report `failed` "not yet supported" host-side. `crew runner status` renders the live registry from `GET /api/runner/status`. The `runs` table also carries a CREW-244 (migration 0010) failed-start lifecycle: a nullable `status` (`launching`/`running`/`failed-start`) plus `failure_check`/`failure_headline`/`failure_remediation`/`failure_output` + an `acknowledged` flag. `crew run` pre-registers a `launching` row **before** preflight (so an init failure leaves a trace), and `RunFailureService` converts it to a structured `failed-start` on `PreflightError`, auto-acknowledges a prior failed-start when a fresh run registers, and time-reaps a stuck `launching` row. `status` is null for legacy/normal runs, so the existing `completed_at`/`exit_code`/transition state derivation is untouched. See [`dispatch.md`](dispatch.md) for the register-before-preflight ordering.

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
