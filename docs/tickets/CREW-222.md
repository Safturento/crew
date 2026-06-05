# CREW-222 — Runner log-dir ownership: pre-create `~/.crew/runner` host-side before compose mounts it

Jira: https://safturento.atlassian.net/browse/CREW-222

## Goal

`crew runner start` no longer fails with `EACCES: permission denied, open '~/.crew/runner/runner.log'`
on a clean machine. The host-side `~/.crew/runner` dir is created user-owned **before** Docker can
fabricate it as the container user (`nobody`) while binding the `:ro` mount.

## Root cause

`docker-compose.yml` mounts `${HOME}/.crew/runner:/root/.crew/runner:ro`. Docker auto-creates a
missing bind-mount source as the container user, so the first `docker compose up` (or `crew up`,
which orders `docker compose up -d` before `crew runner start`) creates `~/.crew/runner` owned by
`nobody`. The host runner then can't write `runner.log`. `mkdirSync(logDir, {recursive:true})`
no-ops on an existing dir, so it can't repair ownership after the fact.

## Fix

- **`lib/runner/paths.ts`** — new `ensureRunnerLogDir(env, deps?)`: creates the resolved log dir and
  reports `{ dir, writable }`. Swallows a mkdir failure (pre-existing foreign-owned dir) and lets the
  writability probe (`accessSync(dir, W_OK)`) be the signal.
- **`commands/up.ts`** — `runUp` calls an injected `ensureRunnerDir()` **before** `docker compose up -d`,
  so compose mounts an already-present, user-owned dir. Warns (non-fatal) if the dir is non-writable.
- **`lib/runner/supervisor.ts`** — `startRunner` gains an `ensureLogDir` dep; aborts with a `chown`
  remediation message (surfaced via new `StartResult.logDirError`) when the dir isn't writable, instead
  of letting the worker hit a raw EACCES. Skipped when a live runner already holds the pidfile.
- **`commands/runner.ts`** — `startAction` wires `ensureLogDir: () => ensureRunnerLogDir(env)` and prints
  `logDirError` in red with exit code 1.

## Relevant files

- `packages/cli/src/lib/runner/paths.ts` — `ensureRunnerLogDir` + `EnsureLogDir*` types
- `packages/cli/src/lib/runner/supervisor.ts` — writability guard in `startRunner`
- `packages/cli/src/commands/up.ts` — pre-create ordering in `runUp`
- `packages/cli/src/commands/runner.ts` — `startAction` wiring + error surface
- `docker-compose.yml:34` — the `:ro` runner mount (unchanged; context)

## Decisions

- **Don't attempt to chown an existing foreign-owned dir.** Repairing ownership needs `sudo`; the CLI
  can't silently do that. Instead it fails fast with a copy-pasteable `chown` command. Pre-creation
  prevents the bad state on clean machines; the guard handles the already-damaged case clearly.
- **`spawnSupervisor`'s `mkdirSync` stays.** Redundant with `ensureRunnerLogDir` on the start path, but
  it still covers a direct `crew runner __supervise` invocation, and it's cheap.

## Notes

CLI-only change — no HTTP routes, no daemon, no UI. Bruno / e2e / visual-fidelity not triggered.
