# CREW-68 — db_clone races with backend seed during bringup

Jira: https://safturento.atlassian.net/browse/CREW-68

## Goal

Crew's bringup script no longer races the project's clone step against the backend
container's own seed. When the clone step fails for any reason, the log message
reflects what actually happened instead of asserting "main's stack isn't running".

## Relevant files

- `packages/cli/src/lib/docker/start-bringup.ts` — adds `--wait` to `docker compose up`
  and replaces the misleading clone-failure message.
- `packages/cli/src/lib/docker/start-bringup.test.ts` — locks the new behavior.

## Decisions

- **`docker compose up --wait` over polling** — Compose already implements the wait
  semantics we want (services with healthchecks must reach `healthy`; services
  without one are treated as healthy when `running`). Keeps crew agnostic to the
  project's healthcheck shape.
- **Drop the "main's stack isn't running" presumption** — the bringup wrapper
  doesn't know why the project-side clone script failed; the script's own
  stderr is already in the log. Replace with a neutral "data clone failed
  (see log above for cause)".
- **Don't touch `runDbClone` internals** — the race is in the orchestrator
  above it, per ticket out-of-scope.

## Out of scope

- The Recipes-side healthcheck addition. Project-side change in a different
  repo; tracked outside this ticket. Without it, `--wait` only waits for
  services to reach `running`, which doesn't fully eliminate the race for
  Recipes specifically — but the crew-side change is correct and supports
  any project that adds a healthcheck.
- Generalizing DB replication so crew owns the lifecycle end-to-end —
  follow-up in `docs/followups.md`.
