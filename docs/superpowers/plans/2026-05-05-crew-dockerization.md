# Crew dockerization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move crew's daemon + dashboard into docker compose so canonical local-dev becomes one-command (`docker compose up -d`) and per-worktree stacks isolate test state for `crew run CREW-*` dispatches.

**Architecture:** One `docker-compose.yml` at the repo root drives both modes. Canonical runs from the user's repo dir at fixed default ports (`7773` daemon, `5173` vite under `--profile dev`); per-worktree runs via `crew run`'s existing `lib/docker/start-bringup.ts` machinery with hash-allocated ports + `CREW_SEED_FIXTURES=1` for fresh test state. Both modes share an `env.toml` materialization layer (`${APP_URL}` / `${DAEMON_URL}` / port allocator entries — the new convention). The CLI stays on the host. SQLite + named volume for canonical persistence; SQLite + anonymous volume for worktree freshness.

**Tech Stack:** Docker compose v2, Node 22 (slim image), Fastify (daemon), Vite (dashboard), better-sqlite3 (state), Kysely (DB layer), npm workspaces, env.toml materialization (`lib/env-spec/`).

**Source spec:** [`docs/superpowers/specs/2026-05-04-crew-dockerization-design.md`](../specs/2026-05-04-crew-dockerization-design.md). Read it before starting.

---

**Ticket carve-up** (Epic + 6 child tickets):

| Ticket                                                                          | Tasks | Description                                                               | Blocks |
| ------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------- | ------ |
| **A — Foundation: daemon Dockerfile + env.toml + canonical compose**            | 1–4   | Brings daemon up at canonical port `7773`. Seeds env.toml.                | B      |
| **B — Dashboard Dockerfile + dev profile + vite proxy**                         | 5–7   | Brings vite up at `5173` under `--profile dev`. Proxies `/api` to daemon. | C      |
| **C — Crew TOML self-config + `.claude/settings.json` (preflight self-opt-in)** | 8–11  | Activates the preflight + sandbox baseline for `crew run CREW-*`.         | D, E   |
| **D — Worktree seed mechanism**                                                 | 12–14 | `CREW_SEED_FIXTURES` branch + `packages/daemon/seeds/dev.ts`.             | F      |
| **E — Playwright harness env-awareness**                                        | 15–16 | `playwright.config.ts` reads `CREW_APP_URL`.                              | F      |
| **F — Documentation + memory cleanup**                                          | 17–20 | README, CLAUDE.md, dashboard memory paragraph removal.                    | —      |

D and E run in parallel after C merges. F closes the Epic and depends on D + E.

**Naming conventions used throughout:**

- Container ports: `7773` (daemon), `5173` (vite). Host ports same on canonical, hash-allocated on worktree.
- Env vars: `CREW_PORT`, `CREW_VITE_PORT`, `CREW_DAEMON_URL`, `CREW_APP_URL`, `CREW_DB_FILE`, `CREW_SEED_FIXTURES`, `COMPOSE_PROFILES`.
- env.toml-exported templates: `APP_URL`, `DAEMON_URL`, `COMPOSE_PROJECT_NAME`.
- Volume names: `crew-state` (canonical persistent SQLite).

---

## Ticket A — Foundation: daemon Dockerfile + env.toml + canonical compose

### Task 1: Create `env.toml` and verify it parses

**Goal:** Define crew's per-worktree env spec so future steps can resolve `${APP_URL}` / `${DAEMON_URL}` from materialize output.

**Files:**

- Create: `<repo>/env.toml`

- [ ] **Step 1: Create the env.toml**

Create `<repo>/env.toml`:

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

- [ ] **Step 2: Verify it parses with crew's existing parser**

```bash
cd /home/safturento/Repos/crew
node --input-type=module -e "
  import { parseEnvSpec } from './packages/cli/src/lib/env-spec/parse.js';
  import { readFileSync } from 'node:fs';
  const spec = parseEnvSpec(readFileSync('env.toml', 'utf8'));
  console.log(JSON.stringify(Object.keys(spec.orchestration)));
"
```

Expected output: `["COMPOSE_PROJECT_NAME","CREW_PORT","CREW_VITE_PORT","APP_URL","DAEMON_URL","COMPOSE_PROFILES"]`

(If parser path differs at runtime, adapt the import — the test is "the file is valid env.toml schema=1.")

- [ ] **Step 3: Commit**

```bash
git add env.toml
git commit -m "feat(env): env.toml for crew dockerization"
```

---

### Task 2: Create the daemon Dockerfile

**Goal:** A buildable image for the daemon service that survives the anonymous-volume `node_modules` shadowing pattern. The container runs `tsx watch` for hot-reload during development.

**Files:**

- Create: `packages/daemon/Dockerfile`

- [ ] **Step 1: Create the Dockerfile**

Create `packages/daemon/Dockerfile`:

```dockerfile
FROM node:22-slim

# curl for the compose healthcheck command
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package manifests first so npm ci layer caches well
COPY package.json package-lock.json ./
COPY packages/daemon/package.json packages/daemon/
COPY packages/shared/package.json packages/shared/

# Install all workspace deps including devDeps (we need tsx for `npm run dev`)
RUN npm ci --workspaces --include-workspace-root

# Copy sources so the image is independently runnable. At runtime, compose
# bind-mounts these dirs from the host for hot-reload — anonymous volume
# on /app/node_modules preserves the install above.
COPY packages/shared ./packages/shared
COPY packages/daemon ./packages/daemon

EXPOSE 7773

CMD ["npm", "run", "dev", "--workspace=crew-daemon"]
```

- [ ] **Step 2: Build the image to verify**

```bash
cd /home/safturento/Repos/crew
docker build -f packages/daemon/Dockerfile -t crew-daemon:test .
```

Expected: clean build, ends with `Successfully tagged crew-daemon:test`. If build fails on `npm ci`, check that `packages/daemon/package.json` and `packages/shared/package.json` are sane (no `file:` refs to other workspaces — npm handles workspace resolution).

- [ ] **Step 3: Smoke-run the image standalone**

