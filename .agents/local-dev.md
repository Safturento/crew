---
name: local-dev
description: Docker stack, env.toml, worktree isolation, sandbox baseline
last_updated: 2026-06-27
covers:
  - 'docker-compose*.yml'
  - 'env.toml'
  - 'packages/daemon/src/seeds/**'
---

# Local development

Crew runs as a docker compose stack on the host: a `daemon` service (Fastify + SQLite at `/state/state.db`) and a `dashboard` service (Vite). `crew run <KEY>` brings up a per-worktree stack via [`packages/cli/src/lib/docker/start-bringup.ts`](../packages/cli/src/lib/docker/start-bringup.ts); the canonical stack is started with `docker compose up --build --wait` from the repo root. User-facing setup lives in [`README.md`](../README.md); this file captures the rules agents need when touching the stack itself.

## Hot-reload is the default

Both services source-mount from the worktree, so edits land without rebuild:

- `daemon`: `nodemon` (config in `packages/daemon/nodemon.json`). Watches `./packages/daemon/src` and `./packages/shared/src` explicitly; runs `tsx src/bin.ts`. Path-explicit watching avoids the symlink-resolution gap `tsx watch` had with workspace-package imports (e.g. cross-workspace schema changes in `crew-shared` that didn't trigger restart).
- `dashboard`: Vite dev server. Mounts `./packages/dashboard/src`.

An anonymous `node_modules` volume preserves `npm ci` output from being clobbered by the source bind-mount. **When you add a new dependency to the daemon, the stale anonymous volume shadows the new image's `node_modules`** — symptom is `sh: 1: <dep>: not found` after `docker compose up --build`. Refresh the anonymous volume without nuking the named `crew-state` volume:

```
docker compose stop daemon
docker compose rm -fv daemon       # -v removes anonymous volumes only; named volumes (crew-state) stay
docker compose up -d --build daemon
```

`docker compose down -v` would also work but it drops `crew-state` (the canonical SQLite DB). Reserve that for full resets.

## Worktree DBs are ephemeral and seeded

The canonical stack persists state at the `crew-state` named volume (`/state/state.db` inside the container). Per-worktree stacks use their own ephemeral volume and re-seed from fixtures on every bring-up.

Seeding is gated by `CREW_SEED_FIXTURES=1`. When set, the daemon runs [`packages/daemon/src/seeds/dev.ts`](../packages/daemon/src/seeds/dev.ts) at startup — deterministic project TOMLs, agents, runs, tool calls, state transitions, and a fixture JSONL transcript. Tests target these fixtures, never your canonical state. `crew run <KEY>` always exports `CREW_SEED_FIXTURES=1` for the worktree stack.

The seed runs three independent idempotent steps so a daemon reload picks up new content without a DB wipe:

- `seedFixtures(db)` — gated on `agents` being empty. Inserts agents, runs, tool_calls.
- `seedStateTransitionFixtures(db)` — gated per `agent_key`. Inserts state_transitions for the demo agent so the redesigned drawer renders ≥2 `TimelineSection` components.
- `seedTranscriptFixtures(transcriptsHome)` — gated per-file. Writes JSONL to `<transcriptsHome>/.claude/projects/<encoded-worktree>/<session>.jsonl`. Lives under the same `transcriptsHome` `resolveJsonlPath` reads, redirected by `serve.ts` to a writable sibling of the DB file (the host's `~/.claude/projects` mount is RO).

The seed dir lives under `src/` so the `tsx watch` bind-mount picks up changes without an image rebuild. When you add a fixture, edit `src/seeds/dev.ts` and bump the fixture set together with any test that depends on it. The seed file is `git`-tracked; don't write per-developer fixtures.

## Daemon bind mounts (and the single-compose-file caveat)

The `daemon` service bind-mounts several host paths read-only — registered project
TOMLs, host transcripts, the per-repo GitHub webhook secrets file
(`~/.config/crew/github-webhook-secrets.toml`, CREW-269, loaded at boot to verify
PR-merge webhook deliveries), the CLI startup-event JSONLs (`~/.crew/startup`),
the concrete state-event JSONLs (`~/.crew/state-events`, CREW-254, reduced into
`state_transitions`), and the host runner log (`~/.crew/runner`, CREW-215, tailed by
`GET /api/runner/logs`).

There is **one** `docker-compose.yml`; worktree stacks reuse it with hashed ports (see
below), so there is no per-worktree mount override. All stacks therefore bind the same
host `${HOME}/.crew/*` paths. That's intentional: there is one host runner and one
startup-/state-event stream per machine. A worktree daemon mounting `~/.crew/runner` just sees
an empty/absent log (no runner writes to it from a worktree), which the logs route
handles by returning `{ lines: [] }`. Docker auto-creates a missing bind-mount source as
an empty dir, so directory mounts are safe even before the runner has ever run.

**The webhook-secrets mount is a *file*, not a directory** — and Docker auto-creates a
missing bind-mount source as a *directory*. So the host file must exist as a file before
`docker compose up`, or the daemon will see a directory where it expects a TOML. The
loader's missing-file tolerance only covers the daemon-side absence (no mount); once the
mount exists it must point at a real file. See `docs/runbooks/github-webhook-funnel.md`
(authored in the interactive child ticket) for the operator setup.

## `env.toml` is the source of truth for per-worktree env

`<repo>/env.toml` declares orchestration variables (`COMPOSE_PROJECT_NAME`, `CREW_PORT`, `CREW_VITE_PORT`, `APP_URL`, `DAEMON_URL`, `COMPOSE_PROFILES`). `crew run` materializes this spec into a `.env` file via [`packages/cli/src/lib/env-spec/`](../packages/cli/src/lib/env-spec/), substituting per-worktree values.

Two rules:

- **`${VAR}` syntax only.** Templated values reference other keys with `${OTHER_VAR}`. Never the legacy `{httpPort}` / `{httpsPort}` / `{postgresPort}` placeholders — those still exist in `projectConfigSchema` for tracker-key-driven legacy config, but new env.toml entries use `${VAR}`.
- **No hardcoded ports in `docker-compose.yml`.** Compose reads `${CREW_PORT:-7773}` and `${CREW_VITE_PORT:-5173}` so the canonical worktree keeps default ports while worktrees get hashed ones.

## Per-worktree docker isolation

Multiple worktrees co-exist by hashing the worktree directory basename into non-default host ports:

- `md5(basename) → first 4 hex chars → offset = (hash mod 99) + 1`
- HTTP: `8000 + offset`, HTTPS: `8400 + offset`, Postgres: `15400 + offset`
- Implementation: [`packages/cli/src/lib/docker/port-hash.ts`](../packages/cli/src/lib/docker/port-hash.ts).

The canonical worktree (named in `[docker].canonical_worktree` of the project config) keeps the standard ports — its bringup short-circuits the hash step. This rule applies to crew itself: `crew-CREW-*` worktrees get hashed ports, while `crew/` (the canonical clone) gets the defaults.

`COMPOSE_PROJECT_NAME` is templated as `${BASE_NAME}-${WORKTREE_ID}` so each worktree's compose stack is namespaced and `docker compose ps` shows them distinctly.

## Sandbox baseline + `excludedCommands`

[`<repo>/.claude/settings.json`](../.claude/settings.json) declares the sandbox baseline that every `crew run` agent inherits:

- `sandbox.enabled = true`, `allowUnsandboxedCommands = false`.
- `network.allowedDomains` whitelists GitHub, npm, Atlassian, Anthropic, plus `localhost` / `127.0.0.1`.
- `filesystem.allowWrite` includes `~/.npm`, `~/.cache/{node,claude-cli,claude}`, and `/tmp`.

The `excludedCommands` glob list specifies commands that run **un-sandboxed** because they need host-loopback access to the worktree docker stack:

```
"npm run bruno:smoke*"
"npm run test:e2e*"
"docker compose*"
```

### ECONNREFUSED on sandboxed `localhost` calls is expected

Sandboxed Bash tool calls run in their own network namespace with a private loopback. A direct `curl http://localhost:PORT` / `wget` / Node `fetch` from inside a sandboxed call **will always return `ECONNREFUSED`**, even when the docker stack is healthy on the host. That is not evidence the stack is down.

The two reachability tests that **do** work against the host loopback are `npm run bruno:smoke` and `npm run test:e2e`, because both match `excludedCommands` and run un-sandboxed.

`excludedCommands` matches by leading-substring glob (`command*`). To stay matched:

- Run the bare command: `npm run test:e2e`. Trailing args (`--workspace=crew-dashboard`, pipes, redirects) are fine; they ride along inside the glob.
- **Do not wrap.** `cd <dir> && npm run …`, `sh -c "npm run …"`, and `npm --prefix <dir> run …` all defeat the prefix match and silently fall back to sandboxed execution. Use the `--workspace=` flag if you need to scope to a sub-package.

A failing `npm run test:e2e` that produces `ECONNREFUSED` while the same flow worked via Playwright MCP is the signature of a wrapper-defeated match.

## Project resolution

`crew run <KEY>` (and every other subcommand) auto-discovers which project config to use from the current working directory. The resolver is [`packages/cli/src/lib/discover-project-config.ts`](../packages/cli/src/lib/discover-project-config.ts):

1. Shell `git -C <cwd> remote get-url origin`. Parse `owner/repo` out of the URL.
2. Scan `~/.config/crew/projects/*.toml`. Return the first config whose `[github].repo` matches.
3. Return `null` if no match — subcommands fail with `no crew project config matches this repository — configure ~/.config/crew/projects/<name>.toml`.

`crew list` and `crew status` accept `--project <name>` as an opt-out for callers outside any registered repo; the other subcommands (`run`, `fix-pr`, `finish`, `resume`) still require cwd-based discovery. There is no ticket-key-prefix resolution today: a `CREW-*` invocation from inside the `recipes-app` repo will pick up the recipes-app config, not the crew config. The dashboard does not depend on cwd because it talks to the daemon's HTTP API, which receives a project name explicitly.

Future direction (hybrid `--project` + ticket-key prefix + cwd, applied uniformly across all subcommands) is captured in [`docs/rationale/project-resolution.md`](../docs/rationale/project-resolution.md). Don't add resolver behavior in code without first updating that rationale doc and this section together.

## Bringing the stack up by hand

Useful when debugging a worktree without going through `crew run`:

```bash
docker compose up --build --wait        # builds + waits for healthchecks
docker compose logs -f daemon dashboard # tails both services
docker compose down                     # stops; volumes persist
docker compose down -v                  # also drops crew-state + anonymous volumes
```

The `--wait` flag respects the daemon's healthcheck (`GET /health`); if it times out, the daemon is the problem, not the dashboard.
