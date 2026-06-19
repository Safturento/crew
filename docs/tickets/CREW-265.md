# CREW-265 — Don't block daemon onReady on chokidar watcher 'ready'

Jira: https://safturento.atlassian.net/browse/CREW-265

## Goal

Daemon boot must never crash because a watched dir's chokidar initial scan is
slow, contended, or hangs. The `onReady` hook used to serially `await` each
watcher's `'ready'` event (`watchStartupEvents`, `watchStateEvents`); on slow
WSL2/docker bind-mounts with multiple worktree stacks booting at once those
scans exceeded Fastify's `pluginTimeout` and crashed boot with
`AVV_ERR_READY_TIMEOUT`. PR #381 raised the timeout to 60s as a stopgap; this
removes the boot-blocking dependency entirely.

## Relevant files

- `packages/daemon/src/app.ts` — the `onReady` hook + the `pluginTimeout`
  stopgap from PR #381.
- `packages/daemon/src/services/IngestService.ts` — `watchStartupEvents` /
  `watchStateEvents` and their `once('ready')` awaits (`:199`, `:238`).
- `packages/daemon/src/services/IngestService.test.ts` — watcher tests that
  relied on `await watchStartupEvents(...)` doubling as a readiness barrier.
- `packages/daemon/src/app.test.ts` — boot tests.

## Decisions

- **Attach synchronously; expose `whenReady` separately.** `watchStartupEvents`
  / `watchStateEvents` now attach the chokidar watcher synchronously and return
  `void` — they no longer `await` `'ready'`. Readiness is exposed via
  `whenStartupWatcherReady()` / `whenStateWatcherReady()` so tests keep a
  deterministic barrier while boot never blocks. This makes the non-blocking
  property structural: the `onReady` hook calls a `void` method and has nothing
  to await.
- **`pluginTimeout` reduced back to the Fastify default (10s).** With the
  watcher-ready dependency gone, the only remaining `onReady` work is one
  in-memory-fast DB query (`ingest.start()`) plus two synchronous
  `mkdirSync`+attach calls — milliseconds, not seconds. Reverting to the default
  is preferable to keeping the 60s stopgap: a default timeout would _surface_ any
  future regression that reintroduces slow boot work rather than masking it for a
  minute.

## Ruled out

- Attaching the watchers after `app.listen()` instead of inside `onReady` —
  more moving parts (the listen path lives in `index.ts`, not `buildApp`, so the
  watcher lifecycle would straddle two files) for no extra robustness. The
  synchronous-attach approach keeps the lifecycle in one place and is just as
  non-blocking.

## Notes

Replay correctness is unaffected: the offset-tracked `add`/`change` handlers
ingest existing lines whenever the initial scan completes, regardless of whether
boot waited for `'ready'`.

Backend-only: no HTTP route, schema, or UI change, so no Bruno `.bru` or
visual-fidelity work. `npm run bruno:smoke` is still run as part of verification
(it confirms the daemon boots and serves).
