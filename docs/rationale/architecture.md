# Architecture — rationale & history

Background and design rationale for crew's architecture. The current rules live in [`.agents/architecture.md`](../../.agents/architecture.md); this file captures the _why_ and the historical evolution of the design.

## Origin

This project began as a folder of bash scripts in another repo (`Recipes-App/scripts/`) that orchestrated headless Claude Code agents on Jira tickets. The pattern worked well enough that it grew: per-worktree docker, sandbox config, transcript watching, GitHub PR auto-pull, rebase + conflict resolution, post-merge cleanup, db cloning, Jira transitions. Twelve scripts, several thousand lines of bash, plus prompt templates.

At that scale bash stops being the right tool: error handling is coarse, types are absent, parallel state is awkward, and a real UI is impossible. Hence `crew` — the same workflow, expressed as a typed CLI + a state-tracking daemon + a web dashboard, in a separate repo so it can drive any project, not just the one it was born in.

## Audience

A solo developer (or small team) who:

- Drives Claude Code in headless mode (`--dangerously-skip-permissions -p`) for ticket implementation.
- Uses Jira (or a similar issue tracker) as the source of truth for scope.
- Wants a single command per ticket (`crew run KAN-23`, `crew fix-pr KAN-23`, `crew finish KAN-23`).
- Wants visibility — current step, token spend, runtime — without crawling JSONL transcripts by hand.
- Doesn't want to write the same orchestration bash for every new project they spin up.

## Non-goals

- **A general agent framework.** crew assumes Claude Code as the agent runtime. It's not a competitor to LangChain, Inngest, etc.
- **A multi-tenant product.** Designed for personal use. No auth, no billing, no SaaS layer.
- **Project-specific automation.** crew should not have logic that only makes sense for one repo. Repo-specific stuff lives in per-project config files.

## Tech stack — why these picks

The choices are intentionally conservative — boring, mature, well-documented libraries — because crew is a tool we want to live with for years, not a place to chase ergonomics fashion.

- **Node 22+ via `tsx`** — native TS via `--experimental-strip-types` exists but was skipped (experimental, awkward shebangs). Revisit when stable. `tsx`'s ~100ms startup is invisible for a manually-invoked CLI; no build step keeps the dev loop tight.
- **esbuild** is reserved for Phase 4+, only if/when we ship as a single binary. Not used in Phase 1.
- **commander** over citty (younger) and yargs (heavier). Mature, ubiquitous, no surprises.
- **execa** over `node:child_process` for the heavy shelling-out to git, docker, gh, claude.
- **picocolors** over chalk — lighter, faster, same API.
- **smol-toml** over `@iarna/toml` — modern, fast, small.
- **Vitest** over jest — same as Recipes-App; familiar.
- **Logging:** intentionally none in early Phase 1 (`console.log` + picocolors). Pino entered when the daemon needed structured logs.
- **Live tool-call stream rendering:** plain stdout + picocolors + ANSI cursor codes. Ink (React for CLIs) is intentionally _not_ used — the one-line-per-tool-call shape doesn't need React to render. Re-evaluate if a multi-pane TUI for "all running agents" is wanted; that's the kind of view Ink earns its keep on.
- **Cross-platform target:** Linux / WSL2 is the primary target. Code in `shared/` should use `path.join` and avoid Linux-only APIs where it costs nothing, so macOS support is a free bonus when someone wants it. Windows-native is out of scope — bwrap (the sandbox runtime) is Linux-only anyway.
- **Daemon stack pivot.** The original picks (Hono + raw `better-sqlite3`) were superseded during slice 1a of Phase 3 in favour of **Fastify + `fastify-type-provider-zod` + Kysely + `kysely-better-sqlite3` + `@fastify/awilix`**, to align with the `reaching-for-backend-patterns` skill. See `docs/superpowers/specs/2026-04-28-daemon-bootstrap-and-projects-endpoint-design.md` §1 for the full rationale.

## Phased rollout (history)

The workspace was declared upfront with empty placeholders for `daemon`, `dashboard`, and `shared` so we wouldn't have to migrate imports later.

### Phase 1 — CLI parity (MVP)

