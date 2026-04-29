import { serve } from './serve.js';

/**
 * Boot the daemon and block until SIGINT/SIGTERM. Resolves cleanly once the
 * Fastify app has closed, leaving exit-code handling to the caller (the bin
 * entry exits 1 on rejection; the CLI's `crew daemon serve` lets the process
 * exit normally on resolution).
 */
export async function startDaemon(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const { app } = await serve(env);

  await new Promise<void>((resolve, reject) => {
    const shutdown = async (signal: string): Promise<void> => {
      app.log.info({ signal }, 'shutting down');
      try {
        await app.close();
        resolve();
      } catch (err) {
        reject(err as Error);
      }
    };
    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
  });
}
