# CREW-31 — Port `docker-list` (list running compose stacks with host port bindings)

Jira: https://safturento.atlassian.net/browse/CREW-31

## Goal

`crew docker-list` tabulates every running docker compose stack with its caddy
HTTP/HTTPS and postgres host-port bindings, plus the browser URL — porting
Recipes' `scripts/docker-list.sh` into crew so every crew-using project gets the
affordance. Output is visually consistent with `crew list` / `crew status`
(cli-table3 + picocolors).

## Relevant files

- `packages/cli/src/commands/docker-list.ts` — new command + `formatDockerListTable` renderer.
- `packages/cli/src/lib/docker/list-stacks.ts` — new collector (`collectDockerStacks`, `getHostPort`), reuses `compose.ts`.
- `packages/cli/src/lib/docker/compose.ts` — existing `listRunningProjects` / `findComposeContainer` building blocks (reused).
- `packages/cli/src/index.ts` — register `dockerListCommand`.
- `packages/shared/src/config/schema.ts` — add `caddy_service` / `postgres_service` to `[docker]`.

## Decisions

- **Flat `crew docker-list`** (option a) — mirrors `crew docker-env`; lower risk than introducing a `crew docker` namespace.
- **Service names from `[docker]` config** — added `caddy_service` (default `caddy`) and `postgres_service` (default `postgres`). Command works without a project config too, falling back to the hardcoded defaults.
- **Reuse `docker/compose.ts`** — `listRunningProjects` + `findComposeContainer` already exist and are tested; the new collector layers port lookup on top rather than re-implementing.
- **cli-table3 over fixed-width printf** — visual consistency with `crew list` outweighs literal byte-equivalence to the bash script. Missing values render as a dim em-dash (`—`) per crew convention.
- **docker-missing handling** — an `ENOENT` from `execa('docker', …)` is caught and surfaced as a clear "docker not found on PATH" error with non-zero exit.

## Notes

Reference implementation: Recipes `scripts/docker-list.sh`. Logic per project:
find caddy container → `docker port <id> 80/tcp` and `443/tcp`; find postgres
container → `docker port <id> 5432/tcp`; URL is `https://localhost[:port]` when
HTTPS is bound (`:443` → no port suffix), `—` otherwise.

Backend/CLI-only change — no dashboard, daemon route, or HTTP surface touched, so
visual-fidelity-check and Bruno endpoint authoring are not applicable (bruno:smoke
is still run as the daemon-up reachability check).
