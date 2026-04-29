# CREW-37 — `crew daemon serve|start|stop|status` lifecycle commands

Jira: https://safturento.atlassian.net/browse/CREW-37

## Goal

Replace the Phase-1 stubs with real `crew daemon` lifecycle commands.
`serve` runs the daemon in the foreground (calling `startDaemon` from
`crew-daemon`); `start` spawns `serve` detached via the `bin/crew` bash
shim, writes a PID file, and returns immediately; `stop` SIGTERMs and
removes the PID file; `status` reports running/stopped/stale and cleans
stale pidfiles.

## Relevant files

- `packages/cli/package.json` — adds `crew-daemon` workspace dep.
- `packages/cli/src/commands/daemon.ts` — exports `daemonCommand` plus
  PID helpers (`readPid`, `writePid`, `removePid`, `isProcessAlive`).
  Resolves `bin/crew` from `import.meta.url` so `start` re-invokes the
  bash shim (which handles its own tsx invocation) — `process.argv[1]`
  / `process.execPath` point at tsx internals and would feed a `.ts`
  file to plain `node`.
- `packages/cli/src/commands/daemon.test.ts` — six PID-helper unit
  tests + a gated integration test (`describe.skipIf(...)`) that
  round-trips `start → status → stop` against a real spawn at port
  17773 with a tmpdir-rooted `CREW_CONFIG_DIR`.
- `packages/cli/src/index.ts` — registers `daemonCommand`.
- `packages/daemon/package.json` — adds an `exports` field so
  `import { startDaemon } from 'crew-daemon'` resolves.
- `packages/daemon/src/startDaemon.ts` — extracts the boot + signal
  wiring formerly inlined in `index.ts`'s `main()` into a reusable
  function. Resolves on clean shutdown rather than calling
  `process.exit`, so the CLI's `serve` action can return normally.
- `packages/daemon/src/index.ts` — pure barrel re-exporting
  `startDaemon`, `serve`, and the `DaemonConfig` type. Importing the
  package no longer triggers `main()` as a side effect.
- `packages/daemon/src/bin.ts` — bin entry; calls `startDaemon` and
  `process.exit(1)`s on rejection.
- `packages/daemon/bin/crew-daemon` — points at `src/bin.ts` (was
  `src/index.ts`).

## Decisions

- **Detached child writes `stdio: ['ignore', logFd, logFd]` instead of
  `'ignore'`.** The plan code used `stdio: 'ignore'`, which discards
  daemon output. Routing stdout/stderr to `CREW_LOG_FILE` matches what
  the `start` command's printed `logs: …` line promises.
- **Defaults are computed lazily inside the helpers, not captured at
  module load.** The integration test sets `CREW_CONFIG_DIR` /
  `CREW_PID_FILE` / `CREW_PORT` _after_ the test file imports
  `daemon.ts`. Reading them via getter functions means each subcommand
  picks up the env in effect at action time, including for in-process
  tests.
- **`startDaemon` lives in `packages/daemon/src/startDaemon.ts`, not
  `serve.ts`.** `serve()` already returns the listening app for
  callers that want to manage their own shutdown (e.g. tests).
  `startDaemon` is the convenience wrapper that owns SIGINT/SIGTERM
  → `app.close()` → resolution. Keeping them separate preserves
  `serve`'s test ergonomics.
- **`packages/daemon/src/bin.ts` is a separate file, not the package
  entry.** Adding `exports` to make `crew-daemon` importable as a
  library means the entry file must be free of top-level side effects.
  The bin shim now points at `bin.ts`, which exists solely to invoke
  `startDaemon`; `index.ts` is a clean barrel.
- **Stale-pidfile recovery is silent in `stop`/`status` after a brief
  notice.** Both subcommands say "stale pidfile (pid X) — cleaning
  up" and call `removePid`; they don't error. A future `start`
  invocation now succeeds without manual intervention.

## Plan reference

Task 4 of `docs/superpowers/plans/2026-04-28-daemon-bootstrap-and-projects-endpoint.md`.

## Verification

- `npm run lint` — pass.
- `npm run typecheck` — pass for all four workspaces.
- `npm run test:run` — 356 pass, 1 skipped (the gated integration
  block).
- `CREW_RUN_INTEGRATION=1 npm run test:run --workspace=crew-cli -- daemon`
  — 7/7 pass, including the lifecycle round-trip.
- `npm run format:check` — only pre-existing format warnings remain
  (none in files this ticket touches).
