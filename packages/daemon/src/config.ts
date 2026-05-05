import { join } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';

function defaultCrewHome(): string {
  return join(homedir(), '.config', 'crew');
}

const daemonConfigSchema = z.object({
  CREW_PORT: z.coerce.number().int().positive().default(7773),
  CREW_HOST: z.string().default('127.0.0.1'),
  CREW_CONFIG_DIR: z.string().default(() => join(defaultCrewHome(), 'projects')),
  CREW_DB_FILE: z.string().default(() => join(defaultCrewHome(), 'state.db')),
  CREW_PID_FILE: z.string().default(() => join(defaultCrewHome(), 'daemon.pid')),
  CREW_LOG_FILE: z.string().default(() => join(defaultCrewHome(), 'daemon.log')),
});

export interface DaemonConfig {
  port: number;
  host: string;
  configDir: string;
  dbFile: string;
  pidFile: string;
  logFile: string;
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
  };
}
