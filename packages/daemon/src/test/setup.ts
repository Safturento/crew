import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The daemon's onReady hook (app.ts) attaches a chokidar watcher for the
// CLI's startup-event JSONL stream at `config.startupEventsDir`. That field
// defaults (config.ts, CREW-236) to `process.env.CREW_STARTUP_EVENTS_DIR ??
// ~/.crew/startup`, so tests that build config from a partial env object
// without naming this key inherit whatever this var points at. Left unset,
// the watcher would scan the developer's real ~/.crew/startup and — with
// chokidar's ignoreInitial:false — replay every historical <key>.jsonl
// through IngestService.onStartupFile, a burst of synchronous
// better-sqlite3 writes on the shared db connection that starves later
// app.inject calls and trips the 5s test timeout (deterministically, on any
// machine whose ~/.crew/startup is non-empty). Pin every test in this
// package at one fresh, empty temp dir as a blanket safety net so the
// watcher's initial scan is always a no-op; individual tests may still
// override via parseDaemonConfig({ CREW_STARTUP_EVENTS_DIR: ... }).
process.env.CREW_STARTUP_EVENTS_DIR = mkdtempSync(join(tmpdir(), 'crew-daemon-startup-'));

// CREW-254: same blanket safety net for the concrete state-events watcher
// (app.ts onReady, config.stateEventsDir defaulting to
// `process.env.CREW_STATE_EVENTS_DIR ?? ~/.crew/state-events`). Pin it at a
// fresh empty temp dir so the watcher's initial scan is a no-op in tests.
process.env.CREW_STATE_EVENTS_DIR = mkdtempSync(join(tmpdir(), 'crew-daemon-state-events-'));
