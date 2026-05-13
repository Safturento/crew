# crew

CLI + dashboard for orchestrating Claude Code agents on tickets.

Started as a pile of bash scripts under `Recipes-App/scripts/` — `run-ticket.sh`, `fix-pr.sh`, `finish-ticket.sh`, etc — that grew into something complicated enough to deserve its own home.

## What it does

You hand `crew` a Jira ticket key. It:

- Sets up a fresh git worktree for the branch
- Generates per-worktree docker config so multiple stacks coexist
- Hands off to a sandboxed Claude Code agent with a self-contained prompt: pull the ticket, plan, implement, verify, push, open a PR, transition Jira
- Surfaces live progress via a CLI watcher and (eventually) a web dashboard
- Handles the post-merge cleanup with one command

The agent runs unattended. You watch the dashboard, review the PR, leave comments, run `crew fix-pr` to apply feedback, merge, run `crew finish` to clean up.

## Install

```sh
git clone git@github.com:Safturento/crew.git
cd crew
./scripts/install.sh
```

Symlinks `~/.local/bin/crew` to the repo's `packages/cli/bin/crew`, runs `npm install`, and installs the system packages `crew run` needs for sandboxing (`bubblewrap`, `socat`) via `sudo apt-get`. Re-run the script after a fresh clone or if `node_modules` is wiped.

## Local development

Crew runs locally as a docker compose stack: a daemon (the orchestration backend) and a dashboard (the React UI). The CLI stays on your host so it can dispatch agents in worktrees outside docker.

### Quick start

```bash
docker compose --profile dev up -d --build
```

This brings up:

- **Daemon** at `http://localhost:7773` — Fastify API + serves the SPA in stable mode.
- **Vite dev server** at `http://localhost:5173` — hot-reload for both daemon and dashboard while you're hacking on crew.

Visit `http://localhost:5173` for hot-reload, or `http://localhost:7773` for the daemon-served production-built SPA.

### Modes

| Command | Mode | When to use |
|---|---|---|
| `docker compose --profile dev up -d --build` | Dev (vite + tsx watch) | Active development on crew. Hot-reload across daemon + dashboard. |
| `docker compose up -d --build` | Stable (daemon only) | Once crew has matured. Daemon serves the pre-built SPA at `:7773`. |

### Configuration via env.toml

Crew uses [`env.toml`](./env.toml) to declare environment variables that get materialized per-worktree by the `crew run` machinery. The file uses `${VAR}` syntax exclusively — legacy `{httpPort}` placeholders are NOT used.

The current env.toml exposes:

- `CREW_PORT` / `CREW_VITE_PORT` — host ports for the daemon and vite. Canonical worktree uses the `default` (7773 / 5173); per-worktree dispatches get hash-allocated ports.
- `APP_URL` — derived URL for the dashboard. Used by `[playwright].app_url` in `~/.config/crew/projects/crew.toml`.
- `DAEMON_URL` — derived URL for the daemon. Used by `[bruno_smoke].base_url`.
- `COMPOSE_PROJECT_NAME` — disambiguates docker resources per-worktree.
- `COMPOSE_PROFILES=dev` — auto-activates the dev profile in worktree stacks.

If you add new project-wide env values that should vary per-worktree (e.g., a new service port), declare them in env.toml first — the materialization layer picks them up automatically.

### Common operations

```bash
docker compose restart                  # restart everything
docker compose restart daemon           # restart just the daemon
docker compose logs -f daemon           # tail daemon logs
docker compose logs -f dashboard        # tail vite logs
docker compose down                     # stop, keep state.db
docker compose down -v                  # stop, wipe state.db
```

### Migrating from a host-side daemon

If you've been running the daemon directly on your host via `tsx watch`, stop that process before bringing up the docker stack — they'd both try to bind `:7773`.

The named volume `crew-state` starts empty by default. To preserve your existing `~/.config/crew/state.db`:

```bash
docker volume create crew_crew-state
docker run --rm \
  -v crew_crew-state:/state \
  -v ~/.config/crew:/host \
  alpine cp /host/state.db /state/state.db
```

This is opt-in. If you don't run it, the docker stack starts with a fresh empty state.db.

### Per-worktree stacks

`crew run CREW-X` provisions an isolated stack per worktree via `crew`'s existing docker bringup machinery. You don't need to manage these — they come up automatically before the agent spawns and tear down at agent finish (or `crew restart --hard`). Stacks use hash-allocated ports so multiple worktrees can run concurrently without collision.

