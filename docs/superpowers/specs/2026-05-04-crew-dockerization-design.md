# Crew dockerization — design

> **Purpose of this document.** A design for dockerizing crew's daemon + dashboard so the canonical local-dev experience becomes `docker compose up -d` (no more two-terminal dance), and per-worktree dispatched agents get isolated docker stacks (the same Recipes-style isolation crew already provisions for other projects, but now applied to crew itself). The CLI stays on the host; only the daemon and dashboard move into containers.
>
> Read [`docs/plans/architecture.md`](../../plans/architecture.md) for system context, and [`docs/superpowers/specs/2026-04-29-playwright-integration-design.md`](./2026-04-29-playwright-integration-design.md) for the `[playwright]` / `[bruno_smoke]` config schema this spec opts crew into.
>
> **Scope boundary.** This Epic delivers (1) docker compose foundation for both canonical and per-worktree stacks, (2) crew's self-opt-in to its own preflight + sandbox machinery (resolving the gating slot in `~/.claude/projects/.../memory/dashboard_ui_brainstorm.md`), (3) lightweight playwright/bruno test-infrastructure plumbing so future dashboard plans add live-stack tests cheaply. Postgres migration, generic post-bringup hooks, broad e2e backfill, and CI integration are explicitly deferred — see §8.

## 1. Background

### 1.1 The pain points

Two distinct local-testing problems are pushing this Epic:

1. **Two-terminal canonical setup.** Running crew's main-branch daemon + dashboard locally requires two terminals (`tsx watch` for the daemon, `vite` for the dashboard). Every machine reboot or branch switch pays this setup cost. There is no "just bring it up and leave it running" path.
2. **No worktree-isolated test stacks.** The other projects crew orchestrates (Recipes) get per-worktree docker bringup so e2e and bruno smoke run against an isolated stack. Crew itself doesn't — meaning as the daemon and dashboard codebases grow and accumulate live-stack tests, those tests have nowhere to run that isn't the canonical dev daemon (which is shared, stateful, and not test-isolated).

### 1.2 Why now

The dashboard is in active growth (CREW-47 Slice 1b: agents data end-to-end). As more daemon endpoints and dashboard surfaces land, more live-stack tests will follow. Building the docker foundation **before** that test growth means the tests slot in cleanly from day one rather than being retrofitted later. This Epic also resolves the gating slot we recorded in `~/.claude/projects/.../memory/dashboard_ui_brainstorm.md`: "the first dashboard plan that adds substantive e2e coverage MUST include the crew sandbox/preflight self-opt-in as its first ticket."

### 1.3 What's missing today

