# CREW-7 — `crew docker-env` + `crew db-clone`

Jira: https://safturento.atlassian.net/browse/CREW-7

## Goal

Two small subcommands so the precursor `docker-env.sh` / `db-clone-from-main.sh`
can be retired:

- `crew docker-env [path]` — generate the per-worktree docker `.env`. Default
  path is the current worktree. Reuses `writeDockerEnv` (already shipped in
  CREW-3) and refuses to clobber a non-generated file.
- `crew db-clone <KEY>` — clone main's postgres data into the target
  worktree's stack. Verifies both stacks are running, waits up to 60s for
  required migration tables in the target, truncates target tables, then
  pipes `pg_dump --data-only --disable-triggers` from main into psql on the
  target.

## Relevant files

- `packages/cli/src/lib/docker/env.ts` — already implements `writeDockerEnv`
- `packages/cli/src/lib/docker/compose.ts` — has `listRunningProjects`; will
  grow a `findComposeContainer(project, service)` helper for db-clone
- `packages/cli/src/commands/docker-env.ts` (new)
- `packages/cli/src/commands/db-clone.ts` (new)
- `packages/cli/src/lib/db-clone/clone.ts` (new) — the testable core that
  takes the config + key and orchestrates the docker exec calls
- `packages/cli/src/lib/config/schema.ts` — add an optional `[db_clone]`
  section so postgres service name, credentials, required tables, and
  exclude patterns aren't hardcoded

## Decisions

- **`[db_clone]` lives in the project TOML, not `[docker]`.** Postgres
  user/db/service and the project-specific table lists are only consumed by
  the clone path; keeping them in their own section avoids polluting the
  docker section that `writeDockerEnv` already uses.
- **Container lookup via `docker ps --filter label=…`.** Same pattern as
  `getStackUrl` in `compose.ts`. Avoids `docker compose -p <name>` which
  needs a `compose.yml` in cwd or a `--file` flag.
- **pg_dump → psql piped via execa stdio.** Spawn pg_dump with `stdout:
  'pipe'` and pipe its stdout into a psql process spawned with `stdin:
  pgDump.stdout`. Keeps the data streaming through Node without buffering.
- **Migration wait polls psql every 1s up to 60s.** Tests inject a
  `pollIntervalMs` and `timeoutMs` so they don't sleep for real.
- **Truncate excludes `kysely_migration*` by default.** Same patterns
  drive both the truncate exclusion and `pg_dump --exclude-table`.

## Open questions

None right now.

## Ruled out

- Cloning between two non-canonical worktrees. Spec is "main → other"; the
  config only knows the canonical name.
- Schema reconciliation. If the target has a column main has dropped, the
  data clone will fail; that's expected and out of scope.

## Notes

The bash `db-clone-from-main.sh` lives in `Recipes-App/scripts/`, not in
this repo. The acceptance criterion is "same row counts", checked manually.
