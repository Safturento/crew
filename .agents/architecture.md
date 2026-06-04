---
name: architecture
description: 4-package layering rules + dependency direction
last_updated: 2026-06-04
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

Tables: `agents`, `runs`, `tool_calls`, `state_transitions`, `startup_events`, `finish_steps`. `startup_events` is fed by a chokidar watcher on `~/.crew/startup/<key>.jsonl` (CREW-201) — see [`dispatch.md`](dispatch.md) for the producer side. `finish_steps` (CREW-215) is written by `POST /api/agents/:key/finish-step` as `crew finish` reports each step, and read back as the drawer's finish checklist.

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