- No `Dockerfile` for daemon or dashboard.
- No `docker-compose.yml` at the repo root.
- No `<repo>/env.toml` (the materialization spec crew already understands for projects it orchestrates, but doesn't have for itself).
- No `<repo>/.claude/settings.json` (sandbox baseline + `excludedCommands` for smoke / e2e commands).
- Crew's project TOML at `~/.config/crew/projects/crew.toml` is minimal — only `[jira]` and `[github]`. None of `[docker]`, `[playwright]`, `[bruno_smoke]`, `[sandbox]` are configured, so crew dispatches itself with no preflight gating and no isolated test stack.
- Dashboard's `playwright.config.ts` hardcodes `PORT = 5173`, not env-driven — incompatible with worktree-stack hashed ports.

## 2. Scope

### 2.1 In scope

1. **Canonical docker stack.** `docker compose up -d` from the repo root brings up daemon (always running) + dashboard (under `--profile dev`, optional). Persistent SQLite via named volume. Plain HTTP, no TLS / Caddy.
2. **Per-worktree docker stack.** `crew run CREW-X` provisions a hash-allocated-port stack via the existing `lib/docker/start-bringup.ts` + `lib/env-spec/materialize.ts` machinery. Worktree always runs dev-profile (full hot-reload for both services). Anonymous-volume DB, seeded with mock fixtures.
3. **Crew TOML self-config.** `~/.config/crew/projects/crew.toml` gains `[docker]`, `[playwright]`, `[playwright.smoke]`, `[playwright.authored]`, `[bruno_smoke]`, `[sandbox]` blocks.
4. **`<repo>/env.toml`.** New file declaring `COMPOSE_PROJECT_NAME`, `CREW_PORT`, `CREW_VITE_PORT`, `APP_URL`, `DAEMON_URL`, `COMPOSE_PROFILES` for the materialization layer.
5. **`<repo>/.claude/settings.json`.** Sandbox baseline + `excludedCommands` for `npm run bruno:smoke` and `npm run test:e2e`. Resolves the preflight self-opt-in slot.
6. **Playwright harness env-awareness.** `packages/dashboard/playwright.config.ts` reads `PLAYWRIGHT_BASE_URL` / `CREW_APP_URL` so the same suite runs against canonical-dev or worktree-stack ports.
7. **Mock data seed.** `packages/daemon/seeds/dev.ts` (or equivalent) runs inside worktree daemon containers when `CREW_SEED_FIXTURES=1` is set.
8. **Documentation.** README "Local development" section, CLAUDE.md updates.
9. **Memory cleanup at Epic close.** Remove the stale "preflight self-opt-in slot" paragraph from the dashboard memory entry once the slot is filled.

### 2.2 Out of scope

- **Postgres migration.** SQLite + named volume is sufficient for current scale. Revisit only if the persistence model proves inadequate.
- **Generic post-bringup hook.** The hardcoded `scripts/db-clone-from-main.sh` lookup in `start-bringup.ts:51-79` is fine for crew — crew just won't ship that script. Generalizing the hook is captured as a separate followup.
- **Broad e2e backfill.** This Epic only updates the existing `dashboard.spec.ts` to be env-aware. New tests come in future plans (after CREW-54 lands the live HttpDaemonClient).
- **Bruno backfill.** Today's 3 endpoints are all covered. The `bruno-collection-maintenance` skill enforces forward-discipline for new endpoints; no backfill ticket needed.
- **CI integration.** Already a followup at `docs/followups.md` "2026-04-30 — CI integration of authored Playwright runs."
- **`crew doctor` / `crew init` cross-machine setup automation.** Already a followup.
- **TLS / Caddy.** Plain HTTP is sufficient. Avoids self-signed-cert friction.
- **Replacing the dashboard's mock data layer with a live HttpDaemonClient.** That's CREW-54 (Slice 1b), separate Epic. This Epic's e2e harness migration is harness-only — the existing tests continue to assert on whatever data the dashboard renders today.

### 2.3 Adjacent followups that this Epic resolves or interacts with

- **Resolves:** `docs/followups.md` "2026-05-04 — Crew sandbox/preflight self-opt-in (slot into first dashboard plan that adds e2e coverage)." This Epic is that plan.
- **Interacts (does not resolve):** `docs/followups.md` "2026-04-30 — Crew owns `.claude/settings.json` per worktree." That followup envisions a generator that derives `.claude/settings.json` from the TOML's `[sandbox]` block per-worktree. This Epic just authors a single committed `.claude/settings.json` for crew. The generator effort remains future work.
- **Interacts (does not resolve):** `docs/followups.md` "2026-05-04 — Generalize the hardcoded `db-clone-from-main.sh` post-bringup hook." Crew uses the existing hardcoded mechanism (by absence — no script).

## 3. Architecture

### 3.1 Two stacks, one compose file

`<repo>/docker-compose.yml` defines services that work in both modes:

- **Canonical.** Run from the repo root by the user (`docker compose up -d` for stable, `docker compose --profile dev up -d` for hot-reload). Fixed default ports. State persists in named volume `crew-state`. The user's perpetual local environment.
- **Per-worktree.** Brought up by `crew run CREW-X` via existing `lib/docker/start-bringup.ts`. The worktree's auto-generated `.env` (materialized from env.toml) sets hashed ports + `COMPOSE_PROFILES=dev` + `CREW_SEED_FIXTURES=1`. State lives in an anonymous volume, gone when stack tears down.

The same compose file handles both because all configurable values are env-var-driven with sensible defaults: `${CREW_PORT:-7773}:7773`, `${CREW_VITE_PORT:-5173}:5173`, etc.

### 3.2 Service shapes

**`daemon` service:**

- Built from `packages/daemon/Dockerfile`.
- Always runs (no profile gate).
- Command: `npm run dev --workspace=crew-daemon` (i.e., `tsx watch`). Source-mounted from worktree, hot-reloads on edits.
- Mounts: `./packages/daemon/src` and `./packages/shared/src` (source bind mounts), `crew-state` named volume → `/state` (canonical) or anonymous volume (worktree), `/app/node_modules` anonymous volume to shadow host's.
- Canonical-only mount: `~/.claude/projects/` read-only, so `IngestService` can tail real agent transcripts. Worktree stacks omit this mount.
- Env: `CREW_PORT=7773` (binds), `CREW_DB_FILE=/state/state.db`, `CREW_SEED_FIXTURES` (read by entrypoint).
- Port: `${CREW_PORT:-7773}:7773`.

**`dashboard` service:**

- Built from `packages/dashboard/Dockerfile`.
- `profiles: [dev]`. Activated when `COMPOSE_PROFILES=dev` is in the env file (worktree always sets this; canonical activates only with `--profile dev`).
- Command: `npm run dev --workspace=crew-dashboard` (i.e., `vite`). Source-mounted, HMR.
- Mounts: `./packages/dashboard/src`, `/app/node_modules` anonymous.
- Env: `CREW_DAEMON_URL=http://daemon:7773` (used by `vite.config.ts` proxy block).
- Port: `${CREW_VITE_PORT:-5173}:5173`.

### 3.3 Networking

- **Inside docker:** Vite container reaches daemon via docker DNS at `http://daemon:7773`. Vite's dev-server proxy forwards `/api/*` to that URL.
- **Browser → vite:** `http://localhost:${CREW_VITE_PORT}`. Vite serves SPA + proxies API calls.
- **Browser → daemon (no-profile mode):** `http://localhost:${CREW_PORT}`. Daemon serves SPA via existing `fastifyStatic` + handles API.
- **Host CLI → daemon:** `http://localhost:${CREW_PORT}`. Used by `crew` commands hitting daemon's HTTP API.
- **Host playwright → vite:** `http://localhost:${CREW_VITE_PORT}` (resolved from `${APP_URL}`). The e2e suite is the only consumer of vite from outside the docker network.
- **Host bruno → daemon:** `http://localhost:${CREW_PORT}` (resolved from `${DAEMON_URL}`). Hits daemon directly, doesn't go through vite proxy. Avoids the "vite needs to proxy `/health`" wart.

No reverse proxy. No TLS. No Caddy. The single-entry-point conceptual cleanliness Recipes gets from Caddy isn't worth the self-signed-cert friction here.

### 3.4 State persistence + agent-undisturbed-by-restart

Daemon doesn't own agent processes — the host CLI does. So daemon container restart never affects in-flight agents. State preservation requires only the named volume:

- Canonical: `crew-state:/state`. Survives `docker compose restart` and `docker compose down`. Wiped only by `docker compose down -v`.
- Worktree: anonymous volume, gone when stack tears down. Fresh per `crew run CREW-X`.
- IngestService reopens its tails on the same JSONL files (which haven't moved on the host) when the daemon restarts. No bespoke graceful-resume logic needed.

### 3.5 Port allocation

`<repo>/env.toml`'s `kind = "port"` entries drive allocation via the existing `lib/env-spec/allocate-port.ts`:

- `CREW_PORT` — default `7773`. Canonical worktree gets `7773`; non-canonical worktrees get hash-allocated.
- `CREW_VITE_PORT` — default `5173`. Same allocation pattern.

The legacy `[docker].http_port_base` / `https_port_base` / `postgres_port_base` fields in crew's project TOML are **not used** for crew (env.toml's allocator takes over for env.toml projects). The schema requires the `[docker]` block to exist, but its port-base fields can keep their defaults — they're inert for env.toml projects.

### 3.6 Compose project naming

Crew's `compose.ts:35-50` (`findComposeContainer`) greps `docker ps` for containers labeled with `com.docker.compose.project=<name>`. The project name docker compose uses is derived from `COMPOSE_PROJECT_NAME` if set, else from the lowercased basename of the cwd. env.toml's `COMPOSE_PROJECT_NAME = { kind = "template", value = "${BASE_NAME}-${WORKTREE_ID}" }` (mirroring Recipes' env.toml) ensures unique per-worktree names, and the materializer writes the resolved value into the worktree's `.env`. Vanilla `docker compose up` from the canonical worktree (no env.toml materialization) falls back to lowercased basename — same behavior as today.

Future-project compatibility: a project that explicitly overrides the compose project name (via `-p` flag, top-level `name:` field in compose, or a manually-set `COMPOSE_PROJECT_NAME`) would break crew's lookup. None of crew's machinery does this; it's a self-inflicted gotcha for downstream users only.

## 4. Component changes

### 4.1 New files

- `<repo>/Dockerfile` (or `packages/daemon/Dockerfile` — placement TBD during implementation; whichever fits npm-workspaces docker patterns better).
- `<repo>/Dockerfile.dashboard` (or `packages/dashboard/Dockerfile`, similarly).
- `<repo>/docker-compose.yml`.
- `<repo>/.dockerignore` — exclude `node_modules`, `.git`, `dist`, etc.
- `<repo>/env.toml`.
- `<repo>/.claude/settings.json`.
- `packages/daemon/seeds/dev.ts` (or `dev.sql`) — fixture seed for worktree DBs.

### 4.2 Modified files

- `~/.config/crew/projects/crew.toml` — gains `[docker]`, `[playwright]` (+ `.smoke`, `.authored`), `[bruno_smoke]`, `[sandbox]` blocks.
- `packages/dashboard/playwright.config.ts` — env-driven `baseURL`, `webServer` block kept with `reuseExistingServer: true`.
- `packages/dashboard/vite.config.ts` — `server.proxy['/api']` reads from `process.env.CREW_DAEMON_URL`.
- `packages/daemon/src/serve.ts` — entrypoint checks `CREW_SEED_FIXTURES=1` and runs the seed before `app.listen()`.
- `package.json` (root) — add `test:e2e` script delegating to dashboard workspace (so `excludedCommands: ["npm run test:e2e"]` works at root).
- `README.md` — new "Local development" section (canonical setup story + env.toml configuration explanation).
- `CLAUDE.md` (project) — update repo-layout and architecture sections to reflect docker-based dev. Note that crew now applies the per-worktree-docker-isolation rule to itself.

### 4.3 Concrete TOML / config content

`<repo>/env.toml`:

```toml
schema = 1

[orchestration]
COMPOSE_PROJECT_NAME = { kind = "template", value = "${BASE_NAME}-${WORKTREE_ID}" }
CREW_PORT            = { kind = "port", default = 7773 }
CREW_VITE_PORT       = { kind = "port", default = 5173 }
APP_URL              = { kind = "template", value = "http://localhost:${CREW_VITE_PORT}" }
DAEMON_URL           = { kind = "template", value = "http://localhost:${CREW_PORT}" }
COMPOSE_PROFILES     = { kind = "template", value = "dev" }
```

`~/.config/crew/projects/crew.toml`:

```toml
name = "crew"
repo_path = "/home/safturento/Repos/crew"
default_branch = "main"

[jira]
project_key = "CREW"
site = "https://safturento.atlassian.net"

[github]
repo = "Safturento/crew"

[docker]
canonical_worktree = "crew"

[playwright]
app_url = "${APP_URL}"

[playwright.smoke]
enabled = true

[playwright.authored]
enabled = true
tests_dir = "packages/dashboard/tests/e2e"
test_command = "npm run test:e2e"

[bruno_smoke]
enabled = true
base_url = "${DAEMON_URL}"
collection_dir = "bruno"

[sandbox]
allowed_domains = [
  "github.com", "api.github.com", "objects.githubusercontent.com", "codeload.github.com",
  "registry.npmjs.org", "registry.yarnpkg.com",
  "safturento.atlassian.net", "api.atlassian.com", "mcp.atlassian.com", "auth.atlassian.com",
  "api.anthropic.com", "statsig.anthropic.com", "claude.ai",
]
```

`<repo>/.claude/settings.json`:

```json
{
  "sandbox": {
    "enabled": true,
    "allowUnsandboxedCommands": false,
    "excludedCommands": [
      "npm run bruno:smoke",
      "npm run test:e2e"
    ],
    "filesystem": {
      "allowWrite": [
        "~/.npm",
        "~/.cache/node",
        "~/.cache/claude-cli",
        "~/.cache/claude",
        "/tmp"
      ]
    },
    "network": {
      "allowedDomains": [
        "github.com", "api.github.com", "objects.githubusercontent.com", "codeload.github.com",
        "registry.npmjs.org", "registry.yarnpkg.com",
        "safturento.atlassian.net", "api.atlassian.com", "mcp.atlassian.com", "auth.atlassian.com",
        "api.anthropic.com", "statsig.anthropic.com", "claude.ai"
      ]
    }
  }
}
```

`<repo>/docker-compose.yml` (sketch — final shape settled during implementation):

```yaml
services:
  daemon:
    build:
      context: .
      dockerfile: packages/daemon/Dockerfile
    command: ["npm", "run", "dev", "--workspace=crew-daemon"]
    volumes:
      - ./packages/daemon/src:/app/packages/daemon/src
      - ./packages/shared/src:/app/packages/shared/src
      - /app/node_modules
      - crew-state:/state
      - ${HOME}/.claude/projects:/root/.claude/projects:ro
    environment:
      - CREW_DB_FILE=/state/state.db
      - CREW_PORT=7773
      - CREW_SEED_FIXTURES=${CREW_SEED_FIXTURES:-0}
    ports:
      - "${CREW_PORT:-7773}:7773"

  dashboard:
    profiles: [dev]
    build:
      context: .
      dockerfile: packages/dashboard/Dockerfile
    command: ["npm", "run", "dev", "--workspace=crew-dashboard"]
    volumes:
      - ./packages/dashboard/src:/app/packages/dashboard/src
      - /app/node_modules
    environment:
      - CREW_DAEMON_URL=http://daemon:7773
    ports:
      - "${CREW_VITE_PORT:-5173}:5173"

volumes:
  crew-state:
```

Note on the `~/.claude/projects` mount: it's listed as canonical-only — worktree compose can override with an empty path or a tmpfs by setting an env var that the volume directive consumes. Final mechanic settled during implementation; the principle is "worktree daemons see no real-agent transcripts."

### 4.4 Dockerfile pattern for npm workspaces

Both Dockerfiles follow the npm-workspaces pattern that survives anonymous-volume `node_modules` shadowing:

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/<service>/package.json packages/<service>/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspaces --include-workspace-root
COPY packages/<service> ./packages/<service>
COPY packages/shared ./packages/shared
EXPOSE <port>
CMD ["npm", "run", "dev", "--workspace=<service>"]
```

The `npm ci --workspaces --include-workspace-root` step happens before source bind-mounts shadow the directories, so the anonymous-volume `/app/node_modules` preserves the install. Without this care, host `node_modules` (or its absence) clobbers the container's at runtime.

## 5. Test infrastructure

### 5.1 Playwright harness migration (lightweight)

The existing `packages/dashboard/tests/e2e/dashboard.spec.ts` (3 tests) asserts on the dashboard's mock-client data. It continues to pass unchanged with this Epic — only the harness changes.

`packages/dashboard/playwright.config.ts` updates:

```ts
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.CREW_APP_URL ??
  'http://localhost:5173';
```

(Drops the `PORT = 5173` constant.) The `webServer` block stays with `reuseExistingServer: true` — playwright happily reuses an externally-running vite, whether that's canonical-`--profile dev` at `:5173` or a worktree's hashed port. Falls back to spawning vite itself only when nothing's running (e.g., `npm run test:e2e` from a fresh checkout outside any docker context).

When CREW-54 (live HttpDaemonClient) lands in a future Epic, that work writes new tests against the live data path. This Epic's harness work is the foundation those tests build on.

### 5.2 Bruno coverage — forward-discipline only

Today's 3 endpoints (`/health`, `/api/agents`, `/api/projects`) all have bruno coverage. The `bruno-collection-maintenance` skill enforces "endpoint change ⇒ bruno change in same commit" for future work. **No bruno backfill ticket in this Epic.**

The `bruno_smoke.base_url = "${DAEMON_URL}"` change means existing bruno files' `baseUrl` env reference resolves per-worktree. Bruno's per-worktree env file (auto-generated by crew's bruno-smoke writer at `packages/cli/src/lib/bruno-smoke/`) already plumbs this — it'll just see a different concrete URL value per worktree, no bruno-side changes needed.

### 5.3 Worktree DB seed

`packages/daemon/seeds/dev.ts` defines deterministic fixtures: ~2 mock projects, ~4 mock agents in mixed states (`running` / `pr_open` / `finished` / `error`), ~6 mock runs with token totals, a few tool calls. Realistic enough for e2e to assert on.

The daemon's `serve.ts` entrypoint runs the seed when `CREW_SEED_FIXTURES=1` is set:

```ts
if (env.CREW_SEED_FIXTURES === '1') {
  const { seedFixtures } = await import('./seeds/dev.js');
  await seedFixtures(db);
}
```

Worktree compose env sets the var; canonical compose doesn't.

### 5.4 Preflight self-opt-in placement

`<repo>/.claude/settings.json` and the `~/.config/crew/projects/crew.toml` updates together resolve the dashboard memory's "first dashboard plan that adds e2e coverage MUST include the preflight self-opt-in as its first ticket" gating slot. They land **early in this Epic's ticket order**, after the docker compose foundation but before the playwright harness migration. That way:

- Once foundation merges + opt-in lands, every subsequent CREW-* dispatch on this Epic gets the new preflight checks (Check 2 verifies `excludedCommands`, Check 3 renders the sandbox-network-note prompt section).
- The harness migration ticket and any future test-growth ticket are exercised by the preflight from the moment they're worked on.

### 5.5 Memory cleanup at Epic close

Final Epic ticket includes: edit `~/.claude/projects/-home-safturento-Repos-crew/memory/dashboard_ui_brainstorm.md` to remove the "Important — preflight self-opt-in slot" paragraph (its gating condition is resolved). Easy to forget; explicit closing step prevents the memory from accumulating stale guidance.

## 6. Dev-loop and documentation

### 6.1 Day-to-day after this lands

Initial setup (once per machine):

```bash
cd ~/Repos/crew
docker compose --profile dev up -d --build    # canonical, dev mode (recommended while crew is in active development)
# Visit http://localhost:5173 (vite) or http://localhost:7773 (daemon API)
```

Switch to "stable" mode once the codebase has matured:

```bash
docker compose down
docker compose up -d --build                   # canonical, no profile — daemon serves dist/
# Visit http://localhost:7773 (daemon serves both SPA and API)
```

Common day-to-day:

```bash
docker compose restart                         # restart everything
docker compose restart daemon                  # just daemon
docker compose logs -f daemon                  # tail daemon logs
docker compose down                            # stop, keep volumes
docker compose down -v                         # stop, wipe state.db (rare)
```

### 6.2 Migration from current host-side daemon

One-time per dev machine: stop any host-side `tsx watch` daemon process before docker bringup. The named volume `crew-state` starts empty by default; if the user wants to preserve their existing `~/.config/crew/state.db`, the README will include a one-liner for copying it into the volume:

```bash
docker volume create crew-state
docker run --rm -v crew-state:/state -v ~/.config/crew:/host alpine cp /host/state.db /state/state.db
```

This is opt-in. Default is "fresh empty state" since most users won't have anything irreplaceable in their dev state.db.

### 6.3 `crew run CREW-X` flow (post-Epic)

Unchanged from the user's POV. Internally:

1. CLI parses ticket, creates worktree, materializes env.toml → writes worktree `.env` with hashed ports + `COMPOSE_PROFILES=dev` + `CREW_SEED_FIXTURES=1`.
2. `prepareAgentEnvironment` (`fresh` mode) kicks off `docker compose up --build --wait` in the worktree dir → background, awaited per CREW-83.
3. Daemon container starts: runs migrations, seeds fixtures, `app.listen(7773)` (inside container; published to host at hashed port).
4. Compose `--wait` blocks until daemon's healthcheck passes (`/health` returning 200).
5. Preflight (CREW-82 family) runs:
   - Check 1 probes resolved `${APP_URL}` (vite) and `${DAEMON_URL}` (daemon) — both up, both pass.
   - Check 2 verifies `<repo>/.claude/settings.json` lists both required `excludedCommands`. ✓
   - Check 3 renders the sandbox-network-note in the agent prompt with resolved URLs and `CREW-X` substituted.
6. Agent dispatched. Edits files, runs `npm run test:e2e` (un-sandboxed, hits worktree's vite port → playwright runs against seeded data via mock client). Runs `npm run bruno:smoke` (un-sandboxed, hits worktree's daemon port → bruno smoke flow against seeded data).
7. Agent finishes. `docker compose down` tears the worktree stack down. State gone, ports freed.

### 6.4 README updates

Add a "Local development" section near the top of `README.md`:

- **Quick start** — `docker compose --profile dev up -d --build`, then visit `http://localhost:5173`.
- **Configuration via env.toml** — explain that `<repo>/env.toml` declares `APP_URL`, `DAEMON_URL`, `COMPOSE_PROJECT_NAME`, `COMPOSE_PROFILES` and the port allocator entries. Show the file's structure. Call out that legacy `{httpPort}` syntax should NOT be used — env.toml projects use `${VAR}` exclusively.
- **Modes** — explain the dev profile vs no-profile choice and when to use each.
- **State management** — named volume, how to wipe, how to migrate existing state.db.
- **Per-worktree stacks** — brief mention that `crew run CREW-X` provisions an isolated stack per worktree, no setup required.

### 6.5 CLAUDE.md updates

- **Repo layout** — note that `<repo>/docker-compose.yml`, `<repo>/env.toml`, `<repo>/.claude/settings.json` exist and what each is.
- **Architecture rules** — add "the dashboard runs in docker (canonical or worktree); it doesn't run on the host." Adjust any rules that assumed local-process dev.
- **Per-worktree docker isolation** — note that this rule now applies to crew itself.

## 7. Risks and mitigations

- **`/app/node_modules` anonymous-volume gotchas.** Most common docker-on-monorepos failure. Dockerfiles must do `npm ci` BEFORE source bind-mounts, and the named anonymous-volume on `/app/node_modules` must not be omitted from any service's volume list. Test plan: bring up worktree stack from scratch and verify `node_modules/.bin/tsx` resolves inside the container.
- **State.db corruption on container restart mid-write.** SQLite is generally robust, but a SIGKILL during `INSERT` can leave a journal file. Mitigation: rely on better-sqlite3's WAL mode + checkpoint behavior (already in place); document `docker compose stop` (graceful) over `docker compose kill` (not graceful).
- **Daemon healthcheck timeout for first-run cold start.** First `compose up --build` includes image build time + `npm ci` + initial migration. Compose `--wait` defaults to 60s healthcheck timeout. Mitigation: set explicit healthcheck `start_period: 120s` for daemon service to absorb cold-start variance.
- **IngestService boot when `~/.claude/projects` is unmounted (worktree case).** If the path doesn't exist, IngestService should no-op cleanly rather than crash. Verify current behavior and add the no-op guard if missing.
- **Vite proxy URL mis-config.** If `CREW_DAEMON_URL` env var is missing in the dashboard container, vite proxy falls through and `/api/*` calls 502 from inside the SPA. Mitigation: vite.config.ts reads with a sensible default (`http://localhost:7773`) and logs a warning when env var is missing.

## 8. Open questions

None blocking; capturing for plan-time decisions:

- **Which repo location for Dockerfiles** — `<repo>/Dockerfile.daemon` and `<repo>/Dockerfile.dashboard` at the root, or `packages/daemon/Dockerfile` and `packages/dashboard/Dockerfile` per-package? Both work. Per-package is more discoverable; root-level matches Recipes' pattern. Decide during implementation.
- **Seed fixtures format** — `dev.ts` (programmatic, type-safe via Kysely) or `dev.sql` (declarative)? `.ts` lets us reuse model types and is friendlier for evolution; `.sql` is simpler but stale-prone. Lean: `.ts`. Decide during implementation.
- **Healthcheck endpoint location** — keep `/health` or move to `/api/health`? Today bruno hits `/health` directly; if vite proxy ever needs to forward it (unlikely given DAEMON_URL split), it's a one-line vite config change. Lean: keep `/health` to avoid touching daemon route layout.
- **Worktree stack teardown trigger** — does `crew finish CREW-X` torch the worktree stack, or does it linger until `crew restart` / `crew reset`? Today's behavior for projects with `agentNeedsAppRunning` is that the stack stays running. Keeping that for crew (so the user can manually inspect post-merge) is probably right. Confirm during implementation.

## 9. Implementation references

- `packages/cli/src/lib/docker/start-bringup.ts` — the bringup launcher this Epic targets.
- `packages/cli/src/lib/docker/env.ts` — auto-generates worktree `.env` files; reused.
- `packages/cli/src/lib/env-spec/materialize.ts` + `allocate-port.ts` — port allocation for env.toml projects.
- `packages/cli/src/lib/playwright/resolve-app-url.ts` — `${VAR}` substitution layer.
- `packages/daemon/src/serve.ts` — daemon entrypoint; gains the `CREW_SEED_FIXTURES` branch.
- `packages/dashboard/playwright.config.ts:1-30` — the env-driven `baseURL` change.
- `packages/dashboard/vite.config.ts` — proxy config update.
- `~/.config/crew/projects/recipes.toml` — reference shape for the new TOML blocks.
- `/home/safturento/Repos/Recipes/env.toml` — reference shape for the new env.toml.
- `/home/safturento/Repos/Recipes/docker-compose.yml` — reference shape for compose service layout.
- `docs/followups.md` — entries that interact with this Epic (§2.3).
- `~/.claude/projects/-home-safturento-Repos-crew/memory/dashboard_ui_brainstorm.md` — the gating-slot memory paragraph this Epic resolves.
