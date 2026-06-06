import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The daemon's onReady hook (app.ts) attaches a chokidar watcher for the
// CLI's startup-event JSONL stream, defaulting to ~/.crew/startup when
// the env var is unset. Under vitest that would scan the developer's real
// ~/.crew/startup and — with chokidar's ignoreInitial:false — replay
// every historical <key>.jsonl through IngestService.onStartupFile, a
// burst of synchronous better-sqlite3 writes on the shared db connection
// that starves later app.inject calls and trips the 5s test timeout
// (deterministically, on any machine whose ~/.crew/startup is non-empty).
// Pin every test in this package at one fresh, empty temp dir so the
// watcher's initial scan is always a no-op.
process.env.CREW_STARTUP_EVENTS_DIR = mkdtempSync(join(tmpdir(), 'crew-daemon-startup-'));