```bash
docker run --rm -p 7773:7773 -e CREW_PORT=7773 crew-daemon:test &
sleep 8
curl -fsS http://localhost:7773/health
```

Expected: `{"ok":true}`. If you see an error before sleep, the daemon hasn't bound yet — wait longer and retry. After verification:

```bash
docker stop $(docker ps -q --filter ancestor=crew-daemon:test)
```

- [ ] **Step 4: Commit**

```bash
git add packages/daemon/Dockerfile
git commit -m "feat(daemon): Dockerfile for daemon service"
```

---

### Task 3: Create `.dockerignore`

**Goal:** Keep `node_modules`, `.git`, build outputs, and dev artifacts out of the docker build context.

**Files:**

- Create: `<repo>/.dockerignore`

- [ ] **Step 1: Create the .dockerignore**

Create `<repo>/.dockerignore`:

```
# Version control
.git
.gitattributes

# Workspace node_modules — the Dockerfile runs npm ci itself
node_modules
packages/*/node_modules

# Build outputs
dist
packages/*/dist

# Editor / OS
.DS_Store
.vscode
.idea

# Test outputs
coverage
playwright-report
test-results

# Local-only
.env
.env.local
*.log

# Repo docs / specs not needed at runtime
docs/superpowers
```

- [ ] **Step 2: Verify the build context shrinks**

```bash
cd /home/safturento/Repos/crew
docker build -f packages/daemon/Dockerfile -t crew-daemon:test . 2>&1 | head -3
```

