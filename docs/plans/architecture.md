# crew — architecture & phased rollout

## Context

This project began as a folder of bash scripts in another repo (`Recipes-App/scripts/`) that orchestrated headless Claude Code agents on Jira tickets. The pattern worked well enough that it grew: per-worktree docker, sandbox config, transcript watching, GitHub PR auto-pull, rebase + conflict resolution, post-merge cleanup, db cloning, Jira transitions. Twelve scripts, several thousand lines of bash, plus prompt templates.

At that scale bash stops being the right tool: error handling is coarse, types are absent, parallel state is awkward, and a real UI is impossible. Hence `crew` — the same workflow, expressed as a typed CLI + a state-tracking daemon + a web dashboard, in a separate repo so it can drive any project, not just the one it was born in.

## Audience

A solo developer (or small team) who:

- Drives Claude Code in headless mode (`--dangerously-skip-permissions -p`) for ticket implementation
- Uses Jira (or a similar issue tracker) as the source of truth for scope
- Wants a single command per ticket (`crew run KAN-23`, `crew fix-pr KAN-23`, `crew finish KAN-23`)
- Wants visibility — current step, token spend, runtime — without crawling JSONL transcripts by hand
- Doesn't want to write the same orchestration bash for every new project they spin up

## Non-goals

- **A general agent framework.** crew assumes Claude Code as the agent runtime. It's not a competitor to LangChain, Inngest, etc.
- **A multi-tenant product.** Designed for personal use. No auth, no billing, no SaaS layer.
- **Project-specific automation.** crew should not have logic that only makes sense for one repo. Repo-specific stuff lives in per-project config files.

## Tech stack

Locked through the brainstorming session in `docs/plans/...` (this file). The choices are intentionally conservative — boring, mature, well-documented libraries — because crew is a tool we want to live with for years, not a place to chase ergonomics fashion.

| Concern             | Pick                  | Notes                                                                                                                                                                        |
| ------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language            | TypeScript            |                                                                                                                                                                              |
| Runtime             | Node 22+              | Native TS via `--experimental-strip-types` exists but skipped for now (experimental, awkward shebangs). Revisit when stable                                                  |
| Dev loop            | **tsx**               | No build step in Phase 1. `bin/crew` is a node shebang that imports `src/cli/index.ts` via tsx. Faster iteration; ~100ms tsx startup is invisible for a manually-invoked CLI |
| Build (when needed) | **esbuild**           | Phase 4+, only if/when we ship as a single binary. Not used in Phase 1                                                                                                       |
| Arg parsing         | **commander**         | Mature, ubiquitous, no surprises. Picked over citty (younger) and yargs (heavier than we need)                                                                               |
| Subprocess          | **execa**             | Better defaults than `node:child_process`. We shell out heavily to git, docker, gh, claude                                                                                   |
| Colors              | **picocolors**        | Lighter and faster than chalk; same API                                                                                                                                      |
| Spinners            | **ora**               | The standard; tty detection out of the box                                                                                                                                   |
| Multi-step progress | **listr2**            | Composes ora-style spinners into a tree. Perfect for the run-ticket sequence (worktree → env → docker bringup → migrations → clone → claude launch)                          |
| Tables              | **cli-table3**        | For `crew list` / `crew status`                                                                                                                                              |
| Interactive prompts | **@inquirer/prompts** | Modular successor to old monolithic inquirer. Cherry-pick what we need (input, select, confirm)                                                                              |
| Schema validation   | **zod**               | Project config TOML, prompt args                                                                                                                                             |
| TOML parsing        | **smol-toml**         | Modern, fast, small. `@iarna/toml` is older and heavier                                                                                                                      |
| Testing             | **vitest**            | Same as Recipes-App; familiar                                                                                                                                                |
| Logging             | none initially        | `console.log` + picocolors is fine for Phase 1. Revisit (probably **pino**) when the daemon needs structured logs                                                            |

