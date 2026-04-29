import { pino, type Logger } from 'pino';

export type { Logger };

/**
 * Build the daemon's root logger. In dev (TTY attached) we use pino-pretty
 * for readable output; in headless contexts we emit structured JSON so the
 * daemon's `CREW_LOG_FILE` stays parseable.
 */
export function createLogger(): Logger {
  if (process.stdout.isTTY) {
    return pino({
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
      },
    });
  }
  return pino();
}