Expected first lines look like `transferring context: <small size>` (well under 100 MB; without .dockerignore it'd be ~500 MB+ from `node_modules`).

- [ ] **Step 3: Commit**

```bash
git add .dockerignore
git commit -m "chore(docker): .dockerignore"
```

---

### Task 4: Create `docker-compose.yml` (daemon-only canonical)

**Goal:** A compose file that brings up the daemon at port `7773` with persistent SQLite via named volume + healthcheck-gated readiness. Canonical-only at this stage; dashboard service comes in Ticket B.

**Files:**

- Create: `<repo>/docker-compose.yml`

- [ ] **Step 1: Create the compose file**

Create `<repo>/docker-compose.yml`:

```yaml
services:
  daemon:
    build:
      context: .
      dockerfile: packages/daemon/Dockerfile
    command: ['npm', 'run', 'dev', '--workspace=crew-daemon']
    volumes:
      # Source bind-mounts for hot-reload via tsx watch
      - ./packages/daemon/src:/app/packages/daemon/src
      - ./packages/shared/src:/app/packages/shared/src
      # Anonymous volume preserves npm ci output from being clobbered
      - /app/node_modules
      # Canonical persistent state
      - crew-state:/state
      # Read-only: real-agent transcript JSONLs for IngestService.
      # Worktree compose overrides this; canonical reads host transcripts.
      - ${HOME}/.claude/projects:/root/.claude/projects:ro
    environment:
      - CREW_DB_FILE=/state/state.db
      - CREW_PORT=7773
      - CREW_SEED_FIXTURES=${CREW_SEED_FIXTURES:-0}
    ports:
      - '${CREW_PORT:-7773}:7773'
    healthcheck:
      test: ['CMD', 'curl', '-fsS', 'http://localhost:7773/health']
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 90s

volumes:
  crew-state:
```

- [ ] **Step 2: Bring it up and verify**

```bash
cd /home/safturento/Repos/crew
docker compose up -d --build --wait
```

Expected: `--wait` returns when the daemon's healthcheck passes. If it times out, check `docker compose logs daemon` for the failure (most likely: workspace dep resolution, or migrations running on cold start taking longer than `start_period`).

- [ ] **Step 3: Verify the daemon responds and persists**

```bash
curl -fsS http://localhost:7773/health
curl -fsS http://localhost:7773/api/agents | head
docker compose restart daemon
sleep 12
curl -fsS http://localhost:7773/health
```

Expected: both initial calls return JSON; `restart` then `/health` returns again. State volume survives restart.

- [ ] **Step 4: Tear down cleanly**

```bash
docker compose down
docker volume rm crew_crew-state 2>/dev/null || true
```

(The `crew_` prefix is from the compose project name = lowercased basename.)

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(docker): canonical daemon compose service"
```

**Ticket A done.** Foundation is up. Daemon reachable at `localhost:7773`, env.toml parsed, dashboard service slots into Ticket B.

---

## Ticket B — Dashboard Dockerfile + dev profile + vite proxy

### Task 5: Create the dashboard Dockerfile

**Goal:** A buildable image for the dashboard service that runs `vite` (dev server) with hot-reload.

**Files:**

- Create: `packages/dashboard/Dockerfile`

- [ ] **Step 1: Create the Dockerfile**

Create `packages/dashboard/Dockerfile`:

```dockerfile
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/dashboard/package.json packages/dashboard/

RUN npm ci --workspaces --include-workspace-root

COPY packages/dashboard ./packages/dashboard

EXPOSE 5173

CMD ["npm", "run", "dev", "--workspace=crew-dashboard"]
```

(Dashboard doesn't import `crew-shared`, so we omit that dir to keep the image minimal. If a future change adds the import, add `COPY packages/shared/package.json packages/shared/` and `COPY packages/shared ./packages/shared` mirroring the daemon.)

- [ ] **Step 2: Build the image to verify**

```bash
cd /home/safturento/Repos/crew
docker build -f packages/dashboard/Dockerfile -t crew-dashboard:test .
```

Expected: clean build.

- [ ] **Step 3: Smoke-run the image standalone**

```bash
docker run --rm -p 5173:5173 crew-dashboard:test &
sleep 10
curl -fsS http://localhost:5173/ | head -c 200
```

Expected: HTML response containing `<div id="root">` or similar — vite is serving the SPA. After verification:

```bash
docker stop $(docker ps -q --filter ancestor=crew-dashboard:test)
```

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/Dockerfile
git commit -m "feat(dashboard): Dockerfile for vite dev server"
```

---

### Task 6: Update `vite.config.ts` to read `CREW_DAEMON_URL` for proxy

**Goal:** Vite's dev-server proxy forwards `/api/*` to the daemon container, with the URL configurable so worktree-stack vite can proxy to its own daemon container.

**Files:**

- Read first to see current shape: `packages/dashboard/vite.config.ts`
- Modify: `packages/dashboard/vite.config.ts`

- [ ] **Step 1: Read the current config**

```bash
cat /home/safturento/Repos/crew/packages/dashboard/vite.config.ts
```

Note the existing structure (likely `defineConfig({ plugins: [...], ... })`). The change adds a `server.proxy` block.

- [ ] **Step 2: Add the proxy block**

Edit `packages/dashboard/vite.config.ts` so the exported config includes a `server.proxy` section. Add to the `defineConfig` body (alongside any existing `plugins:` etc.):

```ts
server: {
  host: '0.0.0.0',
  port: 5173,
  proxy: {
    '/api': {
      target: process.env.CREW_DAEMON_URL ?? 'http://localhost:7773',
      changeOrigin: true,
    },
  },
},
```

`host: '0.0.0.0'` is required so vite is reachable from outside the container (default `127.0.0.1` only listens on the loopback inside the container).

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/vite.config.ts
git commit -m "feat(dashboard): env-driven /api proxy in vite config"
```

---

### Task 7: Add `dashboard` service to `docker-compose.yml`

**Goal:** Wire the dashboard into compose under `profiles: [dev]` so canonical no-profile mode skips it but `--profile dev` (and worktree's `COMPOSE_PROFILES=dev`) activate it.

**Files:**

- Modify: `<repo>/docker-compose.yml`

- [ ] **Step 1: Edit the compose file**

Add a `dashboard` service block after the `daemon` block (before `volumes:`):

```yaml
dashboard:
  profiles: [dev]
  build:
    context: .
    dockerfile: packages/dashboard/Dockerfile
  command: ['npm', 'run', 'dev', '--workspace=crew-dashboard']
  volumes:
    - ./packages/dashboard/src:/app/packages/dashboard/src
    - /app/node_modules
  environment:
    - CREW_DAEMON_URL=http://daemon:7773
  ports:
    - '${CREW_VITE_PORT:-5173}:5173'
  depends_on:
    daemon:
      condition: service_healthy
```

- [ ] **Step 2: Bring up canonical with the dev profile and verify both services**

```bash
cd /home/safturento/Repos/crew
docker compose --profile dev up -d --build --wait
```

Expected: `--wait` returns once daemon is healthy. Dashboard has no healthcheck so compose treats it as healthy when running.

```bash
curl -fsS http://localhost:7773/health        # daemon direct
curl -fsS http://localhost:5173/ | head -c 200 # vite serving SPA
curl -fsS http://localhost:5173/api/agents     # vite proxy → daemon
```

All three should return successfully (the third returns the same JSON as the daemon-direct `/api/agents` call — proves the proxy works).

- [ ] **Step 3: Verify no-profile mode still works (daemon-only)**

```bash
docker compose down
docker compose up -d --build --wait
docker compose ps --services
```

Expected: only `daemon` is listed (dashboard skipped because no profile). `curl http://localhost:7773/health` still returns. `curl http://localhost:5173/` should fail (nothing on 5173).

- [ ] **Step 4: Tear down**

```bash
docker compose down
```

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(docker): dashboard service under dev profile"
```

**Ticket B done.** Canonical stack is fully functional. Dev profile gives hot-reload; no-profile gives daemon-only. Dashboard's vite proxies `/api` to daemon over docker network.

---

## Ticket C — Crew TOML self-config + `.claude/settings.json` (preflight self-opt-in slot)

### Task 8: Update `~/.config/crew/projects/crew.toml`

**Goal:** Opt crew into its own project-config blocks so `crew run CREW-*` dispatches gain `[playwright]` / `[bruno_smoke]` machinery + the new preflight checks fire.

**Files:**

- Modify: `~/.config/crew/projects/crew.toml`

- [ ] **Step 1: Read current TOML**

```bash
cat ~/.config/crew/projects/crew.toml
```

You should see only `[jira]` and `[github]` blocks plus the top-level keys. We add the new blocks and a `canonical_worktree`.

- [ ] **Step 2: Replace the file with the updated content**

Write `~/.config/crew/projects/crew.toml`:

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
  "github.com",
  "api.github.com",
  "objects.githubusercontent.com",
  "codeload.github.com",
  "registry.npmjs.org",
  "registry.yarnpkg.com",
  "safturento.atlassian.net",
  "api.atlassian.com",
  "mcp.atlassian.com",
  "auth.atlassian.com",
  "api.anthropic.com",
  "statsig.anthropic.com",
  "claude.ai",
]
```

- [ ] **Step 3: Verify the TOML parses through crew's loader**

```bash
cd /home/safturento/Repos/crew
node --input-type=module -e "
  import { loadProjectConfig } from './packages/shared/src/config/loader.js';
  const cfg = loadProjectConfig('crew');
  console.log('docker:', !!cfg.docker, 'playwright:', !!cfg.playwright, 'bruno_smoke:', !!cfg.bruno_smoke);
"
```

Expected: `docker: true playwright: true bruno_smoke: true`. If the loader path differs at runtime, adapt to whatever crew's CLI uses internally.

(No commit yet — this file lives outside the repo and isn't tracked.)

---

### Task 9: Create `<repo>/.claude/settings.json`

**Goal:** Sandbox baseline for crew's own dispatched agents + the `excludedCommands` entries the preflight Check 2 verifies.

**Files:**

- Create: `<repo>/.claude/settings.json`

- [ ] **Step 1: Create the file**

Create `<repo>/.claude/settings.json`:

```json
{
  "sandbox": {
    "enabled": true,
    "allowUnsandboxedCommands": false,
    "excludedCommands": ["npm run bruno:smoke", "npm run test:e2e"],
    "filesystem": {
      "allowWrite": ["~/.npm", "~/.cache/node", "~/.cache/claude-cli", "~/.cache/claude", "/tmp"]
    },
    "network": {
      "allowedDomains": [
        "github.com",
        "api.github.com",
        "objects.githubusercontent.com",
        "codeload.github.com",
        "registry.npmjs.org",
        "registry.yarnpkg.com",
        "safturento.atlassian.net",
        "api.atlassian.com",
        "mcp.atlassian.com",
        "auth.atlassian.com",
        "api.anthropic.com",
        "statsig.anthropic.com",
        "claude.ai"
      ]
    }
  }
}
```

- [ ] **Step 2: Verify it's syntactically valid JSON**

```bash
node --input-type=module -e "
  import { readFileSync } from 'node:fs';
  const cfg = JSON.parse(readFileSync('.claude/settings.json', 'utf8'));
  console.log('excludedCommands:', cfg.sandbox.excludedCommands);
"
```

Expected: `excludedCommands: [ 'npm run bruno:smoke', 'npm run test:e2e' ]`.

- [ ] **Step 3: Commit**

```bash
git add .claude/settings.json
git commit -m "feat(sandbox): .claude/settings.json with excludedCommands + baseline allowed domains"
```

---

### Task 10: Add root `test:e2e` script

**Goal:** Make `npm run test:e2e` work from the repo root (not just inside `packages/dashboard/`). Required so the `excludedCommands` literal in the settings.json above matches what the agent will actually invoke.

**Files:**

- Modify: `<repo>/package.json` (root)

- [ ] **Step 1: Inspect the current scripts**

```bash
node --input-type=module -e "
  import { readFileSync } from 'node:fs';
  console.log(JSON.parse(readFileSync('package.json', 'utf8')).scripts);
"
```

Note the existing `scripts` object shape.

- [ ] **Step 2: Add the test:e2e script**

Edit `<repo>/package.json`'s `scripts` object to include:

```json
"test:e2e": "npm run test:e2e --workspace=crew-dashboard"
```

Place it next to existing `test:run`. Don't remove or reorder existing entries.

- [ ] **Step 3: Verify it delegates correctly**

```bash
cd /home/safturento/Repos/crew
npm run test:e2e -- --list
```

Expected: playwright lists available tests in `packages/dashboard/tests/e2e/`. (`--list` is non-destructive — it just enumerates tests without running them.)

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat(scripts): root test:e2e delegates to crew-dashboard"
```

---

### Task 11: Smoke-test the preflight self-opt-in end-to-end

**Goal:** Verify `crew run CREW-X` (or any crew dispatch command) now triggers the preflight on crew's own project, with the new TOML + settings.json in place.

This is a manual gate task — no code changes. Confirms the slot is filled.

- [ ] **Step 1: Bring up canonical (so the preflight has something to probe)**

```bash
cd /home/safturento/Repos/crew
docker compose --profile dev up -d --build --wait
```

- [ ] **Step 2: Dispatch a no-op preflight check**

The simplest way is to run a `crew run` against a placeholder ticket and observe that the preflight runs successfully. You don't actually need the agent to do work — the preflight runs before the agent spawns. Pick any unused KAN-XXX or CREW-XXX placeholder, OR look in the code for whether crew has a `crew preflight <key>` subcommand for this purpose. If not, the smoke is:

```bash
# Pick any unused ticket key for the smoke (don't actually push agent work)
# Then ctrl-c after the preflight output appears and before agent dispatch.
crew run CREW-99 2>&1 | head -50
```

Expected output: includes lines like

```
✓ preflight: app URL reachable
✓ preflight: .claude/settings.json excludedCommands verified
```

(Exact output depends on CREW-82 family preflight rendering.)

If you see `✗ preflight: ...` errors, debug:

- `app URL unreachable` → likely the canonical stack didn't fully come up. Check `docker compose logs daemon` for issues.
- `excludedCommands missing` → re-check the `.claude/settings.json` file content against the spec.

- [ ] **Step 3: Tear down preflight smoke**

```bash
# If crew run is still hanging, ctrl-c
docker compose down
```

- [ ] **Step 4: Document the smoke result**

No code commit. Add a one-liner to your PR description: "Manual preflight smoke verified on YYYY-MM-DD: Check 1/2/3 all pass for crew → CREW-99 dispatch."

**Ticket C done.** Crew is now opted into its own preflight machinery. Future CREW-\* dispatches gate on `excludedCommands` + URL reachability + render the sandbox-network-note in agent prompts.

---

## Ticket D — Worktree seed mechanism

### Task 12: Write the seed function with a failing test

**Goal:** A deterministic fixture seeder that populates an empty `crew-state` SQLite with realistic test data (projects, agents in mixed states, runs, tool calls). TDD-discipline: test asserts post-seed counts before implementation.

**Files:**

- Create: `packages/daemon/seeds/dev.ts`
- Create: `packages/daemon/seeds/dev.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/daemon/seeds/dev.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, runMigrations } from '../src/db.js';
import { seedFixtures } from './dev.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_PATH = join(__dirname, '..', 'src', 'migrations');

describe('seedFixtures', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'crew-seed-test-'));
    dbPath = join(dir, 'state.db');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('seeds projects, agents, runs, and tool_calls into an empty migrated DB', async () => {
    const db = createDb(dbPath);
    await runMigrations(db, MIGRATIONS_PATH);

    await seedFixtures(db);

    const agents = await db.selectFrom('agents').selectAll().execute();
    const runs = await db.selectFrom('runs').selectAll().execute();
    const toolCalls = await db.selectFrom('tool_calls').selectAll().execute();

    expect(agents.length).toBeGreaterThanOrEqual(4);
    expect(runs.length).toBeGreaterThanOrEqual(4);
    expect(toolCalls.length).toBeGreaterThanOrEqual(4);

    const states = new Set(agents.map((a) => (a.pr_url ? 'pr_open' : 'other')));
    expect(states.has('pr_open')).toBe(true);

    db.destroy();
  });

  it('is idempotent — running twice does not duplicate rows', async () => {
    const db = createDb(dbPath);
    await runMigrations(db, MIGRATIONS_PATH);

    await seedFixtures(db);
    const firstCount = (await db.selectFrom('agents').selectAll().execute()).length;
    await seedFixtures(db);
    const secondCount = (await db.selectFrom('agents').selectAll().execute()).length;

    expect(secondCount).toBe(firstCount);
    db.destroy();
  });
});
```

(If `afterEach` import is missing, add it: `import { ... afterEach } from 'vitest'`.)

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /home/safturento/Repos/crew
npm run test:run --workspace=crew-daemon -- seeds/dev
```

