---
name: commands
description: npm scripts cheatsheet with env-var notes
last_updated: 2026-05-14
covers:
  - 'package.json'
  - 'packages/*/package.json'
---

# Commands

Reference card for crew's npm scripts. Most live at the repo root (`npm run <name>` from anywhere in the worktree); a few package-only scripts need `--workspace=<name>`. Workspace names are the `name:` field of each `packages/*/package.json` (`crew-cli`, `crew-daemon`, `crew-dashboard`, `crew-shared`) — not the directory name.

## Cleanliness sweep (run before claiming work done)

```bash
npm run lint && npm run format:check && npm run typecheck && npm run test:run
```

Each step is independently safe to run, but the sweep is the contract `superpowers:verification-before-completion` expects. If any of these fail, the work is **not** done — loop back to implementation. For changes that touch HTTP routes or UI flows, append the relevant smoke run (Bruno or e2e — see below).

The sweep does **not** include `npm run build`. Crew's services run via `tsx`/`vite` rather than precompiled output for unit and smoke flows; build is only required when a package emits artifacts (`crew-dashboard`'s production bundle).

## Lint and format

| Script                 | What it does                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`         | ESLint on `packages/`, then `npm run lint:agents`. Fails on either.                                                                                                                                                       |
| `npm run lint:fix`     | ESLint with `--fix`. Skips `lint:agents` (frontmatter is hand-edited).                                                                                                                                                    |
| `npm run lint:agents`  | Runs `scripts/validate-agents-frontmatter.ts`. Asserts every `.agents/*.md` has the required frontmatter (`name`, `description`, `last_updated`, `covers`) and every `covers:` glob parses as a valid micromatch pattern. |
| `npm run format`       | Prettier `--write` on `packages/` and `docs/`.                                                                                                                                                                            |
| `npm run format:check` | Prettier `--check`. CI-style; fails if anything is unformatted.                                                                                                                                                           |

`lint:agents` is implicit in `lint`; running it on its own is useful while iterating on `.agents/<topic>.md` frontmatter.

## Tests

| Script                 | Scope                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run test`         | Vitest watch mode across every workspace (`--workspaces --if-present`). Local dev only.                                                          |
| `npm run test:run`     | One-shot Vitest run across every workspace, plus `npm run test:scripts` for `scripts/*.test.ts`. This is the script the cleanliness sweep calls. |
| `npm run test:scripts` | Vitest run scoped to `scripts/` (frontmatter validator tests, etc.).                                                                             |
| `npm run test:e2e`     | Playwright e2e against the running worktree stack. Aliased to `npm run test:e2e --workspace=crew-dashboard`.                                     |
| `npm run bruno:smoke`  | Bruno CLI run of the daemon API smoke flow. Needs `CREW_BRUNO_ENV` set (see below).                                                              |

### Bruno smoke needs `CREW_BRUNO_ENV`

```bash
CREW_BRUNO_ENV=local npm run bruno:smoke
```

The script is `cd bruno && bru run --env "$CREW_BRUNO_ENV" …`. Without the env var, the `--env` flag receives an empty string and the run fails with `environment not found`. `crew run <KEY>` dispatches export `CREW_BRUNO_ENV=crew-<KEY>` automatically and generate the matching `bruno/environments/<env>.bru`; for local dev, hand-author `bruno/environments/local.bru` with `vars { baseUrl: http://localhost:7773 }` (or your daemon port) and pass `local`.

See [`testing.md`](testing.md) for the Bruno collection layout and the same-commit rule when an HTTP route changes.

### `test:e2e` needs the worktree docker stack up

Playwright has no `webServer` block — it expects the worktree's docker stack to already be serving on `APP_URL`. If it isn't, bring it up with `docker compose up --build --wait` from the worktree root. The dispatched-agent context has the stack already up.

`test:e2e` and `bruno:smoke` are the **only** test commands whitelisted to run un-sandboxed (they need host loopback). Wrappers (`cd <dir> &&`, `sh -c`, `npm --prefix`) defeat the whitelist match and the wrapped command silently falls back to sandboxed execution, producing `ECONNREFUSED`. Run the bare commands; the `--workspace=` flag and trailing pipes ride along inside the glob. See [`local-dev.md`](local-dev.md) for the full sandbox model.

## Build

| Script              | What it does                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm run build`     | `npm run build --workspaces --if-present`. Today only `crew-dashboard` emits artifacts (`tsc` + `vite build`).       |
| `npm run typecheck` | `tsc -p tsconfig.json` in every workspace with the script. Cheaper than `build` and what the cleanliness sweep runs. |

## Per-package dev scripts

Not exposed at root — invoke with `--workspace=<name>`:

```bash
npm run dev --workspace=crew-daemon      # tsx watch on src/bin.ts
npm run dev --workspace=crew-dashboard   # vite dev server
npm run start --workspace=crew-daemon    # one-shot tsx (no watch)
npm run preview --workspace=crew-dashboard  # vite preview (built bundle)
```

These run on the host, outside docker. Use them when iterating on a single service without the stack — but note that the dashboard talks to the daemon, so you'll usually want both up (either both via these scripts or via `docker compose up`).

## Docker stack

```bash
docker compose up --build --wait    # builds + waits for /health
docker compose logs -f daemon dashboard
docker compose down                 # stops; named volume persists
docker compose down -v              # also drops crew-state + anonymous volumes
```

`crew run <KEY>` brings up a per-worktree stack with hashed ports; these commands operate on the canonical stack (default ports `7773` daemon, `5173` dashboard). The `--wait` flag respects the daemon's healthcheck — a timeout means the daemon is the problem, not the dashboard. See [`local-dev.md`](local-dev.md) for `env.toml` materialization and worktree isolation.

## Other root scripts

| Script                     | What it does                                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run baseline:capture` | Runs the baseline metrics capture script inside the daemon container (`docker compose run --rm`). Used by the agent-tracking baseline workflow. |

## See also

- [`testing.md`](testing.md) — Bruno + Playwright + daemon fixture seeding details.
- [`local-dev.md`](local-dev.md) — sandbox baseline, `ECONNREFUSED` gotcha, worktree env materialization.
- [`dispatch.md`](dispatch.md) — what `crew run` sets up before agent commands execute.