**Phase 2/3 add:** chokidar (fs watching), better-sqlite3 + Kysely (state), fastify (daemon HTTP), vite + react (dashboard). Vite + React landed in Phase 3's first slice; Fastify + Kysely scaffolding land in slice 1a of Phase 3 (`docs/superpowers/specs/2026-04-28-daemon-bootstrap-and-projects-endpoint-design.md`).

**Live tool-call stream rendering:** plain stdout + picocolors + ANSI cursor codes. Ink (React for CLIs) is intentionally not used — the one-line-per-tool-call shape doesn't need React to render. Re-evaluate in Phase 3 if a multi-pane TUI for "all running agents" is wanted; that's the kind of view Ink earns its keep on.

**Cross-platform target:** Linux/WSL2 is the primary target (where the tool runs today). Code in `shared/` should use `path.join` and avoid Linux-only APIs where it costs nothing, so macOS support is a free bonus when someone wants it. Windows-native is out of scope — bwrap (the sandbox runtime) is Linux-only anyway.

## Architecture overview

Four packages in an npm workspace. Phase 1 lives entirely in `cli/`; the others are placeholders that fill in during their respective phases. Workspaces are declared upfront (option C from the brainstorm) so we don't have to migrate imports later.

```
crew/
├── packages/
│   ├── cli/         # `crew` command — Phase 1 lives entirely here
│   ├── daemon/      # placeholder — long-running watcher + REST/SSE API (Phase 2)
│   ├── dashboard/   # placeholder — web UI consuming the daemon's API (Phase 3)
│   └── shared/      # placeholder — extracted from cli/ when daemon needs the same code (Phase 2)
└── docs/
```

`shared/` doesn't exist as a populated package during Phase 1 — anything Phase 1 needs lives in `cli/src/lib/` and gets extracted when Phase 2 starts. This avoids premature abstraction.

### CLI

`crew <subcommand>` invocations. Each subcommand is a thin wrapper that loads project config (TOML), validates inputs, and either runs synchronously (e.g. `crew docker-env`) or shells out to the daemon (e.g. `crew run` registers the run with the daemon and tails its events — Phase 2 behaviour; Phase 1 reads transcripts directly).

Subcommands (Phase 1):

- `crew run <KEY>` — create worktree, docker setup, launch claude in headless mode, register the run
- `crew fix-pr <KEY> [--from-pr | --from-file <path> | --from-stdin]` — resume the worktree's session with review feedback
- `crew finish <KEY>` — post-merge cleanup (PR check, docker down, worktree remove, branch delete, jira transition)
- `crew list` — running + recently-finished agents
- `crew status <KEY>` — detailed status of one ticket
- `crew docker-env [path]` — generate per-worktree docker `.env`
- `crew db-clone <KEY>` — clone main's postgres data into a worktree's stack
- `crew normalize-line-endings` — the legacy CRLF fixer (kept for hosts with autocrlf)
- `crew daemon start|stop|status` — daemon lifecycle (no-op stubs in Phase 1)

### Daemon

A single long-running Node process. Responsibilities:

- Watches `~/.claude/projects/*/` for new JSONL files and appends
- Parses each new transcript event: tool name, input summary, timestamp, `usage.output_tokens`
- Persists run state to SQLite: agents, tool calls, token aggregates, runtime, status
- Tracks docker compose project state per ticket (running / stopped / volumes) by polling `docker compose ls --format json`
- Exposes a REST API for the CLI (`crew status`, `crew list`) and the dashboard
- Streams live events over Server-Sent Events for the dashboard to consume

Stack: Fastify + `fastify-type-provider-zod`, Kysely + `kysely-better-sqlite3` (SQLite kept for the personal-tool fit), `@fastify/awilix` for DI, pino for logging, chokidar for FS watching. Aligned with the `reaching-for-backend-patterns` skill — superseded the original Hono / raw-better-sqlite3 picks during the slice 1a brainstorm. See `docs/superpowers/specs/2026-04-28-daemon-bootstrap-and-projects-endpoint-design.md` §1 for rationale.

The daemon runs on `localhost` only. No external exposure. Listens on a port read from per-user config (default `7773` for CLI/HTTP, `7774` for SSE).