Expected: FAIL — `seedFixtures` not found / module not exported.

- [ ] **Step 3: Implement `seedFixtures`**

Create `packages/daemon/seeds/dev.ts`:

```ts
import type { DB } from '../src/db.js';

const FIXTURE_AGENTS = [
  {
    key: 'CREW-101',
    project_name: 'crew',
    ticket_title: 'Add agent state-history endpoint',
    worktree_path: '/home/dev/Repos/crew-CREW-101',
    branch: 'CREW-101',
    pr_url: null,
  },
  {
    key: 'CREW-102',
    project_name: 'crew',
    ticket_title: 'Refactor IngestService chokidar wiring',
    worktree_path: '/home/dev/Repos/crew-CREW-102',
    branch: 'CREW-102',
    pr_url: 'https://github.com/Safturento/crew/pull/1234',
  },
  {
    key: 'KAN-201',
    project_name: 'recipes',
    ticket_title: 'Profile macro meters',
    worktree_path: '/home/dev/Repos/Recipes-KAN-201',
    branch: 'KAN-201',
    pr_url: null,
  },
  {
    key: 'KAN-202',
    project_name: 'recipes',
    ticket_title: 'Recipe-list filter persistence',
    worktree_path: '/home/dev/Repos/Recipes-KAN-202',
    branch: 'KAN-202',
    pr_url: 'https://github.com/Safturento/Recipes/pull/55',
  },
];

const FIXTURE_RUNS = [
  {
    agent_key: 'CREW-101',
    command: 'run' as const,
    session_id: 'sess-c101-a',
    started_at: '2026-05-04T10:00:00Z',
    completed_at: null,
    exit_code: null,
  },
  {
    agent_key: 'CREW-102',
    command: 'run' as const,
    session_id: 'sess-c102-a',
    started_at: '2026-05-04T11:30:00Z',
    completed_at: '2026-05-04T11:55:00Z',
    exit_code: 0,
  },
  {
    agent_key: 'KAN-201',
    command: 'run' as const,
    session_id: 'sess-k201-a',
    started_at: '2026-05-05T08:15:00Z',
    completed_at: null,
    exit_code: null,
  },
  {
    agent_key: 'KAN-202',
    command: 'fix-pr' as const,
    session_id: 'sess-k202-fpr',
    started_at: '2026-05-05T09:00:00Z',
    completed_at: '2026-05-05T09:18:00Z',
    exit_code: 0,
  },
];

const FIXTURE_TOOL_CALLS = [
  {
    tool_name: 'Bash',
    input_summary: 'npm run test:run',
    output_tokens: 320,
    input_tokens: 12,
    cache_read_tokens: 0,
  },
  {
    tool_name: 'Read',
    input_summary: 'packages/daemon/src/serve.ts',
    output_tokens: 1840,
    input_tokens: 45,
    cache_read_tokens: 0,
  },
  {
    tool_name: 'Edit',
    input_summary: 'packages/daemon/src/routes/agents.ts',
    output_tokens: 280,
    input_tokens: 220,
    cache_read_tokens: 1500,
  },
  {
    tool_name: 'Bash',
    input_summary: 'npm run test:e2e',
    output_tokens: 510,
    input_tokens: 18,
    cache_read_tokens: 800,
  },
];

/**
 * Seed deterministic fixture data into a migrated empty DB. Idempotent —
 * running twice doesn't duplicate. Used by worktree daemon containers
 * when `CREW_SEED_FIXTURES=1` is set in their env.
 */
export async function seedFixtures(db: DB): Promise<void> {
  const existing = await db.selectFrom('agents').selectAll().execute();
  if (existing.length > 0) return;

  const now = new Date().toISOString();
  await db
    .insertInto('agents')
    .values(FIXTURE_AGENTS.map((a) => ({ ...a, created_at: now })))
    .execute();

  const insertedRuns = await db.insertInto('runs').values(FIXTURE_RUNS).returning('id').execute();

  // Distribute tool calls across the inserted runs round-robin.
  const toolCallRows = FIXTURE_TOOL_CALLS.map((tc, i) => ({
    ...tc,
    run_id: insertedRuns[i % insertedRuns.length].id,
  }));

  await db.insertInto('tool_calls').values(toolCallRows).execute();
}
```

