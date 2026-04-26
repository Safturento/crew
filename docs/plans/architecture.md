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

## Architecture overview

Four packages in an npm workspace:

```
crew/
├── packages/
│   ├── cli/         # `crew` command — what the user types
│   ├── daemon/      # long-running watcher + REST/SSE API
│   ├── dashboard/   # web UI consuming the daemon's API
│   └── shared/      # types, transcript parsing, project config, jira/github clients
└── docs/
```

### CLI

`crew <subcommand>` invocations. Each subcommand is a thin wrapper that loads project config (TOML), validates inputs, and either runs synchronously (e.g. `crew docker-env`) or shells out to the daemon (e.g. `crew run` registers the run with the daemon and tails its events).

Stack: Node 22+, Commander.js for arg parsing, Hono's RPC client for talking to the daemon, execa for shelling out to git/docker/gh/claude.

Subcommands (Phase 1):

- `crew run <KEY>` — create worktree, docker setup, launch claude in headless mode, register the run
- `crew fix-pr <KEY> [--from-pr | --from-file <path> | --from-stdin]` — resume the worktree's session with review feedback
- `crew finish <KEY>` — post-merge cleanup (PR check, docker down, worktree remove, branch delete, jira transition)
- `crew list` — running + recently-finished agents
- `crew status <KEY>` — detailed status of one ticket
- `crew docker-env [path]` — generate per-worktree docker `.env`
- `crew db-clone <KEY>` — clone main's postgres data into a worktree's stack
- `crew normalize-line-endings` — the legacy CRLF fixer (kept for hosts with autocrlf)
- `crew daemon start|stop|status` — daemon lifecycle

### Daemon

A single long-running Node process. Responsibilities:

- Watches `~/.claude/projects/*/` for new JSONL files and appends
- Parses each new transcript event: tool name, input summary, timestamp, `usage.output_tokens`
- Persists run state to SQLite: agents, tool calls, token aggregates, runtime, status
- Tracks docker compose project state per ticket (running / stopped / volumes) by polling `docker compose ls --format json`
- Exposes a REST API for the CLI (`crew status`, `crew list`) and the dashboard
- Streams live events over Server-Sent Events for the dashboard to consume

Stack: Hono (lightweight web framework), better-sqlite3, chokidar for FS watching.

The daemon runs on `localhost` only. No external exposure. Listens on a port read from per-user config (default `7773` for CLI/HTTP, `7774` for SSE).

### Dashboard

React + Vite + Tailwind. Single-page app served by the daemon (or run in dev separately).

Routes:

- `/` — agent list (active + recent)
- `/agent/:key` — per-agent panel: timeline of tool calls, token chart broken down by tool type, runtime, current step. Links: worktree filesystem path, docker stack URL (when running), GitHub PR
- `/projects` — registered projects with their configs

Live updates come from the daemon's SSE stream. No polling.

### Shared package

Pure TypeScript modules used by all three packages:

- `transcripts/` — parse Claude Code's JSONL format (the same logic the bash watch-ticket.sh has, but typed)
- `config/` — per-project TOML config schema + loader
- `jira/` — REST client for status transitions, issue fetch (works alongside the agent's MCP usage; the daemon needs a separate token for batch operations)
- `github/` — gh CLI wrapper for PR state
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

- Workspace setup, base tooling (eslint, prettier, vitest, typescript)
- `shared/` package with transcript types, config loader, prompt templates
- `cli/` package with all the subcommands listed above
- A migration shim in Recipes-App that installs the CLI globally and points the existing `scripts/` at it (or removes them entirely)

**Done when:** every existing bash script has a `crew` equivalent that produces the same outcome with cleaner errors and structured output.

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

- **Distribution.** npm package or curl-installable binary? Bun's build into a single binary is appealing for a CLI but adds a tooling layer. Start with npm-link-then-publish.
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