Everything the bash scripts did, but typed. No daemon yet, no dashboard. Each subcommand ran synchronously, printed structured output, exited.

- Workspace setup, base tooling (eslint, prettier, vitest, typescript).
- `cli/` package with subcommands: `crew run`, `crew fix-pr`, `crew finish`, `crew list`, `crew status`, `crew docker-env`, `crew db-clone`, `crew normalize-line-endings`, `crew daemon` (no-op stubs).
- Cross-cutting helpers (config loader, transcript parser, prompt builders, jira/github clients, port hash) lived in `cli/src/lib/` initially.
- Distribution via `npm link` from the local crew checkout — no npm publish in Phase 1. The Recipes-App bash shims became `exec crew "$@"` and picked up the linked binary from `PATH`.

**Done when:** every existing bash script had a `crew` equivalent that produced the same outcome with cleaner errors and structured output.

### Phase 1.5 — `shared/` extraction

When Phase 2 started, the daemon needed to import the same transcript parser and config loader that Phase 1 lived with in `cli/src/lib/`. At that moment — not before — those modules were extracted into the `shared/` workspace package, and `cli` was updated to import from `shared/` instead of `./lib/`. Single-PR refactor, not a phase per se.

### Phase 2 — Daemon + state store

The CLI gained a daemon to talk to. Runs became observable after-the-fact.

- `daemon/` package.
- SQLite schema + DDL.
- chokidar watcher for `~/.claude/projects/*/`.
- REST endpoints: `GET /agents`, `GET /agents/:key`, `POST /agents` (CLI registers a run), `GET /projects`.
- SSE endpoint: `GET /events`.
- CLI gained `crew status`, `crew list`, `crew watch`.
- `crew run` and `crew fix-pr` register their runs with the daemon at start.

**Done when:** `crew list` from any terminal showed every run that had happened today, with token totals.

### Phase 3 — Dashboard

The web UI. Phase 2's REST + SSE endpoints provided everything it needed.

- `dashboard/` package, React + Vite.
- Routes: `/`, `/agent/:key`, `/projects`.
- Live tool-call stream per agent (SSE).
- Token-by-tool-type chart.
- Docker stack status per agent with click-through to the worktree's URL.
- Daemon serves the built dashboard in production; `dashboard/` package's dev server runs separately for hot reload.

**Done when:** opening `http://localhost:7773` showed every active agent's progress without touching a terminal.

### Phase 4 — Polish

- Tab completion (bash, zsh, fish) — ticket keys populated from Jira via a cached query.
- Install: `curl -fsSL https://crew.sh/install | sh`–style script that drops the binary to `~/.local/bin`.
- `crew init <project>` wizard.
- Multi-project view in the dashboard.
- Optional: notifications when an agent finishes (libnotify on linux, osascript on mac).

## Migration path from Recipes-App

1. Phase 1 shipped with `crew` installable globally (`npm link` initially, `npm publish` later).
2. `Recipes-App/scripts/` was replaced one script at a time with a one-line shim: `exec crew <subcommand> "$@"`. This preserved the existing `scripts/run-ticket.sh KAN-23` muscle memory while delegating the actual work.
3. Once shims were stable, `scripts/` was deleted entirely; CLAUDE.md's "Scripts" section shrank to "Use `crew --help`."
4. The Recipes-App project config (`~/.config/crew/projects/recipes-app.toml`) encodes everything that used to be hardcoded in the bash scripts.

## Settled questions

A few open questions from the original design have since been resolved:

- **Sandbox config drift.** Settled in favour of the "tag the file with a `# generated by crew` header and refuse to overwrite without it" pattern from `docker-env.sh`. The catalog of which sandbox restrictions have known workarounds (and which are hard-limited by Claude Code) is documented separately (and will land at `.agents/security.md` in a later Phase 2 ticket).
- **Whether Phase 2 + Phase 3 deserve to be separate phases.** Settled: they shipped separately. Phase 1's size warranted the split.
- **MCP tools or REST?** Settled: the agent uses MCP for Jira; the daemon uses REST for transitions outside the agent context. Some duplication is acceptable since it's small.

For questions still open today, see the "Currently open architectural questions" section of [`.agents/architecture.md`](../../.agents/architecture.md).