The exported `DB` type comes from `packages/daemon/src/db.ts`. If it's not currently exported, add `export type DB = Kysely<Database>;` (or the equivalent concrete type) to `db.ts`. If the schema column shapes drift from what's shown, adapt — `agents` / `runs` / `tool_calls` table interfaces are in `db.ts` and ought to drive the typing.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run --workspace=crew-daemon -- seeds/dev
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/seeds/dev.ts packages/daemon/seeds/dev.test.ts
# If db.ts gained an export, include it:
git add packages/daemon/src/db.ts
git commit -m "feat(daemon): seedFixtures for worktree dev DBs"
```

---

### Task 13: Wire the seed into `serve.ts` startup

**Goal:** The daemon container's `serve()` checks `CREW_SEED_FIXTURES=1` after migrations and runs the seed before binding the port.

**Files:**

- Modify: `packages/daemon/src/serve.ts`
- Modify: `packages/daemon/src/serve.test.ts` (or wherever serve is tested — or create a new test file if absent)

- [ ] **Step 1: Inspect the current serve.ts post-migration block**

```bash
cat /home/safturento/Repos/crew/packages/daemon/src/serve.ts
```

You'll see `await runMigrations(db, MIGRATIONS_PATH);` followed by `buildApp(...)` then `app.listen(...)`. The seed branch slots between migrations and `buildApp`.

- [ ] **Step 2: Write a failing test**

Append to `packages/daemon/src/serve.test.ts` (create if absent — adapt imports to whatever `db.ts` actually exports):

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb } from './db.js';
import { serve } from './serve.js';

describe('serve — fixture seeding', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  function mkTmpDb(): string {
    const dir = mkdtempSync(join(tmpdir(), 'crew-serve-test-'));
    dirs.push(dir);
    return join(dir, 'state.db');
  }

  it('seeds fixtures when CREW_SEED_FIXTURES=1', async () => {
    const dbPath = mkTmpDb();
    const env = { ...process.env, CREW_PORT: '0', CREW_DB_FILE: dbPath, CREW_SEED_FIXTURES: '1' };
    const { app, config } = await serve(env);
    try {
      const db = createDb(config.dbFile);
      const agents = await db.selectFrom('agents').selectAll().execute();
      expect(agents.length).toBeGreaterThan(0);
      db.destroy();
    } finally {
      await app.close();
    }
  });

  it('does not seed when CREW_SEED_FIXTURES is unset', async () => {
    const dbPath = mkTmpDb();
    const env = { ...process.env, CREW_PORT: '0', CREW_DB_FILE: dbPath };
    delete env.CREW_SEED_FIXTURES;
    const { app, config } = await serve(env);
    try {
      const db = createDb(config.dbFile);
      const agents = await db.selectFrom('agents').selectAll().execute();
      expect(agents.length).toBe(0);
      db.destroy();
    } finally {
      await app.close();
    }
  });
});
```