## Setup

A few one-time setup items before `crew` can do everything it's meant to.

### Atlassian MCP (once per machine)

Crew's agent prompts call Jira tools via the prefix `mcp__atlassian__*`, which resolves to the [`sooperset/mcp-atlassian`](https://github.com/sooperset/mcp-atlassian) community server running in Docker. The server name in your Claude Code config **must be `atlassian`** — the prefix is hardcoded in the prompt templates.

Prereqs:
- Docker available on PATH. On WSL2, enable Docker Desktop's WSL Integration for this distro: Settings → Resources → WSL Integration → toggle the distro on.
- An Atlassian API token from id.atlassian.com → Security → API tokens.

Register the server (user scope so it's available in any project):

```sh
claude mcp add atlassian --scope user \
  -e JIRA_URL=https://YOUR-SITE.atlassian.net \
  -e JIRA_USERNAME=you@example.com \
  -e JIRA_API_TOKEN=YOUR_TOKEN \
  -e CONFLUENCE_URL=https://YOUR-SITE.atlassian.net/wiki \
  -e CONFLUENCE_USERNAME=you@example.com \
  -e CONFLUENCE_API_TOKEN=YOUR_TOKEN \
  -- docker run --rm -i \
    -e JIRA_URL -e JIRA_USERNAME -e JIRA_API_TOKEN \
    -e CONFLUENCE_URL -e CONFLUENCE_USERNAME -e CONFLUENCE_API_TOKEN \
    ghcr.io/sooperset/mcp-atlassian:latest
```

Verify with `claude mcp list` — `atlassian` should report `✓ Connected`.

### Playwright (per project, optional)

Crew can give the dispatched agent a Playwright-driven browser pointed at the project's running app, so it can smoke-verify UI changes and/or author committed Playwright tests. Off by default. Opt in by adding a `[playwright]` parent block to the project's TOML at `~/.config/crew/projects/<name>.toml`, plus at least one of the `smoke` or `authored` sub-blocks:

```toml
[playwright]
app_url = "https://localhost:{httpsPort}"   # placeholders {httpPort}, {httpsPort}, {postgresPort} are substituted from the docker .env when [docker] is present
start_command = "npm run dev"               # required when [docker] is not configured

[playwright.smoke]
enabled = true

[playwright.authored]
enabled = true
tests_dir    = "tests/e2e"
test_command = "npm run test:e2e"
```

At least one of `[playwright.smoke]` or `[playwright.authored]` must be present and `enabled = true`; with neither, parsing fails. Both can be on simultaneously.

When `[playwright.smoke]` is enabled, `crew run`:

- Generates `<worktree>/.mcp.json` declaring the [`@playwright/mcp`](https://github.com/microsoft/playwright-mcp) server (`--headless`). The agent auto-discovers it.
- Adds `.mcp.json` to `<worktree>/.git/info/exclude` so it's never committed.

When either sub-mode is enabled, `crew run` leaves the docker stack **running** (today's default is to stop it after bringup) so the agent has a live URL to test against. You can hit the same URL from your own browser during the run.

When disabled (no `[playwright]` section), behaviour is unchanged.

**At agent runtime.** When `[playwright.smoke]` is enabled, the dispatched agent's prompt instructs it to navigate to `app_url` after implementing UI-related changes, take a screenshot, and verify the change visually before claiming "Verify" complete. Backend-only changes skip the smoke step with an explicit note in the PR description.

Crew does **not** install `@playwright/test` for you — the target repo must have it set up (config + script + folder) before the agent can run authored tests. When the prerequisite is missing, the agent surfaces it in the PR description rather than silently skipping. This matches the convention of keeping target-repo dependencies as a target-repo concern.

**Headed sessions for ad-hoc browsing.** The generated `.mcp.json` always uses `--headless`. If you want a headed browser when *you* invoke MCP browser tools interactively in a worktree, register a user-scope server (`claude mcp add -s user playwright -- npx -y @playwright/mcp@latest`) — your user-scope settings will take precedence in your interactive session, but the dispatched agent still uses the worktree-scoped headless config.

### Jira API credentials (once per machine)
`crew finish` transitions the ticket to Done after the PR merges. It reads `CREW_JIRA_EMAIL` and `CREW_JIRA_API_TOKEN` directly from `process.env` — there's no `.env` loading, so dropping them in a repo `.env` won't work. If they aren't set, the transition step is skipped with a warning. Keep them outside any repo. A common pattern is `~/.secrets`, sourced from your shell rc:                        

```sh
# ~/.secrets                        
export CREW_JIRA_EMAIL="you@example.com"
export CREW_JIRA_API_TOKEN="..."
```

```sh                
chmod 600 ~/.secrets
echo '[ -f ~/.secrets ] && source ~/.secrets' >> ~/.bashrc
```

Open a new shell (or `source ~/.bashrc`) and verify with `echo $CREW_JIRA_EMAIL`. The token is the same Atlassian API token the MCP server uses, so you can reuse it.

### Bruno smoke tests (per project, optional)

Crew can run a [Bruno](https://www.usebruno.com/) HTTP smoke check as part of the dispatched agent's verification step, and ensures the agent keeps `.bru` files in sync when endpoints change. Off by default. Opt in by adding a `[bruno_smoke]` section to the project's TOML at `~/.config/crew/projects/<name>.toml`:

```toml
[bruno_smoke]
enabled = true
base_url = "https://localhost:{httpsPort}"   # placeholders {httpPort}, {httpsPort}, {postgresPort} are substituted from the docker .env when [docker] is present
collection_dir = "bruno"                     # optional; defaults to "bruno"

# Optional. Supplies test-user creds for the smoke run's login flow. Omit when
# the API has no auth or the runner injects its own credentials.
[bruno_smoke.smoke_user]
email    = "smoke@example.com"
username = "smoke"
password = "hunter2"
```

When enabled, `crew run` (and `crew fix-pr`):

- Generates `<worktree>/<collection_dir>/environments/<envName>.bru` containing a `vars { baseUrl, testUser.* }` block. `<envName>` is the lowercased worktree basename (e.g. `recipes-app-kan-99` for the KAN-99 worktree).
- Exports `CREW_BRUNO_ENV=<envName>` in the agent's spawn env. The project's `npm run bruno:smoke` script reads it (e.g. `bru run --env "$CREW_BRUNO_ENV" flows/login.bru flows/main-smoke.bru`).
- Leaves the docker stack **running** (composed with `[playwright]`'s lifecycle gate) so the agent has a live API to hit.

When disabled (no `[bruno_smoke]` section), behaviour is unchanged.

**Bootstrap a new project's Bruno collection.** Crew does **not** ship the Bruno collection — the project owns it. Per-project bootstrap (one-time, by hand):

1. Create `<repo>/<collection_dir>/` (default `<repo>/bruno/`) and run `bru init` (or copy a sibling project's collection).
2. Add `<repo>/<collection_dir>/.gitignore` containing `environments/` so generated env files never get committed.
3. Author at least `flows/login.bru` (uses `vars.testUser.*` to authenticate and stashes the token via `vars:post-response { token: res.body.token }`) and `flows/main-smoke.bru` (the project's golden-path API call sequence).
4. Add an npm script:
   ```json
   "scripts": {
     "bruno:smoke": "bru run --env \"$CREW_BRUNO_ENV\" flows/login.bru flows/main-smoke.bru"
   }
   ```
5. Install the Bruno CLI as a dev dep: `npm install --save-dev @usebruno/cli`.

Once these are in place, `crew run` against a backend ticket will do the rest.

**At agent runtime.** When `[bruno_smoke]` is enabled, the dispatched agent's prompt requires `npm run bruno:smoke` as part of the Verify step. A non-zero exit blocks "Verify" the same way a failing unit test does. The agent is also instructed to update the matching `<collection_dir>/endpoints/<route-group>/<verb>-<name>.bru` (and `<collection_dir>/flows/<flow>.bru` where relevant) in the same PR whenever it adds or modifies an HTTP route — keeping smoke coverage from drifting silently.

**During `crew fix-pr`.** The same rules apply: the agent must run `npm run bruno:smoke` before pushing, and must update `.bru` files in the same set of fix-up commits if the fix touches an HTTP endpoint. `crew fix-pr` does not bring docker up itself — if smoke fails with a connection error, the worktree's stack isn't running.

**The `bruno-collection-maintenance` skill.** The agent automatically picks up the user-scope `bruno-collection-maintenance` skill at `~/.claude/skills/bruno-collection-maintenance/`. The skill teaches the file-naming conventions, the `vars:post-response` chaining pattern, and the "update `.bru` when touching endpoints" rule.

### Visual-fidelity verification (per project, optional)

Crew can give the dispatched agent a structured Figma snapshot of the project's design source-of-truth so the agent can compare what it rendered to what the design system specifies. This is the host-side data producer for the agent's `visual-fidelity-check` skill — without it, the skill has nothing to compare against. Off by default. Opt in by adding a `[visual_fidelity]` section to `~/.config/crew/projects/<name>.toml`:

```toml
[visual_fidelity]
figma_file_key    = "9FeJPriqdsdA4n9R5Xsrr8"
figma_pages       = ["Composites", "Dashboard Screens"]
component_dir     = "packages/dashboard/src/components"
dashboard_url     = "${APP_URL}"
snapshot_path     = ".crew/figma-snapshot"   # optional; default shown
code_connect_glob = "**/*.figma.tsx"         # optional; default shown
skip_snapshot     = false                    # optional; default shown
```

You also need a Figma personal access token with read scope, exported as `FIGMA_API_TOKEN`. Generate one at <https://www.figma.com/developers/api#access-tokens> and source it the same way as the Jira credentials (e.g. in `~/.secrets`).

`crew figma-snapshot` is the standalone command that exports the file. From inside a worktree:

```sh
export FIGMA_API_TOKEN=...
crew figma-snapshot
ls .crew/figma-snapshot/composites/ | head
```

Output layout:

```
<worktree>/.crew/figma-snapshot/
├── index.json                     # id → { name, type, page, screenshotPath, metadataPath }
├── composites/                    # nodes from the "Composites" page
│   ├── <node-id>.png              # 2× PNG render
│   └── <node-id>.json             # raw Figma node tree
└── screens/                       # nodes from the "Dashboard Screens" page
    ├── <node-id>.png
    └── <node-id>.json
```

Pages not in `figma_pages` are skipped. The page-name → directory mapping is a small whitelist (`Composites` → `composites/`, `Dashboard Screens` → `screens/`); any other configured page falls back to a kebab-cased slug.

When `[visual_fidelity]` is absent, `crew figma-snapshot` is a no-op with a friendly message rather than an error. `skip_snapshot = true` is the same no-op while preserving the rest of the config — useful for temporarily silencing the snapshot in a worktree without removing the block.

> Variable bindings (e.g. "this fill is bound to `tw/colors/slate/1050`") aren't fetchable via the Figma REST API, only the Plugin API. The skill side bridges hex values back to design tokens by reading the project's own token map (e.g. `packages/dashboard/src/data/state-meta.ts` for crew's dashboard). A near-term followup tracks moving to Plugin-API-based snapshotting for richer per-component metadata.

### GitHub token (once per project)

`crew run` injects a GitHub token into the agent so it can push branches and open PRs. Each registered project needs one at `<repo>/.claude/secrets/gh-token`:

```sh
mkdir -p .claude/secrets
gh auth token > .claude/secrets/gh-token
chmod 600 .claude/secrets/gh-token
```

The `.claude/secrets/` path is gitignored. Re-run after a token rotation.

## Project setup with `env.toml`

Projects can ship a declarative `env.toml` at their repo root that describes the env vars + generated files they need. Crew materializes per-worktree `.env` (and per-context override files) from the spec. The same spec can be consumed by a project-side bundled script for users who don't have crew installed (canonical-worktree path only).

Skip this section for projects without `env.toml` — they continue to use the legacy `crew docker-env` (fixed-shape `COMPOSE_PROJECT_NAME` + 3 ports) which `crew run` falls back to automatically.

### Schema

```toml
schema = 1   # gates compatibility; bump only with a corresponding crew change

# Per-worktree, mutated when crew spawns a worktree.
# Two `kind`s: "port" and "template".
[orchestration]
COMPOSE_PROJECT_NAME = { kind = "template", value = "${BASE_NAME}-${WORKTREE_ID}" }
CADDY_HTTP_PORT      = { kind = "port", default = 80 }
CADDY_HTTPS_PORT     = { kind = "port", default = 443 }
APP_URL              = { kind = "template", value = "https://localhost:${CADDY_HTTPS_PORT}" }

# Project-wide, set once per project.
# Two `source`s: "literal" and "generate".
[app]
DATABASE_URL       = { source = "literal",  value = "postgres://..." }
BETTER_AUTH_SECRET = { source = "generate", command = "openssl rand -base64 32" }

# Files materialized once per worktree (or per project, if path is shared).
[files.JWK_PRIVATE_KEY]
path      = "./secrets/jwk.pem"
generator = "openssl genpkey -algorithm RSA -out ${path}"
env_var   = "JWK_PRIVATE_KEY_PATH"   # optional: exposes ${path} as this env var

# Per-runtime-context overrides. Each emits a separate .env.<context> file.
[contexts.docker-backend]
DATABASE_URL = "postgres://...@postgres:5432/db"
```

`${BASE_NAME}` (project canonical name) and `${WORKTREE_ID}` (`main` for canonical, the worktree's directory suffix otherwise) are built-ins. References are resolved as a DAG; cycles error.

### Materialization rules

- **Orchestration**: ports use `default` for the canonical worktree, allocator-derived per-worktree values otherwise. Templates substitute previously-resolved values.
- **App**: literals substitute. `source = "generate"` runs `command` once and caches the value in `.env`; non-canonical worktrees copy from the canonical worktree's `.env` by default. Opt out with `share = false`.
- **Files**: `generator` runs only if `path` is missing on disk. `${path}` is substituted into the command. `env_var` (optional) exposes the path as that env var.
- **Contexts**: each `[contexts.<name>]` block emits a `.env.<name>` file containing only its overrides. Compose's `env_file:` list applies them on top of `.env` (later files win).

### App URL resolution in project TOML

`[playwright].app_url` and `[bruno_smoke].base_url` in your `~/.config/crew/projects/<name>.toml` resolve placeholders before crew passes the URL to the agent. Two syntaxes are supported:

- **`${VAR}`** — substitutes from the materialized `env.toml` base map. Use this for projects with an `env.toml`. Example:

  ```toml
  [playwright]
  app_url = "${APP_URL}"

  [bruno_smoke]
  base_url = "${APP_URL}"
  ```

  Any variable declared in the project's `env.toml` (orchestration, app, files-with-`env_var`, even built-ins like `${BASE_NAME}`) can be referenced.

- **`{httpPort}` / `{httpsPort}` / `{postgresPort}`** — legacy syntax for projects *without* `env.toml`. Substitutes from the fixed `writeDockerEnv` port shape. Don't use this for env.toml projects — crew can't populate the legacy ports map from a generic env.toml schema, and you'll get a clear error pointing you at the `${VAR}` form.

Both syntaxes can coexist in one template (e.g., `${BASE_URL}:{httpsPort}/api`), but in practice projects use one or the other. The `${VAR}` form is the modern way.

### Commands

- `crew env init` — materialize `.env` from `env.toml` in the current worktree (canonical or fresh).
- `crew env refresh` — re-materialize after editing `env.toml`. Preserves cached generated values.
- `crew env validate` — schema-check `env.toml` without writing anything. Exit non-zero on cycles or unknown schema.

### Maintaining the schema

Most env-spec work is done by agents. When extending the schema, **all** of the following must be updated together; treat the list as a verification checklist:

1. Bump `ENV_SPEC_SCHEMA_VERSION` in `packages/cli/src/lib/env-spec/types.ts`.
2. Update the Zod schema in the same file to accept new `kind`, `source`, or section types.
3. Update `packages/cli/src/lib/env-spec/resolve.ts` if new entry types affect dependency extraction.
4. Update `packages/cli/src/lib/env-spec/materialize.ts` to handle new resolution rules.
5. Update this README section (schema example + materialization rules).
6. **Update each project's bundled `scripts/setup.mjs`** so it accepts the new schema version. If the new operator is crew-only (e.g., a future `kind = "free-port"` requiring allocation), the script must reject the new schema version with a clear error rather than silently skip.
7. Bump `schema = N` in each project's `env.toml` once the new crew version is released and the project's bundled script has been updated.
8. Add tests in `env-spec/*.test.ts` covering the new behavior.
9. Update the inputs to `crew env validate` if any new validation rules apply.

The schema-version field is the contract; if any of the steps above are skipped, validation will surface the mismatch but the materializer may produce surprising output.

## Status

Pre-MVP. See [`docs/plans/architecture.md`](./docs/plans/architecture.md) for the design and phased rollout.

## Why it's its own project

`crew` is project-agnostic. The Recipes-App scripts encoded conventions for one repo (Jira project key, branch naming, docker layout). `crew` reads a per-project config so it can drive any Claude Code workflow on any repo.
