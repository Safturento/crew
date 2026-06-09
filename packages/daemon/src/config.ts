import { join } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';

function defaultCrewHome(): string {
  return join(homedir(), '.config', 'crew');
}

const daemonConfigSchema = z.object({
  // 0 means "let the OS pick a free port" (Node net.Server convention). Tests
  // exercise that path; production callers pass an explicit port via env.
  CREW_PORT: z.coerce.number().int().nonnegative().default(7773),
  CREW_HOST: z.string().default('127.0.0.1'),
  CREW_CONFIG_DIR: z.string().default(() => join(defaultCrewHome(), 'projects')),
  CREW_DB_FILE: z.string().default(() => join(defaultCrewHome(), 'state.db')),
  CREW_PID_FILE: z.string().default(() => join(defaultCrewHome(), 'daemon.pid')),
  CREW_LOG_FILE: z.string().default(() => join(defaultCrewHome(), 'daemon.log')),
  // Override the home dir resolveJsonlPath uses to find JSONL transcripts.
  // Default of empty string → resolver falls back to `homedir()` (the
  // canonical `~/.claude/projects/<encoded>/<session>.jsonl` location).
  // Fixture mode (CREW_SEED_FIXTURES=1) redirects to a writable sibling
  // of CREW_DB_FILE since the host's `~/.claude/projects` mount is RO.
  CREW_TRANSCRIPTS_HOME: z.string().default(''),
  // CREW-215: directory holding the host runner's `runner.log`, tailed by
  // GET /api/runner/logs. Defaults to `~/.crew/runner`; docker-compose
  // mounts ${HOME}/.crew/runner into the container at /root/.crew/runner:ro,
  // so os.homedir() == /root inside the daemon resolves to the same place.
  CREW_RUNNER_LOG_DIR: z.string().default(() => join(homedir(), '.crew', 'runner')),
  // CREW-201: directory holding the CLI's startup-event JSONL stream,
  // tailed by a chokidar watcher in app.ts onReady. Defaults to
  // `~/.crew/startup` (the path the CLI writes to); docker-compose mounts
  // ${HOME}/.crew/startup into the container at /root/.crew/startup, so
  // os.homedir() == /root inside the daemon resolves to the same place.
  // The default factory also consults process.env so the package-level
  // vitest setup (src/test/setup.ts), which pins this var to an empty temp
  // dir as a blanket watcher safety net, still flows through for tests that
  // build config from a partial env object without naming this key.
  CREW_STARTUP_EVENTS_DIR: z
    .string()
    .default(() => process.env.CREW_STARTUP_EVENTS_DIR ?? join(homedir(), '.crew', 'startup')),
});

export interface DaemonConfig {
  port: number;
  host: string;
  configDir: string;
  dbFile: string;
  pidFile: string;
  logFile: string;
  /** When set, replaces `homedir()` in transcript path resolution. */
  transcriptsHome: string | undefined;
  /** Directory holding the runner's `runner.log` (GET /api/runner/logs). */
  runnerLogDir: string;
  /** Directory holding the CLI's startup-event JSONL stream (watched on boot). */
  startupEventsDir: string;
}

/**
 * Parse and validate the daemon's runtime config from a process.env-shaped
 * record. Throws a ZodError when CREW_PORT is non-numeric or any value
 * fails validation. Defaults populate every path under `~/.config/crew/`.
 */
export function parseDaemonConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): DaemonConfig {
  const parsed = daemonConfigSchema.parse(env);
  return {
    port: parsed.CREW_PORT,
    host: parsed.CREW_HOST,
    configDir: parsed.CREW_CONFIG_DIR,
    dbFile: parsed.CREW_DB_FILE,
    pidFile: parsed.CREW_PID_FILE,
    logFile: parsed.CREW_LOG_FILE,
    transcriptsHome: parsed.CREW_TRANSCRIPTS_HOME === '' ? undefined : parsed.CREW_TRANSCRIPTS_HOME,
    runnerLogDir: parsed.CREW_RUNNER_LOG_DIR,
    startupEventsDir: parsed.CREW_STARTUP_EVENTS_DIR,
  };
}