Notes: `CREW_PORT: '0'` tells fastify to bind any available port — avoids port collisions across parallel test runs. If `serve.test.ts` already exists with a different fixture pattern (e.g., its own `mkTmpDb` helper), reuse that helper instead of redeclaring.

- [ ] **Step 3: Run test to verify it fails**

```bash
npm run test:run --workspace=crew-daemon -- serve
```

Expected: FAIL — seed isn't called.

- [ ] **Step 4: Add the seed branch to `serve.ts`**

In `packages/daemon/src/serve.ts`, between the migration line and the `buildApp` line, insert:

```ts
if (env.CREW_SEED_FIXTURES === '1') {
  const { seedFixtures } = await import('../seeds/dev.js');
  logger.info('CREW_SEED_FIXTURES=1 — loading fixtures');
  await seedFixtures(db);
}
```

The dynamic `import('../seeds/dev.js')` keeps the seed code out of production hot paths — only loaded when explicitly enabled. The `logger` was created above; the `db` is the migrated SQLite handle.

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm run test:run --workspace=crew-daemon -- serve
npm run test:run --workspace=crew-daemon
```

Expected: PASS — both new tests + existing serve tests still pass.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/serve.ts packages/daemon/src/serve.test.ts
git commit -m "feat(daemon): seed fixtures when CREW_SEED_FIXTURES=1"
```

---

### Task 14: Verify worktree stack actually seeds

**Goal:** End-to-end confirmation that `CREW_SEED_FIXTURES=1` in a worktree's `.env` results in the worktree daemon coming up with fixture data.

This is a manual gate task.

- [ ] **Step 1: Rebuild the daemon image with the seed code**

```bash
cd /home/safturento/Repos/crew
docker build -f packages/daemon/Dockerfile -t crew-daemon:test .
```

- [ ] **Step 2: Run the daemon with the seed env var**

```bash
docker run -d --rm --name crew-daemon-seed-test \
  -p 7773:7773 \
  -e CREW_PORT=7773 \
  -e CREW_DB_FILE=/state/state.db \
  -e CREW_SEED_FIXTURES=1 \
  crew-daemon:test
sleep 12
curl -fsS http://localhost:7773/api/agents
```

Expected: `agents` array contains at least 4 entries (CREW-101, CREW-102, KAN-201, KAN-202). After verification:

```bash
docker stop crew-daemon-seed-test
```