### Dashboard

React + Vite + Tailwind. Single-page app served by the daemon (or run in dev separately).

Routes:

- `/` — agent list (active + recent)
- `/agent/:key` — per-agent panel: timeline of tool calls, token chart broken down by tool type, runtime, current step. Links: worktree filesystem path, docker stack URL (when running), GitHub PR
- `/projects` — registered projects with their configs

Live updates come from the daemon's SSE stream. No polling.

### Shared modules (Phase 1: `cli/src/lib/`; Phase 1.5: extracted to `shared/`)

Pure TypeScript modules used by `cli/` initially and (once Phase 2 starts) by `daemon/` too. Living in `cli/src/lib/` during Phase 1 keeps the workspace ceremony low; gets extracted into `shared/` the moment another package needs them.

- `transcripts/` — parse Claude Code's JSONL format (the same logic the bash watch-ticket.sh has, but typed)
- `config/` — per-project TOML config schema (zod) + loader (smol-toml)
- `jira/` — REST client for status transitions, issue fetch (works alongside the agent's MCP usage; the daemon needs a separate token for batch operations)
- `github/` — `gh` CLI wrapper (via execa) for PR state
- `docker/` — compose project introspection, port hash for `.env` generation
- `agents/` — the prompt templates as typed string builders

### State store

SQLite at `~/.config/crew/state.db`. Schema:

```sql
projects        -- one row per registered repo
agents          -- one row per crew run; FK to projects
tool_calls      -- one row per tool_use event in the transcript
runs            -- run-level metadata (started_at, exit_code, etc)
```

No migrations framework needed for the daemon's own schema; better-sqlite3 supports raw DDL on startup.

### Per-project config

`~/.config/crew/projects/<name>.toml`:

```toml
name = "recipes-app"
repo_path = "/home/safturento/Repos/Recipes-App"
default_branch = "main"

[jira]
project_key = "KAN"
site = "https://safturento.atlassian.net"
# token + email from ~/.config/crew/secrets.toml or env

[github]
repo = "Safturento/Recipes"

[docker]
canonical_worktree = "Recipes-App"  # the one that keeps standard ports
http_port_base = 8000
https_port_base = 8400
postgres_port_base = 15400

[playwright]
app_url = "https://localhost:{httpsPort}"

[playwright.smoke]
enabled = true

[playwright.authored]
enabled = true
tests_dir = "tests/e2e"
test_command = "npm run test:e2e"

[sandbox]
allowed_domains = [
  "github.com", "api.github.com", "objects.githubusercontent.com",
  "registry.npmjs.org", "mcp.atlassian.com", "auth.atlassian.com",
  "api.anthropic.com", "statsig.anthropic.com",
]
```

Auto-discovered when `crew` is run from inside a registered repo's tree.

## Phases

### Phase 1 — CLI parity (MVP)

Everything the bash scripts do, but typed. No daemon yet, no dashboard. Each subcommand runs synchronously, prints structured output, exits.

- Workspace setup, base tooling (eslint, prettier, vitest, typescript) — workspaces declared upfront with empty placeholders for `daemon`, `dashboard`, `shared`
- `cli/` package with all the subcommands listed above; cross-cutting helpers (config loader, transcript parser, prompt builders, jira/github clients, port hash) live in `cli/src/lib/` for now
- Distribution via `npm link` from the local crew checkout — no npm publish in Phase 1. The Recipes-App bash shims become `exec crew "$@"` and pick up the linked binary from `PATH`
- A migration shim in Recipes-App that points the existing `scripts/` at the linked CLI

**Done when:** every existing bash script has a `crew` equivalent that produces the same outcome with cleaner errors and structured output.

### Phase 1.5 — `shared/` extraction (transition into Phase 2)

When Phase 2 starts, the daemon will need to import the same transcript parser and config loader that Phase 1 lives with in `cli/src/lib/`. At that moment — not before — extract those modules into the `shared/` workspace package and update `cli` to import from `shared/` instead of `./lib/`. This is a single-PR refactor, not a separate phase per se, but worth calling out so it doesn't get done prematurely.

### Phase 2 — Daemon + state store

The CLI gains a daemon to talk to. Runs become observable after-the-fact.

- `daemon/` package
- SQLite schema + DDL
- chokidar watcher for `~/.claude/projects/*/`
- REST endpoints: `GET /agents`, `GET /agents/:key`, `POST /agents` (CLI registers a run), `GET /projects`
- SSE endpoint: `GET /events`
- CLI gains `crew status`, `crew list`, `crew watch`
- `crew run` and `crew fix-pr` register their runs with the daemon at start

**Done when:** I can `crew list` from any terminal and see every run that's happened today, with token totals.

### Phase 3 — Dashboard

The web UI. Phase 2's REST + SSE endpoints provide everything it needs.

- `dashboard/` package, React + Vite
- Routes: `/`, `/agent/:key`, `/projects`
- Live tool-call stream per agent (SSE)
- Token-by-tool-type chart (recharts or similar)
- Docker stack status per agent with click-through to the worktree's URL
- Daemon serves the built dashboard at `localhost:7773/` in production; `dashboard/` package's dev server runs separately for hot reload

**Done when:** I open `http://localhost:7773` and can see every active agent's progress without touching a terminal.

### Phase 4 — Polish

- Tab completion (bash, zsh, fish) — ticket keys are populated from Jira via a cached query
- Install: `curl -fsSL https://crew.sh/install | sh` style script that drops the binary to `~/.local/bin`
- `crew init <project>` wizard that walks through creating a project config
- Multi-project view in the dashboard
- Optional: notifications when an agent finishes (libnotify on linux, osascript on mac)

## Migration path for Recipes-App

1. Phase 1 ships with `crew` installable globally (npm link initially, npm publish later).
2. `Recipes-App/scripts/` is replaced one script at a time with a one-line shim: `exec crew <subcommand> "$@"`. This preserves the existing `scripts/run-ticket.sh KAN-23` muscle memory while delegating the actual work.
3. Once shims are stable, delete `scripts/` entirely. CLAUDE.md's "Scripts" section gets a single line: "Use `crew --help`."
4. The Recipes-App project config (`~/.config/crew/projects/recipes-app.toml`) encodes everything that's currently hardcoded in the bash scripts.

## Open questions

- **Distribution past Phase 1.** Phase 1 ships via `npm link` from the local checkout. Past that: `npm publish` is the easy default; Node SEA single-binary is fancier but ergonomic for shipping to multiple machines without a Node install. Defer the call until we actually want to install crew somewhere we don't already have it set up.
- **Auth secrets.** Where do gh-token, jira-token, anthropic-api-key live? Currently per-repo `.claude/secrets/`. For crew that's project-config relative, but that re-introduces per-project secret duplication. Probably: per-user `~/.config/crew/secrets.toml` with project-scoped fallbacks.
- **Sandbox config drift.** crew can write `.claude/settings.json` for a worktree, but if the user customises it, crew shouldn't clobber. Use the same "tag the file with a `# generated by crew` header and refuse to overwrite without it" pattern from `docker-env.sh`.
- **Whether Phase 2 + Phase 3 deserve to be separate phases.** They could ship together. Decide based on Phase 1's actual size.
- **MCP tools or REST?** The agent uses MCP for Jira; the daemon will use REST for transitions outside the agent context. Some duplication. Acceptable since it's small.

## Conventions inherited from Recipes-App

The bash-scripts era settled on a few patterns worth keeping:

- LF line endings forced via `.gitattributes` regardless of `core.autocrlf`
- `tsbuildinfo` files always gitignored; never tracked
- Per-worktree docker `.env` with hash-derived ports
- "Refuse to clobber a file we didn't generate" tag headers
- Per-ticket worktrees as `<repo>-<KEY>` siblings of the main checkout
- TOML over JSON for human-edited config

CLAUDE.md (in this repo, once it exists) should call these out so agents working on `crew` itself follow the same conventions.