(No host volume mount — the in-container `/state/` is ephemeral, gone when the container stops. That's the worktree-stack behavior we want to validate here.)

- [ ] **Step 3: Document the smoke**

Add to PR description: "Worktree seed verified on YYYY-MM-DD: `CREW_SEED_FIXTURES=1` produces 4 fixture agents."

**Ticket D done.** Worktree daemons now boot with seeded data when crew dispatches dispatch them.

---

## Ticket E — Playwright harness env-awareness

### Task 15: Update `playwright.config.ts` for env-driven baseURL

**Goal:** The dashboard's e2e harness reads `PLAYWRIGHT_BASE_URL` / `CREW_APP_URL` so the same suite runs against canonical-dev (`http://localhost:5173`) AND worktree stacks (hashed port via `${APP_URL}` resolution).

**Files:**

- Modify: `packages/dashboard/playwright.config.ts`

- [ ] **Step 1: Read the current config**

```bash
cat /home/safturento/Repos/crew/packages/dashboard/playwright.config.ts
```

You'll see the hardcoded `const PORT = 5173; const baseURL = ...` lines.

- [ ] **Step 2: Replace baseURL resolution**

Replace the top-of-file constants with:

```ts
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? process.env.CREW_APP_URL ?? 'http://localhost:5173';
```

Drop the `PORT` constant entirely. The rest of the file stays the same — `use.baseURL: baseURL`, `webServer.url: baseURL`, etc.

The `webServer` block also stays. With `reuseExistingServer: true` (the existing default for non-CI), playwright reuses any vite already on `baseURL` rather than spawning a new one. So:

- Canonical `--profile dev` running → vite on host `:5173`, playwright reuses, tests run.
- Worktree stack with `CREW_APP_URL=http://localhost:7801` → playwright finds vite on `:7801`, reuses, tests run.
- Nothing running → playwright spawns its own vite via `command: 'npm run dev'` on `baseURL`.

- [ ] **Step 3: Run the existing tests against canonical to verify**

```bash
cd /home/safturento/Repos/crew
docker compose --profile dev up -d --build --wait
npm run test:e2e
```

Expected: 3 tests pass against the dockerized canonical vite at `http://localhost:5173`. (`CREW_APP_URL` unset → falls through to default → matches canonical port.)

- [ ] **Step 4: Run with explicit env-override to verify the env-driven path works**

```bash
CREW_APP_URL=http://localhost:5173 npm run test:e2e
```

Expected: same 3 tests pass — confirms env override path is exercised. (For the worktree-port case to be testable here, you'd need a worktree stack running, which is `crew run`'s job; the env-var path itself is what this task validates.)

- [ ] **Step 5: Tear down**

```bash
docker compose down
```

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/playwright.config.ts
git commit -m "feat(playwright): env-driven baseURL for canonical + worktree stacks"
```

---

### Task 16: Verify worktree e2e dispatch (manual gate)

**Goal:** End-to-end confirmation that `crew run CREW-X` for crew itself dispatches an agent that can run `npm run test:e2e` against the worktree stack and pass.

- [ ] **Step 1: Pick a placeholder ticket key**

Choose any unused CREW-XXX number (or use a real one if you're ready to dispatch real work). The smoke is to confirm preflight passes + the e2e harness reaches the worktree's vite.

- [ ] **Step 2: Dispatch and observe**

```bash
crew run CREW-99
```

Watch the output. Expected sequence:

1. Worktree creation, env.toml materialization, `.env` written with hashed `CREW_PORT`, `CREW_VITE_PORT`, `COMPOSE_PROFILES=dev`, `CREW_SEED_FIXTURES=1`.
2. `docker compose up --build --wait` brings up daemon + dashboard at hashed ports.
3. Preflight Check 1 probes `${APP_URL}` (vite, hashed) and `${DAEMON_URL}` (daemon, hashed) — both pass.
4. Preflight Check 2 verifies `excludedCommands` — passes.
5. Agent dispatched. (Ctrl-c here to skip actual agent work.)

- [ ] **Step 3: With the worktree stack still up, manually invoke the e2e suite**

While the worktree stack from step 2 is still running (find it with `docker compose ls`), run:

```bash
cd <worktree-path>
CREW_APP_URL=$(grep '^APP_URL=' .env | cut -d= -f2-) npm run test:e2e
```

Expected: 3 tests pass against the worktree's vite port. This proves the harness env-awareness from Task 15 actually works in worktree context.

- [ ] **Step 4: Clean up**

```bash
crew restart CREW-99 --hard
```

(Or whatever crew's worktree-teardown command is.)

- [ ] **Step 5: Document**

Add to PR description: "Worktree e2e dispatch verified on YYYY-MM-DD: 3 dashboard.spec.ts tests pass against hash-allocated stack."

**Ticket E done.** Playwright harness works against both canonical and worktree contexts. Future dashboard plans can add tests confidently.

---

## Ticket F — Documentation + memory cleanup

### Task 17: Add "Local development" section to README

**Goal:** Document the new docker-based dev story so a fresh developer (or returning user) knows how to bring crew up locally without two terminals.

**Files:**

- Read first: `<repo>/README.md`
- Modify: `<repo>/README.md`

- [ ] **Step 1: Read current README**

```bash
head -80 /home/safturento/Repos/crew/README.md
```

Note where the existing structure leaves room for a "Local development" section. Probably immediately after the project description / before any architecture deep-dive.

- [ ] **Step 2: Add the "Local development" section**

Insert in `README.md` (placement near top, after the project intro):

````markdown
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

| Command                                      | Mode                   | When to use                                                        |
| -------------------------------------------- | ---------------------- | ------------------------------------------------------------------ |
| `docker compose --profile dev up -d --build` | Dev (vite + tsx watch) | Active development on crew. Hot-reload across daemon + dashboard.  |
| `docker compose up -d --build`               | Stable (daemon only)   | Once crew has matured. Daemon serves the pre-built SPA at `:7773`. |

### Configuration via env.toml

Crew uses [`<repo>/env.toml`](./env.toml) to declare environment variables that get materialized per-worktree by the `crew run` machinery. The file uses `${VAR}` syntax exclusively — legacy `{httpPort}` placeholders are NOT used.

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
````

- [ ] **Step 3: Verify the markdown renders cleanly**

```bash
# If you have a markdown previewer, use it. Otherwise:
head -150 /home/safturento/Repos/crew/README.md
```

Visually scan for unclosed code fences, orphaned headings, or formatting issues.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): local development section with env.toml configuration"
```

---

### Task 18: Update `CLAUDE.md` (project) for docker-based dev

**Goal:** Ensure the project's CLAUDE.md reflects the new local-dev story so agents working on crew know where docker-compose / env.toml fit.

**Files:**

- Read first: `<repo>/CLAUDE.md`
- Modify: `<repo>/CLAUDE.md`

- [ ] **Step 1: Read current CLAUDE.md**

```bash
cat /home/safturento/Repos/crew/CLAUDE.md
```

Note the existing sections (Repo layout, Architecture rules, Per-worktree docker isolation, Bruno collection).

- [ ] **Step 2: Update the "Repo layout" section**

In CLAUDE.md, find the tree diagram of the repo layout and add at the appropriate spot:

```
crew/
├── docker-compose.yml      # daemon + dashboard services (canonical + per-worktree)
├── env.toml                # per-worktree env materialization (APP_URL, DAEMON_URL, ports)
├── .claude/settings.json   # sandbox baseline + excludedCommands for crew dispatches
├── packages/
│   ├── daemon/             # ... (existing)
│   │   ├── Dockerfile      # crew-daemon image
│   │   └── seeds/dev.ts    # fixture seed for worktree DBs
│   ├── dashboard/          # ... (existing)
│   │   └── Dockerfile      # crew-dashboard image (vite dev server)
...
```

(Adjust formatting to match the existing tree style in the file.)

- [ ] **Step 3: Add a "Local development" subsection**

Add a new top-level subsection (placement: after "Repo layout", before "Architecture rules"):

```markdown
## Local development

Crew runs as a docker compose stack locally. See [`README.md`](./README.md) for the user-facing setup. For agents working on crew code:

- **Hot-reload is the default in worktree stacks.** Both daemon (`tsx watch`) and dashboard (vite) source-mount from the worktree, so edits are picked up without rebuild.
- **Worktree DBs are ephemeral and seeded.** `CREW_SEED_FIXTURES=1` runs `packages/daemon/seeds/dev.ts` on container start. Tests run against deterministic fixtures, not against your canonical state.
- **`<repo>/env.toml` is the source of truth for env vars** that vary per-worktree (`APP_URL`, `DAEMON_URL`, port allocator entries, `COMPOSE_PROJECT_NAME`). Always use `${VAR}` syntax, never legacy `{httpPort}`.
- **`<repo>/.claude/settings.json` declares the sandbox baseline.** `excludedCommands` lists `npm run bruno:smoke` and `npm run test:e2e` so they run un-sandboxed against the host loopback (where the worktree stack is reachable). Sandboxed `curl`/`fetch` calls to the app URL will always return ECONNREFUSED — see the agent's run-prompt sandbox-network-note section.
```

- [ ] **Step 4: Update the existing "Per-worktree docker isolation" section**

Find the existing paragraph in CLAUDE.md (it talks about per-worktree port hashing). Append:

```markdown
This rule now applies to crew itself. Crew's `docker-compose.yml` + `env.toml` use the same port-hashing convention as Recipes, so concurrent CREW-\* worktree dispatches don't collide.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claudemd): docker-based local dev, env.toml, settings.json"
```

---

### Task 19: Memory cleanup — remove the resolved preflight-opt-in slot paragraph

**Goal:** The dashboard memory entry has a paragraph that gates on "first dashboard plan that adds substantive e2e coverage." That gating condition is now resolved by this Epic. Remove the paragraph so future dashboard planning sessions don't see stale guidance.

**Files:**

- Modify: `~/.claude/projects/-home-safturento-Repos-crew/memory/dashboard_ui_brainstorm.md`

- [ ] **Step 1: Read the current memory file**

```bash
cat ~/.claude/projects/-home-safturento-Repos-crew/memory/dashboard_ui_brainstorm.md
```

You should see a paragraph that begins with `**Important — preflight self-opt-in slot:**` near the bottom. That's what gets removed.

- [ ] **Step 2: Remove the paragraph**

Edit the file to delete the entire `**Important — preflight self-opt-in slot:** ...` paragraph. Leave the rest of the memory intact.

After editing, the memory should describe the brainstorm context + design hand-off and stop there — without the now-obsolete slot guidance.

- [ ] **Step 3: Verify the file still parses (frontmatter intact)**

```bash
head -10 ~/.claude/projects/-home-safturento-Repos-crew/memory/dashboard_ui_brainstorm.md
```

Expected: the YAML frontmatter (`---` delimited block with `name`, `description`, `type`) is unchanged. Removing the paragraph shouldn't have touched the header.

(No git commit — memory files live in `~/.claude/`, not the repo.)

---

### Task 20: Final Epic verification + open the PR

**Goal:** Confirm the full Epic works end-to-end, then open the PR for review.

- [ ] **Step 1: Run the full test suite**

```bash
cd /home/safturento/Repos/crew
npm run typecheck
npm run lint
npm run test:run
```

Expected: all green. New seed tests + serve tests pass; existing tests still pass.

- [ ] **Step 2: Bring up canonical dev stack and exercise it**

```bash
docker compose --profile dev up -d --build --wait
curl -fsS http://localhost:7773/health                  # daemon direct
curl -fsS http://localhost:5173/ | head -c 200          # vite SPA
curl -fsS http://localhost:5173/api/agents              # vite proxy → daemon
npm run test:e2e                                         # 3 tests pass
docker compose down
```

All should succeed.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin <branch-name>
gh pr create --title "feat: dockerize daemon + dashboard for canonical and per-worktree stacks" --body "$(cat <<'EOF'
## Summary

Implements [docs/superpowers/specs/2026-05-04-crew-dockerization-design.md](./docs/superpowers/specs/2026-05-04-crew-dockerization-design.md).

- New `docker-compose.yml` at the repo root — daemon always-on, dashboard under `--profile dev`. Same compose drives canonical (fixed default ports) and per-worktree (hash-allocated) modes.
- New `env.toml` declaring `APP_URL`, `DAEMON_URL`, `CREW_PORT`, `CREW_VITE_PORT`, `COMPOSE_PROJECT_NAME`, `COMPOSE_PROFILES` via crew's existing materialization layer.
- New `<repo>/.claude/settings.json` — sandbox baseline + `excludedCommands` for `npm run bruno:smoke` / `npm run test:e2e`. Resolves the "first dashboard plan that adds e2e coverage" preflight self-opt-in slot.
- Updated `~/.config/crew/projects/crew.toml` with `[docker]`, `[playwright]` (+ smoke + authored), `[bruno_smoke]`, `[sandbox]` blocks.
- New `packages/daemon/seeds/dev.ts` — deterministic fixture seed for worktree DBs, gated on `CREW_SEED_FIXTURES=1` env var.
- New root `test:e2e` script delegating to `crew-dashboard` workspace.
- Updated `playwright.config.ts` to read `PLAYWRIGHT_BASE_URL` / `CREW_APP_URL` so the same suite runs against canonical-dev and worktree-stack ports.
- Updated `vite.config.ts` with `/api` proxy reading from `CREW_DAEMON_URL`.
- Updated `README.md` with Local development section + env.toml configuration guidance.
- Updated `CLAUDE.md` (project) with docker-based dev story, settings.json + env.toml notes.
- Removed the resolved preflight-opt-in slot paragraph from the dashboard memory entry.

## Test plan

- [x] `npm run typecheck` — clean
- [x] `npm run lint` — clean
- [x] `npm run test:run` — all workspaces pass (new seed tests + serve tests added)
- [x] Canonical `docker compose --profile dev up -d --build --wait` — daemon + vite up, vite proxies `/api` to daemon
- [x] Canonical `docker compose up -d --build --wait` (no profile) — daemon-only, dashboard skipped
- [x] `npm run test:e2e` against canonical-dev — 3 tests pass
- [x] Manual preflight smoke — Check 1/2/3 all pass for `crew run CREW-XX` dispatch
- [x] Worktree e2e dispatch verified — fixture-seeded daemon at hashed ports, e2e suite passes against worktree vite

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opened.

- [ ] **Step 4: Wait for review**

User merges when ready.

**Ticket F done. Epic complete.**
